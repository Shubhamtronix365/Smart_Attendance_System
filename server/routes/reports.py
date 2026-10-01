import calendar
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, and_, extract
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.dependencies.auth import require_admin
from server.models import Employee, Attendance, AttendanceStatus, Payroll
from server.services.excel_service import (
    generate_daily_attendance_excel,
    generate_monthly_attendance_excel,
    generate_payroll_report_excel,
    generate_historical_attendance_excel,
)
from server.services.pdf_service import (
    generate_daily_attendance_pdf,
    generate_monthly_attendance_pdf,
    generate_payroll_report_pdf,
    generate_historical_attendance_pdf,
)
from server.utils.time_utils import get_working_days_in_month

router = APIRouter(prefix="/reports", tags=["Reports"], dependencies=[Depends(require_admin)])


@router.get("/attendance/daily")
async def get_daily_attendance_report(
    report_date: Optional[date] = Query(None, alias="date"),
    department: Optional[str] = None,
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a daily attendance report.
    Supports JSON output or PDF/Excel binary downloads.
    """
    if not report_date:
        report_date = date.today()
        
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        Attendance.date == report_date
    )
    
    if department:
        stmt = stmt.join(Employee).where(Employee.department == department)
        
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    # Map to standardized dictionaries for excel/pdf utilities
    mapped_records = []
    for r in records:
        mapped_records.append({
            "employee_id": r.employee_id,
            "employee_name": r.employee.name if r.employee else "Unknown",
            "department": r.employee.department if r.employee else "N/A",
            "check_in": r.check_in,
            "check_out": r.check_out,
            "working_hours": r.working_hours,
            "overtime_hours": r.overtime_hours,
            "status": r.status,
            "source": r.source
        })
        
    # Handle missing active employees for that day as absent
    # Fetch all active employees
    emp_stmt = select(Employee).where(Employee.is_active == True)
    if department:
        emp_stmt = emp_stmt.where(Employee.department == department)
    emp_res = await db.execute(emp_stmt)
    active_employees = emp_res.scalars().all()
    
    logged_ids = {r.employee_id for r in records}
    for emp in active_employees:
        if emp.employee_id not in logged_ids:
            mapped_records.append({
                "employee_id": emp.employee_id,
                "employee_name": emp.name,
                "department": emp.department or "N/A",
                "check_in": None,
                "check_out": None,
                "working_hours": 0.00,
                "overtime_hours": 0.00,
                "status": "absent",
                "source": "system"
            })
            
    # Sort by employee ID
    mapped_records.sort(key=lambda x: x["employee_id"])
    
    if export_format == "excel":
        excel_bytes = generate_daily_attendance_excel(report_date, mapped_records)
        filename = f"Daily_Attendance_{report_date.strftime('%Y-%m-%d')}.xlsx"
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    elif export_format == "pdf":
        pdf_bytes = generate_daily_attendance_pdf(report_date, mapped_records)
        filename = f"Daily_Attendance_{report_date.strftime('%Y-%m-%d')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    return mapped_records


@router.get("/attendance/detailed-logs")
async def get_detailed_attendance_logs_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000),
    department: Optional[str] = None,
    employee_id: Optional[int] = None,
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns time-by-time attendance records for each punch / day across a month or date range.
    Shows exact date, check-in time, check-out time, hours, late minutes, status for each employee.
    Supports JSON, Excel, and PDF downloads.
    """
    if month and year and not start_date:
        start_date = date(year, month, 1)
        _, last_day = calendar.monthrange(year, month)
        end_date = date(year, month, last_day)
    elif not start_date:
        today = date.today()
        start_date = date(today.year, today.month, 1)
        end_date = today

    if not end_date:
        end_date = start_date

    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        and_(Attendance.date >= start_date, Attendance.date <= end_date)
    )

    if department:
        stmt = stmt.join(Attendance.employee).where(Employee.department == department)
    if employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)

    stmt = stmt.order_by(Attendance.date.desc(), Attendance.check_in.desc(), Attendance.employee_id.asc())

    res = await db.execute(stmt)
    records = res.scalars().all()

    mapped_records = []
    for r in records:
        cin = r.check_in
        cout = r.check_out
        cin_fmt = cin.strftime("%I:%M %p") if cin else "--:--"
        cout_fmt = cout.strftime("%I:%M %p") if cout else "--:--"

        mapped_records.append({
            "id": r.attendance_id,
            "date": r.date.strftime("%Y-%m-%d"),
            "employee_id": r.employee_id,
            "employee_name": r.employee.name if r.employee else "Unknown",
            "department": r.employee.department if r.employee else "N/A",
            "check_in": r.check_in.isoformat() if r.check_in else None,
            "check_out": r.check_out.isoformat() if r.check_out else None,
            "check_in_formatted": cin_fmt,
            "check_out_formatted": cout_fmt,
            "working_hours": float(r.working_hours or 0.0),
            "late_minutes": r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else 0,
            "overtime_hours": float(r.overtime_hours or 0.0),
            "status": r.status,
            "source": r.source
        })

    if export_format == "excel":
        period_str = f"{start_date.strftime('%Y%m%d')}_to_{end_date.strftime('%Y%m%d')}"
        title = f"DETAILED ATTENDANCE LOGS ({start_date.strftime('%d %b %Y')} - {end_date.strftime('%d %b %Y')})"
        excel_bytes = generate_historical_attendance_excel(start_date, end_date, mapped_records, title=title)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Detailed_Attendance_{period_str}.xlsx"}
        )
    elif export_format == "pdf":
        period_str = f"{start_date.strftime('%Y%m%d')}_to_{end_date.strftime('%Y%m%d')}"
        title = f"DETAILED ATTENDANCE LOGS ({start_date.strftime('%d %b %Y')} - {end_date.strftime('%d %b %Y')})"
        pdf_bytes = generate_historical_attendance_pdf(start_date, end_date, mapped_records, title=title)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Detailed_Attendance_{period_str}.pdf"}
        )

    return mapped_records


@router.get("/attendance/monthly")
async def get_monthly_attendance_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    employee_id: Optional[int] = None,
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a monthly attendance summary.
    Supports JSON output or PDF/Excel binary downloads.
    """
    # Fetch target employee(s)
    emp_stmt = select(Employee).where(Employee.is_active == True)
    if employee_id:
        emp_stmt = emp_stmt.where(Employee.employee_id == employee_id)
        
    emp_res = await db.execute(emp_stmt)
    employees = emp_res.scalars().all()
    
    working_days = get_working_days_in_month(year, month)
    summaries = []
    
    for emp in employees:
        # Fetch attendance logs
        att_stmt = select(Attendance).where(
            and_(
                Attendance.employee_id == emp.employee_id,
                extract("year", Attendance.date) == year,
                extract("month", Attendance.date) == month
            )
        )
        att_res = await db.execute(att_stmt)
        records = att_res.scalars().all()
        
        present_count = sum(1 for r in records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH))
        half_days_count = sum(1 for r in records if r.status == AttendanceStatus.HALF_DAY)
        leave_days_count = sum(1 for r in records if r.status == AttendanceStatus.LEAVE)
        ot_hours = sum(r.overtime_hours or 0.00 for r in records)
        
        present = float(present_count) + 0.5 * float(half_days_count)
        absent = max(float(working_days) - present - float(leave_days_count), 0.0)
        
        summaries.append({
            "employee_id": emp.employee_id,
            "employee_name": emp.name,
            "department": emp.department or "N/A",
            "designation": emp.designation or "N/A",
            "present_days": present,
            "absent_days": absent,
            "leave_days": leave_days_count,
            "overtime_hours": ot_hours
        })
        
    if export_format == "excel":
        excel_bytes = generate_monthly_attendance_excel(year, month, summaries)
        filename = f"Monthly_Attendance_{year}_{month}.xlsx"
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    elif export_format == "pdf":
        pdf_bytes = generate_monthly_attendance_pdf(year, month, summaries)
        filename = f"Monthly_Attendance_{year}_{month}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    return summaries


@router.get("/payroll")
async def get_payroll_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a monthly payroll report summary.
    Supports JSON output or PDF/Excel binary downloads.
    """
    stmt = select(Payroll).options(joinedload(Payroll.employee)).where(
        and_(
            Payroll.month == month,
            Payroll.year == year
        )
    )
    res = await db.execute(stmt)
    payrolls = res.scalars().all()
    
    mapped_payrolls = []
    for p in payrolls:
        mapped_payrolls.append({
            "employee_id": p.employee_id,
            "employee_name": p.employee.name if p.employee else "Unknown",
            "department": p.employee.department if p.employee else "N/A",
            "working_days": p.working_days,
            "present_days": p.present_days,
            "overtime_hours": p.overtime_hours,
            "basic_salary": p.basic_salary,
            "overtime_pay": p.overtime_pay,
            "deductions": p.deductions,
            "final_salary": p.final_salary,
            "is_paid": p.is_paid
        })
        
    if export_format == "excel":
        excel_bytes = generate_payroll_report_excel(year, month, mapped_payrolls)
        filename = f"Payroll_Report_{year}_{month}.xlsx"
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    elif export_format == "pdf":
        pdf_bytes = generate_payroll_report_pdf(year, month, mapped_payrolls)
        filename = f"Payroll_Report_{year}_{month}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    return mapped_payrolls
