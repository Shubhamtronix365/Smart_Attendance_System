import calendar as py_calendar
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import get_current_user, require_admin
from server.models import Holiday, Employee
from server.schemas.holiday import HolidayCreate, HolidayUpdate, HolidayOut
from server.utils.logger import log_info, log_warning

router = APIRouter(prefix="/holidays", tags=["Company Holidays"])


@router.get("", response_model=List[HolidayOut])
async def list_holidays(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000),
    company_name: Optional[str] = Query(None, description="Filter by company name or leave empty for all"),
    include_sundays: bool = Query(False, description="Include all Sundays as fixed company holidays"),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Lists company holidays. Available to all authenticated employees and administrators.
    Supports filtering by month and year for calendar views.
    Optionally synthesizes all Sundays as fixed weekly holidays.
    """
    stmt = select(Holiday)
    if month:
        stmt = stmt.where(extract("month", Holiday.date) == month)
    if year:
        stmt = stmt.where(extract("year", Holiday.date) == year)
    if company_name and company_name.lower() not in ("all", "*"):
        stmt = stmt.where(Holiday.company_name.in_([company_name, "All", "Default"]))

    stmt = stmt.order_by(Holiday.date.asc())
    res = await db.execute(stmt)
    db_holidays = list(res.scalars().all())

    if not include_sundays:
        return db_holidays

    # Synthesize Sundays as fixed holidays
    existing_dates = set(h.date for h in db_holidays)
    current_dt = date.today()
    target_year = year or current_dt.year
    months_to_check = [month] if month else list(range(1, 13))

    synthesized: List[HolidayOut] = []
    for m in months_to_check:
        num_days = py_calendar.monthrange(target_year, m)[1]
        for day in range(1, num_days + 1):
            d = date(target_year, m, day)
            if d.weekday() == 6 and d not in existing_dates:
                synthesized.append(
                    HolidayOut(
                        holiday_id=-d.toordinal(),
                        name="Sunday (Weekly Off)",
                        date=d,
                        description="Fixed weekly company holiday (Non-working day / Record only)",
                        holiday_type="Fixed Holiday",
                        company_name=company_name or "All",
                        is_fixed=True,
                        created_at=datetime.utcnow()
                    )
                )

    combined = [HolidayOut.model_validate(h) for h in db_holidays] + synthesized
    combined.sort(key=lambda x: x.date)
    return combined


@router.get("/upcoming", response_model=List[HolidayOut])
async def list_upcoming_holidays(
    limit: int = Query(5, ge=1, le=20),
    company_name: Optional[str] = Query(None, description="Filter by company or leave empty for all"),
    include_sundays: bool = Query(False, description="Include Sundays in upcoming holidays"),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    """
    Returns upcoming company holidays from today onwards.
    """
    today = date.today()
    stmt = select(Holiday).where(Holiday.date >= today)
    if company_name and company_name.lower() not in ("all", "*"):
        stmt = stmt.where(Holiday.company_name.in_([company_name, "All", "Default"]))
    stmt = stmt.order_by(Holiday.date.asc()).limit(limit)
    res = await db.execute(stmt)
    db_holidays = list(res.scalars().all())

    if not include_sundays:
        return db_holidays

    existing_dates = set(h.date for h in db_holidays)
    from datetime import timedelta
    synthesized: List[HolidayOut] = []
    # Check next 60 days for Sundays
    curr = today
    for _ in range(60):
        if curr.weekday() == 6 and curr not in existing_dates:
            synthesized.append(
                HolidayOut(
                    holiday_id=-curr.toordinal(),
                    name="Sunday (Weekly Off)",
                    date=curr,
                    description="Fixed weekly company holiday (Non-working day / Record only)",
                    holiday_type="Fixed Holiday",
                    company_name=company_name or "All",
                    is_fixed=True,
                    created_at=datetime.utcnow()
                )
            )
        curr += timedelta(days=1)

    combined = [HolidayOut.model_validate(h) for h in db_holidays] + synthesized
    combined.sort(key=lambda x: x.date)
    return combined[:limit]


@router.post("/seed-sundays", status_code=status.HTTP_201_CREATED)
async def seed_sundays(
    year: int = Query(..., ge=2000, le=2100),
    company_name: str = Query("Default"),
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Seeds all Sundays of a given year into the database as company holidays (Admin only).
    Skips any Sundays that already exist in the database for the given company.
    """
    # Find existing holidays for this year and company
    stmt = select(Holiday.date).where(
        and_(
            extract("year", Holiday.date) == year,
            Holiday.company_name == company_name
        )
    )
    res = await db.execute(stmt)
    existing_dates = set(r[0] for r in res.all())

    created_count = 0
    for m in range(1, 13):
        num_days = py_calendar.monthrange(year, m)[1]
        for day in range(1, num_days + 1):
            d = date(year, m, day)
            if d.weekday() == 6 and d not in existing_dates:
                holiday = Holiday(
                    name="Sunday (Weekly Off)",
                    date=d,
                    description="Fixed weekly company holiday (Non-working day / Record only)",
                    holiday_type="Weekly Off",
                    company_name=company_name
                )
                db.add(holiday)
                existing_dates.add(d)
                created_count += 1

    if created_count > 0:
        await db.commit()

    log_info(
        "HOLIDAY",
        "SUNDAYS_SEEDED",
        f"Admin {admin.name} seeded {created_count} Sunday holidays for year {year} ({company_name}).",
        year=year,
        created_count=created_count,
        admin_id=admin.employee_code or str(admin.employee_id)
    )

    return {
        "success": True,
        "year": year,
        "company_name": company_name,
        "seeded_count": created_count,
        "message": f"Successfully registered {created_count} Sundays as fixed holidays for {year}."
    }


@router.post("", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    payload: HolidayCreate,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """
    Adds a new company holiday. Enforces duplicate entry prevention for same date & company.
    Admin only.
    """
    # Check for duplicate entry on same date & company
    dup_stmt = select(Holiday).where(
        and_(
            Holiday.date == payload.date,
            Holiday.company_name == payload.company_name
        )
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A company holiday on {payload.date} for '{payload.company_name}' already exists."
        )

    holiday = Holiday(
        name=payload.name,
        date=payload.date,
        description=payload.description,
        holiday_type=payload.holiday_type,
        company_name=payload.company_name
    )
    db.add(holiday)
    await db.commit()
    await db.refresh(holiday)

    log_info(
        "HOLIDAY",
        "HOLIDAY_CREATED",
        f"Company holiday '{holiday.name}' ({holiday.date}) added by {admin.name}.",
        holiday_id=holiday.holiday_id,
        name=holiday.name,
        date=str(holiday.date),
        admin_id=admin.employee_code or str(admin.employee_id)
    )

    return holiday


@router.put("/{holiday_id}", response_model=HolidayOut)
async def update_holiday(
    holiday_id: int,
    payload: HolidayUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Updates a company holiday (Admin only)."""
    stmt = select(Holiday).where(Holiday.holiday_id == holiday_id)
    res = await db.execute(stmt)
    holiday = res.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    # If updating date or company, check duplicate
    new_date = payload.date or holiday.date
    new_company = payload.company_name or holiday.company_name
    if new_date != holiday.date or new_company != holiday.company_name:
        dup_stmt = select(Holiday).where(
            and_(
                Holiday.date == new_date,
                Holiday.company_name == new_company,
                Holiday.holiday_id != holiday_id
            )
        )
        dup_res = await db.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A holiday already exists on {new_date} for company '{new_company}'."
            )

    if payload.name is not None:
        holiday.name = payload.name
    if payload.date is not None:
        holiday.date = payload.date
    if payload.description is not None:
        holiday.description = payload.description
    if payload.holiday_type is not None:
        holiday.holiday_type = payload.holiday_type
    if payload.company_name is not None:
        holiday.company_name = payload.company_name

    await db.commit()
    await db.refresh(holiday)
    return holiday


@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Employee = Depends(require_admin)
):
    """Deletes a company holiday (Admin only)."""
    stmt = select(Holiday).where(Holiday.holiday_id == holiday_id)
    res = await db.execute(stmt)
    holiday = res.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    await db.delete(holiday)
    await db.commit()

    log_info(
        "HOLIDAY",
        "HOLIDAY_DELETED",
        f"Company holiday #{holiday_id} ('{holiday.name}') deleted by {admin.name}.",
        holiday_id=holiday_id,
        admin_id=admin.employee_code or str(admin.employee_id)
    )
    return {"success": True, "message": f"Holiday '{holiday.name}' deleted successfully."}
