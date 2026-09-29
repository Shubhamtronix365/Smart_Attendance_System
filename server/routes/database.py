import time
import io
import csv
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.database.connection import get_db
from server.dependencies.auth import require_admin, verify_password
from server.models import Employee

router = APIRouter(prefix="/database", tags=["Database Explorer"])

VAULT_SCOPE = "database_vault"
VAULT_EXPIRATION_MINUTES = 30

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class PasswordVerifyRequest(BaseModel):
    password: str = Field(..., description="Administrator account password to unlock the database explorer")

class QueryRunRequest(BaseModel):
    query: str = Field(..., description="SQL SELECT query to execute in read-only mode")

# ─── Vault Authorization Dependency ───────────────────────────────────────────

def create_vault_token(admin_email: str) -> str:
    """Generates a short-lived token confirming admin re-authenticated with their password."""
    expire = datetime.utcnow() + timedelta(minutes=VAULT_EXPIRATION_MINUTES)
    payload = {
        "sub": admin_email,
        "scope": VAULT_SCOPE,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

async def require_database_vault(
    current_admin: Employee = Depends(require_admin),
    x_vault_token: Optional[str] = Header(None, alias="X-Vault-Token")
) -> Employee:
    """
    Requires the user to be an active admin AND provide a valid elevated vault token
    obtained via the password verification challenge.
    """
    if not x_vault_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Database vault is locked. Administrator password verification required."
        )

    try:
        payload = jwt.decode(x_vault_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("scope") != VAULT_SCOPE:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid vault token scope.")
        if payload.get("sub") != current_admin.email:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vault token does not match current admin.")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vault session expired. Please re-enter your administrator password."
        )

    return current_admin


# ─── Verification & Unlock Endpoint ──────────────────────────────────────────

@router.post("/verify-access")
async def verify_database_access(
    payload: PasswordVerifyRequest,
    current_admin: Employee = Depends(require_admin)
):
    """
    Challenge endpoint: Verifies admin password before granting elevated access
    to raw database tables.
    """
    if not current_admin.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin account does not have a valid password hash configured."
        )

    is_valid = verify_password(payload.password, current_admin.hashed_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect administrator password. Access to database vault denied."
        )

    vault_token = create_vault_token(current_admin.email)
    return {
        "success": True,
        "message": "Administrator credentials verified. Database vault unlocked.",
        "vault_token": vault_token,
        "expires_in_minutes": VAULT_EXPIRATION_MINUTES,
        "admin_name": current_admin.name,
        "admin_email": current_admin.email
    }


# ─── Database Overview & Catalog ──────────────────────────────────────────────

@router.get("/overview")
async def get_database_overview(
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_database_vault)
):
    """
    Returns NeonDB/PostgreSQL connection metadata, version, total database size,
    and a list of all public tables with live row counts and storage metrics.
    """
    # 1. PostgreSQL Version
    ver_res = await db.execute(text("SELECT version();"))
    pg_version = ver_res.scalar() or "Unknown"

    # 2. Database Name & Size
    db_meta = await db.execute(text("""
        SELECT 
            current_database() AS db_name,
            pg_size_pretty(pg_database_size(current_database())) AS db_size,
            pg_database_size(current_database()) AS db_size_bytes;
    """))
    db_row = db_meta.mappings().one_or_none()
    db_name = db_row["db_name"] if db_row else "postgres"
    db_size = db_row["db_size"] if db_row else "N/A"
    db_size_bytes = db_row["db_size_bytes"] if db_row else 0

    # 3. Connection Provider info (Neon detection)
    is_neon = "neon" in settings.DATABASE_URL.lower()
    host_match = re.search(r"@([^:/]+)", settings.DATABASE_URL)
    raw_host = host_match.group(1) if host_match else "localhost"
    masked_host = raw_host[:4] + "***" + raw_host[-10:] if len(raw_host) > 14 else raw_host

    # 4. Fetch list of public tables with row counts and sizes
    tables_query = text("""
        SELECT 
            t.table_name,
            COALESCE(s.n_live_tup, 0) AS estimated_rows,
            pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) AS table_size,
            pg_total_relation_size(quote_ident(t.table_name)) AS table_size_bytes
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
        WHERE t.table_schema = 'public' 
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name;
    """)
    t_res = await db.execute(tables_query)
    tables_list = []
    total_records = 0

    for r in t_res.mappings().all():
        t_name = r["table_name"]
        # Exact count query for accuracy
        try:
            cnt_res = await db.execute(text(f'SELECT count(*) FROM "{t_name}";'))
            exact_count = cnt_res.scalar() or 0
        except Exception:
            exact_count = r["estimated_rows"]

        total_records += exact_count
        tables_list.append({
            "table_name": t_name,
            "row_count": exact_count,
            "size": r["table_size"],
            "size_bytes": r["table_size_bytes"]
        })

    return {
        "status": "connected",
        "provider": "Neon PostgreSQL Serverless" if is_neon else "PostgreSQL",
        "database_name": db_name,
        "database_size": db_size,
        "database_size_bytes": db_size_bytes,
        "host": masked_host,
        "version": pg_version,
        "total_tables": len(tables_list),
        "total_records": total_records,
        "tables": tables_list,
        "server_time": datetime.utcnow().isoformat() + "Z"
    }


# ─── Table Schema Inspector ───────────────────────────────────────────────────

@router.get("/tables/{table_name}/schema")
async def get_table_schema(
    table_name: str,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_database_vault)
):
    """
    Returns column names, SQL data types, nullability, defaults, and primary key status
    for a specific table.
    """
    # Validate table name strictly against SQL injection
    if not re.match(r"^[a-zA-Z0-9_]+$", table_name):
        raise HTTPException(status_code=400, detail="Invalid table identifier.")

    # Check existence
    chk = await db.execute(
        text("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name = :t"),
        {"t": table_name}
    )
    if not chk.scalar():
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' does not exist in public schema.")

    # Get Primary Keys
    pk_query = text("""
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = :t 
          AND tc.constraint_type = 'PRIMARY KEY';
    """)
    pk_res = await db.execute(pk_query, {"t": table_name})
    pk_cols = set(pk_res.scalars().all())

    # Get Columns
    col_query = text("""
        SELECT 
            column_name, 
            data_type, 
            is_nullable, 
            column_default,
            character_maximum_length,
            ordinal_position
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = :t
        ORDER BY ordinal_position;
    """)
    cols_res = await db.execute(col_query, {"t": table_name})
    columns = []
    for c in cols_res.mappings().all():
        columns.append({
            "name": c["column_name"],
            "type": c["data_type"],
            "is_nullable": c["is_nullable"] == "YES",
            "is_primary_key": c["column_name"] in pk_cols,
            "default": c["column_default"],
            "max_length": c["character_maximum_length"],
            "position": c["ordinal_position"]
        })

    return {
        "table_name": table_name,
        "columns_count": len(columns),
        "primary_keys": list(pk_cols),
        "columns": columns
    }


# ─── Table Data Explorer (Paginated, Searchable, Sortable) ─────────────────────

@router.get("/tables/{table_name}/data")
async def get_table_data(
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=5, le=100),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_dir: Optional[str] = Query("asc"),
    reveal_secrets: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_database_vault)
):
    """
    Retrieves records from any public table with server-side pagination, searching,
    column sorting, and automatic masking of sensitive password hashes.
    """
    if not re.match(r"^[a-zA-Z0-9_]+$", table_name):
        raise HTTPException(status_code=400, detail="Invalid table identifier.")

    # 1. Fetch column metadata
    col_res = await db.execute(
        text("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name = :t ORDER BY ordinal_position;"),
        {"t": table_name}
    )
    cols = col_res.mappings().all()
    if not cols:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")

    col_names = [c["column_name"] for c in cols]
    text_cols = [c["column_name"] for c in cols if c["data_type"] in ("character varying", "text", "character")]

    # 2. Build WHERE clause for search
    where_clauses = []
    params: Dict[str, Any] = {"limit": page_size, "offset": (page - 1) * page_size}

    if search and search.strip() and text_cols:
        search_terms = []
        for idx, col in enumerate(text_cols):
            param_key = f"srch_{idx}"
            search_terms.append(f'CAST("{col}" AS text) ILIKE :{param_key}')
            params[param_key] = f"%{search.strip()}%"
        where_clauses.append(f"({' OR '.join(search_terms)})")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # 3. Total Count
    count_sql = f'SELECT count(*) FROM "{table_name}" {where_sql};'
    count_res = await db.execute(text(count_sql), params)
    total_records = count_res.scalar() or 0

    # 4. Build ORDER BY
    order_sql = ""
    if sort_by and sort_by in col_names:
        dir_clean = "DESC" if sort_dir and sort_dir.lower() == "desc" else "ASC"
        order_sql = f'ORDER BY "{sort_by}" {dir_clean}'
    elif "created_at" in col_names:
        order_sql = 'ORDER BY "created_at" DESC'
    elif col_names:
        # Default sort by first column (usually ID)
        order_sql = f'ORDER BY "{col_names[0]}" ASC'

    # 5. Fetch Rows
    select_sql = f'SELECT * FROM "{table_name}" {where_sql} {order_sql} LIMIT :limit OFFSET :offset;'
    rows_res = await db.execute(text(select_sql), params)
    raw_rows = rows_res.mappings().all()

    # Format rows for JSON serialization and safety
    formatted_rows = []
    for r in raw_rows:
        row_dict = dict(r)
        for k, v in row_dict.items():
            # Mask sensitive passwords unless explicitly unmasked
            if not reveal_secrets and ("password" in k.lower() or "secret" in k.lower()):
                if v:
                    row_dict[k] = "•••••••• [Masked]"
            elif isinstance(v, (datetime,)):
                row_dict[k] = v.isoformat()
            elif hasattr(v, "__str__") and not isinstance(v, (int, float, bool, type(None))):
                row_dict[k] = str(v)
        formatted_rows.append(row_dict)

    return {
        "table_name": table_name,
        "total": total_records,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_records + page_size - 1) // page_size if total_records > 0 else 1,
        "columns": [dict(c) for c in cols],
        "rows": formatted_rows
    }


# ─── Safe SQL Query Console (Read-Only) ───────────────────────────────────────

@router.post("/query")
async def execute_custom_query(
    payload: QueryRunRequest,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_database_vault)
):
    """
    Executes a custom SELECT query entered by the administrator.
    Strictly enforces read-only mode to prevent any database modifications.
    """
    clean_query = payload.query.strip().rstrip(";")

    # Security check: Must start with SELECT or WITH
    if not re.match(r"^(SELECT|WITH)\s", clean_query, re.IGNORECASE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only read-only SELECT and WITH statements are permitted in this console."
        )

    # Disallow destructive or schema-altering keywords
    forbidden = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
        "GRANT", "REVOKE", "CREATE", "EXECUTE", "REPLACE", "MERGE"
    ]
    for word in forbidden:
        pattern = rf"\b{word}\b"
        if re.search(pattern, clean_query, re.IGNORECASE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation '{word}' is strictly prohibited. The database console is read-only."
            )

    # Enforce a max row limit if none provided
    if not re.search(r"\bLIMIT\s+\d+\b", clean_query, re.IGNORECASE):
        clean_query += " LIMIT 100"

    start_time = time.time()
    try:
        res = await db.execute(text(clean_query))
        rows_mappings = res.mappings().all()
        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        columns = list(rows_mappings[0].keys()) if rows_mappings else []
        rows = []
        for r in rows_mappings:
            item = dict(r)
            for k, v in item.items():
                if isinstance(v, (datetime,)):
                    item[k] = v.isoformat()
                elif hasattr(v, "__str__") and not isinstance(v, (int, float, bool, type(None))):
                    item[k] = str(v)
            rows.append(item)

        return {
            "success": True,
            "query": clean_query,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "execution_time_ms": elapsed_ms
        }
    except Exception as exc:
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SQL Execution Error: {str(exc)}"
        )


# ─── Table CSV Export ─────────────────────────────────────────────────────────

@router.get("/tables/{table_name}/export")
async def export_table_csv(
    table_name: str,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_database_vault)
):
    """
    Streams the entire table content as a downloadable CSV file.
    """
    if not re.match(r"^[a-zA-Z0-9_]+$", table_name):
        raise HTTPException(status_code=400, detail="Invalid table identifier.")

    res = await db.execute(text(f'SELECT * FROM "{table_name}";'))
    rows = res.mappings().all()

    if not rows:
        output = io.StringIO()
        output.write("No data in table\n")
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={table_name}.csv"}
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()

    for r in rows:
        d = dict(r)
        # Mask password hashes in export for security
        for k in d:
            if "password" in k.lower() or "secret" in k.lower():
                d[k] = "[MASKED_HASH]"
            elif isinstance(d[k], datetime):
                d[k] = d[k].isoformat()
            elif d[k] is not None:
                d[k] = str(d[k])
        writer.writerow(d)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={table_name}.csv"}
    )
