import json
from datetime import datetime, time, timedelta, date
from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.models.employee import Employee
from server.models.attendance import Attendance, AttendanceStatus
from server.models.leave import Leave, LeaveStatus
from server.utils.time_utils import get_current_local_date
from server.utils.logger import log_info, log_warning, log_error, log_debug

STANDARD_START = time(9, 0)
STANDARD_END = time(17, 0)

def calculate_late_minutes(check_in_time: time, punch_date: Optional[date] = None) -> int:
    """
    Calculates minutes late relative to 9:00 AM standard shift start.
    If checked in at or before 9:00 AM, returns 0.
    On Sundays, work is voluntary / overtime: late_minutes is always 0.
    """
    if punch_date and punch_date.weekday() == 6:
        return 0
    if not check_in_time or check_in_time <= STANDARD_START:
        return 0
    delta_seconds = (check_in_time.hour * 3600 + check_in_time.minute * 60 + check_in_time.second) - (9 * 3600)
    return max(0, int(delta_seconds // 60))

def determine_status(check_in_time: time, punch_date: Optional[date] = None) -> AttendanceStatus:
    """
    Determines attendance status based on the check-in time.
    Standard start: 9:00 AM. Any check-in after 9:00 AM is considered LATE on normal workdays.
    On Sundays, work is treated as holiday work / overtime: always PRESENT (never LATE).
    """
    if punch_date and punch_date.weekday() == 6:
        return AttendanceStatus.PRESENT
    if not check_in_time or check_in_time <= STANDARD_START:
        return AttendanceStatus.PRESENT
    return AttendanceStatus.LATE

def calculate_hours(check_in: datetime, check_out: datetime) -> Tuple[Decimal, Decimal]:
    """
    Calculates total working hours and overtime hours for a single continuous shift.
    Deducts 1 hour for lunch break if the employee worked at least 4 hours.
    On Sundays, 100% of working hours are counted as overtime.
    """
    if not check_in or not check_out:
        return Decimal("0.00"), Decimal("0.00")
        
    delta = check_out - check_in
    total_hours = Decimal(str(round(delta.total_seconds() / 3600.0, 2)))
    
    # Deduct 1 hour for lunch break if continuous shift was at least 4 hours
    if total_hours >= Decimal("4.00"):
        working = total_hours - Decimal("1.00")
    else:
        working = total_hours
    working = max(working, Decimal("0.00"))
    
    # Sunday check-in / check-out: 100% of working hours count as overtime
    if check_in.weekday() == 6:
        return working, working

    net_standard_hours = Decimal(str(settings.STANDARD_WORK_HOURS - 1)) if settings.STANDARD_WORK_HOURS == 8 else Decimal(str(settings.STANDARD_WORK_HOURS))
    overtime = max(working - net_standard_hours, Decimal("0.00"))
    
    return working, overtime

def calculate_multi_session_totals(sessions: List[Dict[str, Any]], standard_work_hours: int = 8, is_sunday: bool = False) -> Tuple[Decimal, Decimal, int]:
    """
    Calculates cumulative working hours, overtime hours, and total checkout count
    across multiple check-in/check-out sessions in a workday (e.g. up to 5-6 times a day).
    If is_sunday is True, 100% of working hours are counted as overtime.
    """
    completed_sessions = [s for s in sessions if s.get("out")]
    total_checkouts = len(completed_sessions)
    
    if not completed_sessions:
        return Decimal("0.00"), Decimal("0.00"), 0

    total_duration = Decimal("0.00")
    for s in completed_sessions:
        h = s.get("hours", 0)
        total_duration += Decimal(str(h))

    # If only 1 long continuous session was worked (>= 5.0h) without separate lunch checkout, deduct 1 hour lunch
    if total_checkouts == 1 and total_duration >= Decimal("5.00"):
        working_hours = total_duration - Decimal("1.00")
    else:
        # Multiple check-in/check-out sessions: breaks are already excluded naturally
        working_hours = total_duration

    working_hours = max(working_hours, Decimal("0.00"))

    if is_sunday:
        overtime_hours = working_hours
    else:
        net_standard = Decimal(str(standard_work_hours - 1)) if standard_work_hours == 8 else Decimal(str(standard_work_hours))
        overtime_hours = max(working_hours - net_standard, Decimal("0.00"))

    return round(working_hours, 2), round(overtime_hours, 2), total_checkouts


async def record_attendance_punch(
    employee: Employee,
    punch_dt: datetime,
    scan_source: str,
    db: AsyncSession
) -> Dict[str, Any]:
    """
    Unified attendance state engine supporting:
    1. 2-minute (120-second) anti-double-scan guard (prevents rapid double-touch)
    2. Cross-midnight overtime / night-shift tracking (e.g. 9 AM to 3 AM next morning)
    3. Unlimited multiple check-in / check-out sessions per day (e.g. 5-6 times daily)
    4. Exact cumulative working time, overtime summation, and total checkouts counter
    5. Sunday work calculation: 100% of hours worked on Sunday count as Overtime with 0 late penalty!
    """
    emp_code = employee.employee_code or f"EMP{employee.employee_id:03d}"

    # ─── 1. Check for an ACTIVE (open) session ─────────────────────────────────
    open_stmt = (
        select(Attendance)
        .where(
            and_(
                Attendance.employee_id == employee.employee_id,
                Attendance.check_in.is_not(None),
                Attendance.check_out.is_(None)
            )
        )
        .order_by(Attendance.check_in.desc())
        .limit(1)
    )
    open_res = await db.execute(open_stmt)
    open_att = open_res.scalar_one_or_none()

    if open_att:
        # Parse session array
        sessions: List[Dict[str, Any]] = []
        try:
            sessions = json.loads(open_att.punches or "[]")
        except Exception:
            sessions = []

        # Find the active unclosed session
        curr_session: Optional[Dict[str, Any]] = None
        for s in reversed(sessions):
            if s.get("out") is None:
                curr_session = s
                break

        # Fallback if punches array didn't have an unclosed session
        if not curr_session:
            curr_in_dt = open_att.check_in or punch_dt
            curr_session = {
                "session": len(sessions) + 1,
                "in": curr_in_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "out": None,
                "hours": 0.0
            }
            sessions.append(curr_session)
        else:
            try:
                curr_in_dt = datetime.strptime(curr_session["in"], "%Y-%m-%d %H:%M:%S")
            except Exception:
                curr_in_dt = open_att.check_in or punch_dt

        elapsed_sec = (punch_dt - curr_in_dt).total_seconds()

        # A. Anti-Double-Scan guard (2 minutes = 120 seconds)
        if elapsed_sec < 120:
            log_warning(
                "ATTENDANCE",
                "DUPLICATE_PUNCH",
                f"Attendance was not recorded.\nEmployee {emp_code} ({employee.name}) already has a recent scan for today within the 2-minute cooldown period.",
                employee_id=emp_code,
                employee_name=employee.name,
                source=scan_source.upper(),
                action="Duplicate attendance attempt rejected.",
                result="IGNORED",
                reason=f"Cooldown active ({int(elapsed_sec)}s < 120s since last punch at {curr_in_dt.strftime('%I:%M %p')})"
            )
            return {
                "success": True,
                "status": "already_marked",
                "message": "Already scanned! Please wait 2 minutes.",
                "employee_name": employee.name,
                "method": scan_source,
                "time": punch_dt.strftime("%H:%M:%S"),
                "working_hours": str(open_att.working_hours or "0.00"),
                "overtime_hours": str(open_att.overtime_hours or "0.00"),
                "checkout_count": open_att.checkout_count or 0
            }

        is_shift_sunday = (open_att.date.weekday() == 6 or (open_att.check_in and open_att.check_in.weekday() == 6))

        # B. Valid Check-Out (up to 20 hours shift duration)
        if elapsed_sec <= 72000:  # 20 hours = 72,000s
            session_hours = round(elapsed_sec / 3600.0, 2)
            curr_session["out"] = punch_dt.strftime("%Y-%m-%d %H:%M:%S")
            curr_session["hours"] = session_hours

            working_hours, ot_hours, checkouts = calculate_multi_session_totals(
                sessions,
                settings.STANDARD_WORK_HOURS,
                is_sunday=is_shift_sunday
            )

            open_att.punches = json.dumps(sessions)
            open_att.check_out = punch_dt
            open_att.working_hours = working_hours
            open_att.overtime_hours = working_hours if is_shift_sunday else ot_hours
            open_att.checkout_count = checkouts

            if is_shift_sunday:
                open_att.late_minutes = 0
                open_att.status = AttendanceStatus.PRESENT
            elif open_att.status in (AttendanceStatus.ABSENT, AttendanceStatus.HOLIDAY):
                open_att.status = AttendanceStatus.PRESENT

            await db.commit()

            ot_note = f" (Sunday OT: {working_hours:.1f}h)" if is_shift_sunday else f", {ot_hours:.1f}h OT"
            log_info(
                "ATTENDANCE",
                "BIOMETRIC_CHECK_OUT" if scan_source.lower() == "biometric" else "CHECK_OUT",
                f"Employee {emp_code} ({employee.name}) identified successfully.\nScan verification passed.\nAttendance check-out #{checkouts} recorded at {punch_dt.strftime('%I:%M %p')}.\n\nWorked {session_hours:.2f}h this session (Total worked today: {working_hours:.2f}h{ot_note}).",
                employee_id=emp_code,
                employee_name=employee.name,
                source=scan_source.upper(),
                action="Automatic check-out",
                session_duration=f"{session_hours:.2f}h",
                total_worked_hours=f"{working_hours:.2f}h",
                overtime_hours=f"{open_att.overtime_hours}h",
                checkout_count=checkouts,
                result="SUCCESS"
            )
            return {
                "success": True,
                "status": "check_out",
                "message": f"Goodbye {employee.name}! Checkout #{checkouts} (Worked: {session_hours:.1f}h, Total: {working_hours:.1f}h{ot_note})",
                "employee_name": employee.name,
                "method": scan_source,
                "time": punch_dt.strftime("%H:%M:%S"),
                "checkout_count": checkouts,
                "session_hours": str(session_hours),
                "working_hours": str(working_hours),
                "overtime_hours": str(open_att.overtime_hours)
            }

        # C. Shift abandoned (> 20 hours ago)
        # Auto-close yesterday's abandoned session with standard 8h and proceed to new check-in
        curr_session["out"] = (curr_in_dt + timedelta(hours=8)).strftime("%Y-%m-%d %H:%M:%S")
        curr_session["hours"] = 7.0
        open_att.punches = json.dumps(sessions)
        open_att.check_out = curr_in_dt + timedelta(hours=8)
        open_att.working_hours = Decimal("7.00")
        open_att.overtime_hours = Decimal("7.00") if is_shift_sunday else Decimal("0.00")
        open_att.checkout_count = len([s for s in sessions if s.get("out")])
        if is_shift_sunday:
            open_att.late_minutes = 0
            open_att.status = AttendanceStatus.PRESENT
        await db.commit()
        log_warning(
            "ATTENDANCE",
            "ABANDONED_SHIFT_CLOSED",
            f"An unclosed attendance session for employee {emp_code} ({employee.name}) from {curr_in_dt.strftime('%Y-%m-%d %I:%M %p')} was detected (> 20 hours old).\nPrevious session auto-closed with 8h standard shift duration to permit new check-in.",
            employee_id=emp_code,
            employee_name=employee.name,
            source=scan_source.upper(),
            action="Auto-close abandoned previous shift",
            result="PREVIOUS_SHIFT_CLOSED"
        )

    # ─── 2. No Active Session -> This is a CHECK-IN ───────────────────────────
    today = punch_dt.date()
    is_sunday = (today.weekday() == 6)

    today_stmt = (
        select(Attendance)
        .where(
            and_(
                Attendance.employee_id == employee.employee_id,
                Attendance.date == today
            )
        )
        .order_by(Attendance.attendance_id.desc())
        .limit(1)
    )
    today_res = await db.execute(today_stmt)
    today_att = today_res.scalar_one_or_none()

    # Subcase 2A: An attendance record already exists for today
    if today_att:
        # If today_att is an ABSENT placeholder created before punch (check_in is None), transform it to Session 1 check-in
        if today_att.check_in is None:
            check_in_time = punch_dt.time()
            attendance_status = AttendanceStatus.PRESENT if is_sunday else determine_status(check_in_time, today)
            late_mins = 0 if is_sunday else calculate_late_minutes(check_in_time, today)

            sessions = [{
                "session": 1,
                "in": punch_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "out": None,
                "hours": 0.0
            }]

            today_att.check_in = punch_dt
            today_att.check_out = None
            today_att.working_hours = Decimal("0.00")
            today_att.overtime_hours = Decimal("0.00")
            today_att.late_minutes = late_mins
            today_att.status = attendance_status
            today_att.source = scan_source
            today_att.punches = json.dumps(sessions)
            today_att.checkout_count = 0
            today_att.created_at = punch_dt
            await db.commit()

            if is_sunday:
                late_str = " (Sunday Overtime Shift)"
            else:
                late_str = f" (Late by {late_mins}m)" if late_mins > 0 else ""

            log_info(
                "ATTENDANCE",
                "BIOMETRIC_CHECK_IN" if scan_source.lower() == "biometric" else "CHECK_IN",
                f"Employee {emp_code} ({employee.name}) identified successfully.\nBiometric/scan verification passed.\nAttendance check-in recorded at {punch_dt.strftime('%I:%M %p')}.{late_str}",
                employee_id=emp_code,
                employee_name=employee.name,
                source=scan_source.upper(),
                action="Automatic check-in",
                session_number=1,
                status=attendance_status.value,
                late_minutes=late_mins,
                result="SUCCESS"
            )

            return {
                "success": True,
                "status": "check_in",
                "message": f"Welcome {employee.name}! (Check-In #1){late_str}",
                "employee_name": employee.name,
                "method": scan_source,
                "time": punch_dt.strftime("%H:%M:%S"),
                "session_number": 1,
                "working_hours": "0.00",
                "overtime_hours": "0.00",
                "checkout_count": 0
            }

        # Otherwise, today_att.check_in is not None -> genuine re-checkin for Session 2, 3, etc.
        sessions = []
        try:
            sessions = json.loads(today_att.punches or "[]")
        except Exception:
            sessions = []

        # Anti-bounce guard against last checkout (2 minutes = 120 seconds)
        if today_att.check_out:
            elapsed_out = (punch_dt - today_att.check_out).total_seconds()
            if elapsed_out < 120:
                log_warning(
                    "ATTENDANCE",
                    "DUPLICATE_PUNCH",
                    f"Attendance was not recorded.\nEmployee {emp_code} ({employee.name}) already has a recent checkout scan within the 2-minute cooldown period.",
                    employee_id=emp_code,
                    employee_name=employee.name,
                    source=scan_source.upper(),
                    action="Duplicate check-in attempt rejected.",
                    result="IGNORED",
                    reason=f"Cooldown active ({int(elapsed_out)}s < 120s since checkout at {today_att.check_out.strftime('%I:%M %p')})"
                )
                return {
                    "success": True,
                    "status": "already_marked",
                    "message": "Already scanned! Please wait 2 minutes.",
                    "employee_name": employee.name,
                    "method": scan_source,
                    "time": punch_dt.strftime("%H:%M:%S"),
                    "working_hours": str(today_att.working_hours or "0.00"),
                    "overtime_hours": str(today_att.overtime_hours or "0.00"),
                    "checkout_count": today_att.checkout_count or 0
                }

        session_num = len(sessions) + 1
        new_session = {
            "session": session_num,
            "in": punch_dt.strftime("%Y-%m-%d %H:%M:%S"),
            "out": None,
            "hours": 0.0
        }
        sessions.append(new_session)

        today_att.punches = json.dumps(sessions)
        today_att.check_out = None  # Active again
        if is_sunday:
            today_att.status = AttendanceStatus.PRESENT
            today_att.late_minutes = 0
        elif today_att.status in (AttendanceStatus.ABSENT, AttendanceStatus.HOLIDAY):
            today_att.status = AttendanceStatus.PRESENT

        await db.commit()

        sunday_tag = " (Sunday OT Shift)" if is_sunday else ""
        log_info(
            "ATTENDANCE",
            "BIOMETRIC_CHECK_IN" if scan_source.lower() == "biometric" else "CHECK_IN",
            f"Employee {emp_code} ({employee.name}) identified successfully.\nAttendance check-in for Session #{session_num} recorded at {punch_dt.strftime('%I:%M %p')}.{sunday_tag}",
            employee_id=emp_code,
            employee_name=employee.name,
            source=scan_source.upper(),
            action=f"Check-in Session #{session_num}",
            session_number=session_num,
            result="SUCCESS"
        )
        return {
            "success": True,
            "status": "check_in",
            "message": f"Welcome back {employee.name}! (Check-In #{session_num}){sunday_tag}",
            "employee_name": employee.name,
            "method": scan_source,
            "time": punch_dt.strftime("%H:%M:%S"),
            "session_number": session_num,
            "working_hours": str(today_att.working_hours or "0.00"),
            "overtime_hours": str(today_att.overtime_hours or "0.00"),
            "checkout_count": today_att.checkout_count or 0
        }

    # Subcase 2B: Brand new day -> First Check-in of the day
    check_in_time = punch_dt.time()
    attendance_status = AttendanceStatus.PRESENT if is_sunday else determine_status(check_in_time, today)
    late_mins = 0 if is_sunday else calculate_late_minutes(check_in_time, today)

    sessions = [{
        "session": 1,
        "in": punch_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "out": None,
        "hours": 0.0
    }]

    new_attendance = Attendance(
        employee_id=employee.employee_id,
        date=today,
        check_in=punch_dt,
        check_out=None,
        working_hours=Decimal("0.00"),
        overtime_hours=Decimal("0.00"),
        late_minutes=late_mins,
        status=attendance_status,
        source=scan_source,
        punches=json.dumps(sessions),
        checkout_count=0,
        created_at=punch_dt
    )
    db.add(new_attendance)
    await db.commit()

    if is_sunday:
        late_str = " (Sunday Overtime Shift)"
    else:
        late_str = f" (Late by {late_mins}m)" if late_mins > 0 else ""

    log_info(
        "ATTENDANCE",
        "BIOMETRIC_CHECK_IN" if scan_source.lower() == "biometric" else "CHECK_IN",
        f"Employee {emp_code} ({employee.name}) identified successfully.\nBiometric/scan verification passed.\nFirst check-in of the day recorded at {punch_dt.strftime('%I:%M %p')}.{late_str}",
        employee_id=emp_code,
        employee_name=employee.name,
        source=scan_source.upper(),
        action="Automatic check-in",
        session_number=1,
        status=attendance_status.value,
        late_minutes=late_mins,
        result="SUCCESS"
    )

    if is_sunday:
        late_str = " (Sunday Overtime Shift)"
    else:
        late_str = f" (Late by {late_mins}m)" if late_mins > 0 else ""

    return {
        "success": True,
        "status": "check_in",
        "message": f"Welcome {employee.name}! (Check-In #1){late_str}",
        "employee_name": employee.name,
        "method": scan_source,
        "time": punch_dt.strftime("%H:%M:%S"),
        "session_number": 1,
        "working_hours": "0.00",
        "overtime_hours": "0.00",
        "checkout_count": 0
    }


async def sync_absent_records_for_date(
    db: AsyncSession,
    target_date: date,
    department: Optional[str] = None
) -> int:
    """
    Ensures all active staff employees who did not punch in on target_date have
    an explicit record in the database:
    - On Sundays (weekday == 6): Skipped (Sundays are weekly off/holidays, never absent).
    - On working days (Mon-Sat): Active employees without records get ABSENT (or LEAVE if approved).
    Future dates beyond today are never marked absent.
    """
    today = get_current_local_date()
    if target_date > today or target_date.weekday() == 6:
        return 0
    return await sync_absent_records_for_range(db, target_date, target_date, department=department)


async def sync_absent_records_for_range(
    db: AsyncSession,
    start_date: date,
    end_date: date,
    department: Optional[str] = None
) -> int:
    """
    Bulk synchronizes ABSENT and LEAVE records for all active staff employees across [start_date, end_date].
    - Excludes Sundays (weekday == 6) - no absence penalty on company holidays.
    - Caps end_date to today (never marks future dates as absent).
    - Respects employee joining_date (employees who haven't joined yet are not marked absent).
    - Checks approved leaves to accurately assign LEAVE instead of ABSENT.
    - Executed in a single bulk transaction with zero N+1 queries.
    """
    today = get_current_local_date()
    effective_end = min(end_date, today)
    if start_date > effective_end:
        return 0

    # 1. Fetch active staff employees
    emp_stmt = select(Employee).where(
        and_(
            Employee.role != "admin",
            Employee.is_active == True
        )
    )
    if department:
        emp_stmt = emp_stmt.where(Employee.department == department)
    emp_res = await db.execute(emp_stmt)
    active_employees = emp_res.scalars().all()
    if not active_employees:
        return 0

    emp_ids = [e.employee_id for e in active_employees]

    # 2. Fetch all existing attendance records in range
    att_stmt = select(Attendance.employee_id, Attendance.date).where(
        and_(
            Attendance.employee_id.in_(emp_ids),
            Attendance.date >= start_date,
            Attendance.date <= effective_end
        )
    )
    att_res = await db.execute(att_stmt)
    existing_records = set((r[0], r[1]) for r in att_res.all())

    # 3. Fetch all approved leaves overlapping range
    leave_stmt = select(Leave.employee_id, Leave.start_date, Leave.end_date).where(
        and_(
            Leave.employee_id.in_(emp_ids),
            Leave.start_date <= effective_end,
            Leave.end_date >= start_date,
            Leave.approval_status == LeaveStatus.APPROVED
        )
    )
    leave_res = await db.execute(leave_stmt)
    approved_leaves = leave_res.all()

    # 4. Generate missing records
    new_records: List[Attendance] = []
    curr = start_date
    delta_day = timedelta(days=1)

    while curr <= effective_end:
        # Skip Sundays
        if curr.weekday() != 6:
            for emp in active_employees:
                # Respect joining date
                if emp.joining_date and emp.joining_date > curr:
                    continue
                if (emp.employee_id, curr) not in existing_records:
                    is_leave = any(
                        l[0] == emp.employee_id and l[1] <= curr <= l[2]
                        for l in approved_leaves
                    )
                    status_val = AttendanceStatus.LEAVE if is_leave else AttendanceStatus.ABSENT
                    new_records.append(
                        Attendance(
                            employee_id=emp.employee_id,
                            date=curr,
                            check_in=None,
                            check_out=None,
                            working_hours=Decimal("0.00"),
                            overtime_hours=Decimal("0.00"),
                            late_minutes=0,
                            status=status_val,
                            source="system",
                            punches="[]",
                            checkout_count=0,
                            created_at=datetime.combine(curr, time(9, 0))
                        )
                    )
                    existing_records.add((emp.employee_id, curr))
        curr += delta_day

    if new_records:
        db.add_all(new_records)
        await db.commit()
        log_info(
            "ATTENDANCE",
            "ATTENDANCE_SYNC_COMPLETED",
            f"Automated absence synchronization completed across range {start_date} to {effective_end}.\n{len(new_records)} missing attendance record(s) generated.",
            source="SYSTEM_SCHEDULER",
            start_date=str(start_date),
            end_date=str(effective_end),
            records_generated=len(new_records),
            result="SUCCESS"
        )
        return len(new_records)

    return 0
