import os
import uuid
from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Reimbursement, ReimbursementStatus, Employee
from server.schemas.reimbursement import ReimbursementOut, ReimbursementReview
from server.utils.logger import log_info, log_warning

router = APIRouter(prefix="/reimbursements", tags=["Reimbursements"])

# Storage directory for receipts (kept outside public static web roots)
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../uploads/reimbursements"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


def validate_file_content(file_bytes: bytes, filename: str, content_type: str) -> str:
    """Validates file magic bytes and extension against allowed types."""
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds the 5MB limit."
        )

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension '{ext}'. Only PDF, JPG, JPEG, and PNG are allowed."
        )

    # Magic byte sniffing
    detected_mime = None
    if file_bytes.startswith(b"%PDF"):
        detected_mime = "application/pdf"
    elif file_bytes.startswith(b"\xff\xd8\xff"):
        detected_mime = "image/jpeg"
    elif file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        detected_mime = "image/png"

    if not detected_mime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match an allowed format (PDF, JPG, PNG)."
        )

    return detected_mime


@router.post("", response_model=ReimbursementOut, status_code=status.HTTP_201_CREATED)
async def create_reimbursement(
    amount: Decimal = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    receipt: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Submits a new reimbursement request with receipt attachment.
    Enforces strict MIME validation, size limit, and randomized safe storage.
    """
    if amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Reimbursement amount must be greater than zero.")

    # Read and validate receipt bytes
    file_bytes = await receipt.read()
    detected_mime = validate_file_content(file_bytes, receipt.filename or "receipt", receipt.content_type or "")

    # Generate safe random filename to prevent collisions and path traversal
    file_ext = ALLOWED_MIME_TYPES.get(detected_mime, ".bin")
    safe_stored_name = f"{uuid.uuid4().hex}_{current_user.employee_id}{file_ext}"
    storage_path = os.path.join(UPLOAD_DIR, safe_stored_name)

    # Write file securely
    with open(storage_path, "wb") as f:
        f.write(file_bytes)

    # Sanitize user filename for display
    clean_original_filename = os.path.basename(receipt.filename or f"receipt{file_ext}")

    claim = Reimbursement(
        employee_id=current_user.employee_id,
        amount=amount,
        category=category,
        description=description,
        receipt_filename=clean_original_filename,
        receipt_mimetype=detected_mime,
        receipt_storage_path=safe_stored_name,
        status=ReimbursementStatus.PENDING,
        created_at=datetime.utcnow()
    )
    db.add(claim)
    await db.commit()
    await db.refresh(claim)

    log_info(
        "REIMBURSEMENT",
        "CLAIM_SUBMITTED",
        f"Reimbursement claim #{claim.reimbursement_id} of Rs. {float(amount):,.2f} ({category}) submitted by {current_user.name}.",
        claim_id=claim.reimbursement_id,
        employee_id=current_user.employee_code or str(current_user.employee_id),
        amount=str(amount),
        category=category
    )

    return ReimbursementOut(
        reimbursement_id=claim.reimbursement_id,
        employee_id=claim.employee_id,
        employee_name=current_user.name,
        amount=claim.amount,
        category=claim.category,
        description=claim.description,
        receipt_filename=claim.receipt_filename,
        receipt_mimetype=claim.receipt_mimetype,
        status=claim.status,
        payroll_id=claim.payroll_id,
        reviewer_comments=claim.reviewer_comments,
        reviewed_by_name=None,
        created_at=claim.created_at,
        reviewed_at=claim.reviewed_at
    )


@router.get("/my", response_model=List[ReimbursementOut])
async def my_reimbursements(
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """Returns the logged-in employee's reimbursement history."""
    stmt = (
        select(Reimbursement)
        .options(joinedload(Reimbursement.employee), joinedload(Reimbursement.reviewer))
        .where(Reimbursement.employee_id == current_user.employee_id)
        .order_by(Reimbursement.created_at.desc())
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        ReimbursementOut(
            reimbursement_id=r.reimbursement_id,
            employee_id=r.employee_id,
            employee_name=r.employee.name if r.employee else "Unknown",
            amount=r.amount,
            category=r.category,
            description=r.description,
            receipt_filename=r.receipt_filename,
            receipt_mimetype=r.receipt_mimetype,
            status=r.status,
            payroll_id=r.payroll_id,
            reviewer_comments=r.reviewer_comments,
            reviewed_by_name=r.reviewer.name if r.reviewer else None,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at
        )
        for r in records
    ]


@router.get("", response_model=List[ReimbursementOut])
async def list_reimbursements(
    status_filter: Optional[str] = Query(None, alias="status"),
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Lists all reimbursement requests with optional filtering (Admin only)."""
    stmt = (
        select(Reimbursement)
        .options(joinedload(Reimbursement.employee), joinedload(Reimbursement.reviewer))
    )
    if status_filter:
        stmt = stmt.where(Reimbursement.status == status_filter)
    if employee_id:
        stmt = stmt.where(Reimbursement.employee_id == employee_id)

    stmt = stmt.order_by(Reimbursement.created_at.desc())
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        ReimbursementOut(
            reimbursement_id=r.reimbursement_id,
            employee_id=r.employee_id,
            employee_name=r.employee.name if r.employee else "Unknown",
            amount=r.amount,
            category=r.category,
            description=r.description,
            receipt_filename=r.receipt_filename,
            receipt_mimetype=r.receipt_mimetype,
            status=r.status,
            payroll_id=r.payroll_id,
            reviewer_comments=r.reviewer_comments,
            reviewed_by_name=r.reviewer.name if r.reviewer else None,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at
        )
        for r in records
    ]


@router.put("/{reimbursement_id}/approve", response_model=ReimbursementOut)
async def approve_reimbursement(
    reimbursement_id: int,
    payload: ReimbursementReview,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Approves a reimbursement claim for inclusion in next payroll (Admin only)."""
    stmt = (
        select(Reimbursement)
        .options(joinedload(Reimbursement.employee))
        .where(Reimbursement.reimbursement_id == reimbursement_id)
    )
    res = await db.execute(stmt)
    claim = res.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Reimbursement not found")

    if claim.status not in (ReimbursementStatus.PENDING, ReimbursementStatus.REJECTED):
        raise HTTPException(status_code=400, detail="Cannot alter an already processed or paid reimbursement.")

    claim.status = ReimbursementStatus.APPROVED
    claim.reviewed_by = admin.employee_id
    claim.reviewer_comments = payload.reviewer_comments
    claim.reviewed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(claim)

    log_info(
        "REIMBURSEMENT",
        "CLAIM_APPROVED",
        f"Reimbursement #{claim.reimbursement_id} (Rs. {float(claim.amount):,.2f}) approved by {admin.name}.",
        claim_id=claim.reimbursement_id,
        amount=str(claim.amount),
        admin_id=admin.employee_code or str(admin.employee_id)
    )

    return ReimbursementOut(
        reimbursement_id=claim.reimbursement_id,
        employee_id=claim.employee_id,
        employee_name=claim.employee.name if claim.employee else "Unknown",
        amount=claim.amount,
        category=claim.category,
        description=claim.description,
        receipt_filename=claim.receipt_filename,
        receipt_mimetype=claim.receipt_mimetype,
        status=claim.status,
        payroll_id=claim.payroll_id,
        reviewer_comments=claim.reviewer_comments,
        reviewed_by_name=admin.name,
        created_at=claim.created_at,
        reviewed_at=claim.reviewed_at
    )


@router.put("/{reimbursement_id}/reject", response_model=ReimbursementOut)
async def reject_reimbursement(
    reimbursement_id: int,
    payload: ReimbursementReview,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Rejects a reimbursement claim with mandatory reviewer comments (Admin only)."""
    stmt = (
        select(Reimbursement)
        .options(joinedload(Reimbursement.employee))
        .where(Reimbursement.reimbursement_id == reimbursement_id)
    )
    res = await db.execute(stmt)
    claim = res.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Reimbursement not found")

    if claim.status == ReimbursementStatus.PAID:
        raise HTTPException(status_code=400, detail="Cannot reject an already paid reimbursement.")

    claim.status = ReimbursementStatus.REJECTED
    claim.reviewed_by = admin.employee_id
    claim.reviewer_comments = payload.reviewer_comments or "Rejected by administrator."
    claim.reviewed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(claim)

    log_info(
        "REIMBURSEMENT",
        "CLAIM_REJECTED",
        f"Reimbursement #{claim.reimbursement_id} rejected by {admin.name}. Reason: {claim.reviewer_comments}",
        claim_id=claim.reimbursement_id,
        admin_id=admin.employee_code or str(admin.employee_id)
    )

    return ReimbursementOut(
        reimbursement_id=claim.reimbursement_id,
        employee_id=claim.employee_id,
        employee_name=claim.employee.name if claim.employee else "Unknown",
        amount=claim.amount,
        category=claim.category,
        description=claim.description,
        receipt_filename=claim.receipt_filename,
        receipt_mimetype=claim.receipt_mimetype,
        status=claim.status,
        payroll_id=claim.payroll_id,
        reviewer_comments=claim.reviewer_comments,
        reviewed_by_name=admin.name,
        created_at=claim.created_at,
        reviewed_at=claim.reviewed_at
    )


@router.get("/{reimbursement_id}/document")
async def get_reimbursement_document(
    reimbursement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Secure document streaming endpoint.
    Prevents public URL exposure and strictly validates employee ownership or admin role.
    """
    stmt = select(Reimbursement).where(Reimbursement.reimbursement_id == reimbursement_id)
    res = await db.execute(stmt)
    claim = res.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Reimbursement record not found")

    # Access control
    if current_user.role != "admin" and current_user.employee_id != claim.employee_id:
        raise HTTPException(status_code=403, detail="Access denied to this document.")

    safe_path = os.path.join(UPLOAD_DIR, os.path.basename(claim.receipt_storage_path))
    if not os.path.exists(safe_path):
        raise HTTPException(status_code=404, detail="Receipt document not found on storage server.")

    return FileResponse(
        path=safe_path,
        media_type=claim.receipt_mimetype,
        filename=claim.receipt_filename
    )
