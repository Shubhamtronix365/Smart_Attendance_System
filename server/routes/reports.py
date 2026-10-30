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
    employee_id: Optional[int] = None,
    status: Optional[str] = None,
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a daily attendance report.
    Supports filtering by department, individual employee, and attendance status.
    Supports JSON output or PDF/Excel binary downloads.
    """
    if not report_date:
        report_date = date.today()
        
    stmt = select(Attendance).options(joinedload(Attendance.employee)).where(
        Attendance.date == report_date
    )
    
    if department:
        stmt = stmt.join(Employee).where(Employee.department == department)
    if employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)
        
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    # Map to standardized dictionaries for excel/pdf utilities
    mapped_records = []
    for r in records:
        mapped_records.append({
            "id": r.attendance_id,
            "attendance_id": r.attendance_id,
            "employee_id": r.employee_id,
            "employee_name": r.employee.name if r.employee else "Unknown",
            "department": r.employee.department if r.employee else "N/A",
            "check_in": r.check_in,
            "check_out": r.check_out,
            "working_hours": r.working_hours,
            "overtime_hours": r.overtime_hours,
            "status": r.status,
            "checkout_count": getattr(r, "checkout_count", 0) or 0,
            "punches": getattr(r, "punches", "[]") or "[]",
            "source": r.source
        })
        
    # Handle missing active employees for that day as absent
    emp_stmt = select(Employee).where(Employee.is_active == True)
    if department:
        emp_stmt = emp_stmt.where(Employee.department == department)
    if employee_id:
        emp_stmt = emp_stmt.where(Employee.employee_id == employee_id)
    emp_res = await db.execute(emp_stmt)
    active_employees = emp_res.scalars().all()
    
    logged_ids = {r.employee_id for r in records}
    is_sunday = (report_date.weekday() == 6)
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
                "status": "holiday" if is_sunday else "absent",
                "source": "system"
            })

    # Optional status filter
    if status:
        norm_status = status.lower()
        if norm_status in ("halfday", "half_day"):
            mapped_records = [r for r in mapped_records if str(r["status"]).lower() in ("half_day", "halfday")]
        else:
            mapped_records = [r for r in mapped_records if str(r["status"]).lower() == norm_status]
            
    # Sort by employee ID
    mapped_records.sort(key=lambda x: x["employee_id"])

    # Determine individualized title & filename if single employee
    emp_obj = None
    if employee_id:
        emp_obj = await db.get(Employee, employee_id)

    if emp_obj:
        emp_code = emp_obj.employee_code or f"EMP{emp_obj.employee_id:03d}"
        clean_name = emp_obj.name.replace(" ", "_")
        title = f"DAILY ATTENDANCE REPORT - {emp_obj.name} ({emp_code})"
        subtitle = f"Employee: {emp_obj.name} | ID: {emp_code} | Department: {emp_obj.department or 'N/A'} | Date: {report_date.strftime('%A, %d %B %Y')}"
        filename_prefix = f"Daily_Attendance_{emp_code}_{clean_name}"
    else:
        title = "DAILY ATTENDANCE REPORT"
        subtitle = f"All Employees | Department: {department or 'All'} | Date: {report_date.strftime('%A, %d %B %Y')}"
        filename_prefix = "Daily_Attendance"
    
    if export_format == "excel":
        excel_bytes = generate_daily_attendance_excel(report_date, mapped_records, title=title, subtitle=subtitle)
        filename = f"{filename_prefix}_{report_date.strftime('%Y-%m-%d')}.xlsx"
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
        
    elif export_format == "pdf":
        pdf_bytes = generate_daily_attendance_pdf(report_date, mapped_records, title=title, subtitle=subtitle)
        filename = f"{filename_prefix}_{report_date.strftime('%Y-%m-%d')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
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
    status: Optional[str] = None,
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns time-by-time attendance records for each punch / day across a month or date range.
    Shows exact date, check-in time, check-out time, hours, late minutes, status for each employee.
    Supports filtering by department, single employee, status, and custom date range.
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
    if status:
        norm_status = status.lower()
        if norm_status in ("halfday", "half_day"):
            stmt = stmt.where(Attendance.status.in_([AttendanceStatus.HALF_DAY, "half_day", "halfday"]))
        elif norm_status == "present":
            stmt = stmt.where(Attendance.status.in_([AttendanceStatus.PRESENT, "present"]))
        elif norm_status == "late":
            stmt = stmt.where(Attendance.status.in_([AttendanceStatus.LATE, "late"]))
        elif norm_status == "absent":
            stmt = stmt.where(Attendance.status.in_([AttendanceStatus.ABSENT, "absent"]))
        elif norm_status == "leave":
            stmt = stmt.where(Attendance.status.in_([AttendanceStatus.LEAVE, "leave"]))
        elif norm_status == "wfh":
            stmt = stmt.where(Attendance.status.in_([AttendanceStatus.WFH, "wfh"]))
        else:
            stmt = stmt.where(Attendance.status == norm_status)

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
            "employee_code": r.employee.employee_code if (r.employee and r.employee.employee_code) else f"EMP{r.employee_id:03d}",
            "employee_name": r.employee.name if r.employee else "Unknown",
            "department": r.employee.department if r.employee else "N/A",
            "check_in": r.check_in,
            "check_out": r.check_out,
            "check_in_formatted": cin_fmt,
            "check_out_formatted": cout_fmt,
            "working_hours": float(r.working_hours or 0.0),
            "late_minutes": r.late_minutes if hasattr(r, "late_minutes") and r.late_minutes else 0,
            "overtime_hours": float(r.overtime_hours or 0.0),
            "status": r.status.value if hasattr(r.status, "value") else str(r.status),
            "source": r.source,
            "checkout_count": getattr(r, "checkout_count", 0) or 0,
            "punches": getattr(r, "punches", "[]") or "[]"
        })

    # Build individualized or all-employee titles & filenames
    emp_obj = None
    if employee_id:
        emp_obj = await db.get(Employee, employee_id)

    period_str = f"{start_date.strftime('%Y%m%d')}_to_{end_date.strftime('%Y%m%d')}"

    if emp_obj:
        emp_code = emp_obj.employee_code or f"EMP{emp_obj.employee_id:03d}"
        clean_name = emp_obj.name.replace(" ", "_")
        title = f"INDIVIDUAL ATTENDANCE REPORT - {emp_obj.name} ({emp_code})"
        subtitle = (
            f"Employee: {emp_obj.name} | ID: {emp_code} | Department: {emp_obj.department or 'N/A'} | "
            f"Period: {start_date.strftime('%d %b %Y')} to {end_date.strftime('%d %b %Y')}"
        )
        filename_prefix = f"Attendance_Report_{emp_code}_{clean_name}"
    else:
        title = f"DETAILED ATTENDANCE LOGS ({start_date.strftime('%d %b %Y')} - {end_date.strftime('%d %b %Y')})"
        subtitle = (
            f"All Employees | Department: {department or 'All'} | "
            f"Period: {start_date.strftime('%d %b %Y')} to {end_date.strftime('%d %b %Y')}"
        )
        filename_prefix = f"Detailed_Attendance"

    if export_format == "excel":
        excel_bytes = generate_historical_attendance_excel(start_date, end_date, mapped_records, title=title, subtitle=subtitle)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename_prefix}_{period_str}.xlsx"'}
        )
    elif export_format == "pdf":
        pdf_bytes = generate_historical_attendance_pdf(start_date, end_date, mapped_records, title=title, subtitle=subtitle)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename_prefix}_{period_str}.pdf"'}
        )

    return mapped_records


@router.get("/attendance/monthly")
async def get_monthly_attendance_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    employee_id: Optional[int] = None,
    department: Optional[str] = None,
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a monthly attendance summary.
    Supports filtering by department and individual employee.
    Supports JSON output or PDF/Excel binary downloads.
    """
    emp_stmt = select(Employee).where(Employee.is_active == True)
    if department:
        emp_stmt = emp_stmt.where(Employee.department == department)
    if employee_id:
        emp_stmt = emp_stmt.where(Employee.employee_id == employee_id)
        
    emp_res = await db.execute(emp_stmt)
    employees = emp_res.scalars().all()
    
    working_days = get_working_days_in_month(year, month)
    summaries = []
    
    for emp in employees:
        att_stmt = select(Attendance).where(
            and_(
                Attendance.employee_id == emp.employee_id,
                extract("year", Attendance.date) == year,
                extract("month", Attendance.date) == month
            )
        )
        att_res = await db.execute(att_stmt)
        records = att_res.scalars().all()
        
        standard_records = [r for r in records if r.date.weekday() != 6]
        present_count = sum(1 for r in standard_records if r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.WFH))
        half_days_count = sum(1 for r in standard_records if r.status == AttendanceStatus.HALF_DAY)
        leave_days_count = sum(1 for r in standard_records if r.status == AttendanceStatus.LEAVE)
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

    emp_obj = None
    if employee_id:
        emp_obj = await db.get(Employee, employee_id)

    month_name = calendar.month_name[month]
    if emp_obj:
        emp_code = emp_obj.employee_code or f"EMP{emp_obj.employee_id:03d}"
        clean_name = emp_obj.name.replace(" ", "_")
        title = f"MONTHLY ATTENDANCE SUMMARY - {emp_obj.name} ({emp_code})"
        subtitle = f"Employee: {emp_obj.name} | ID: {emp_code} | Department: {emp_obj.department or 'N/A'} | Period: {month_name} {year}"
        filename = f"Monthly_Attendance_{emp_code}_{clean_name}_{year}_{month}"
    else:
        title = "MONTHLY ATTENDANCE SUMMARY"
        subtitle = f"All Employees | Department: {department or 'All'} | Period: {month_name} {year}"
        filename = f"Monthly_Attendance_{year}_{month}"
        
    if export_format == "excel":
        excel_bytes = generate_monthly_attendance_excel(year, month, summaries, title=title, subtitle=subtitle)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'}
        )
        
    elif export_format == "pdf":
        pdf_bytes = generate_monthly_attendance_pdf(year, month, summaries, title=title, subtitle=subtitle)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'}
        )
        
    return summaries


@router.get("/payroll")
async def get_payroll_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    employee_id: Optional[int] = None,
    department: Optional[str] = None,
    export_format: str = Query("json", alias="format", pattern="^(json|pdf|excel)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a monthly payroll report summary.
    Supports filtering by department and single employee.
    Supports JSON output or PDF/Excel binary downloads.
    """
    stmt = select(Payroll).options(joinedload(Payroll.employee)).where(
        and_(
            Payroll.month == month,
            Payroll.year == year
        )
    )
    if department:
        stmt = stmt.join(Payroll.employee).where(Employee.department == department)
    if employee_id:
        stmt = stmt.where(Payroll.employee_id == employee_id)

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

    emp_obj = None
    if employee_id:
        emp_obj = await db.get(Employee, employee_id)

    if emp_obj:
        emp_code = emp_obj.employee_code or f"EMP{emp_obj.employee_id:03d}"
        clean_name = emp_obj.name.replace(" ", "_")
        filename = f"Payroll_Report_{emp_code}_{clean_name}_{year}_{month}"
    else:
        filename = f"Payroll_Report_{year}_{month}"
        
    if export_format == "excel":
        excel_bytes = generate_payroll_report_excel(year, month, mapped_payrolls)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'}
        )
        
    elif export_format == "pdf":
        pdf_bytes = generate_payroll_report_pdf(year, month, mapped_payrolls)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'}
        )
        
    return mapped_payrolls
