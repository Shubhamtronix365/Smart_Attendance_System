import json
from datetime import datetime, time, timedelta, date
from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from server.config import settings
from server.models.employee import Employee
from server.models.attendance import Attendance, AttendanceStatus

STANDARD_START = time(9, 0)
STANDARD_END = time(17, 0)

def calculate_late_minutes(check_in_time: time) -> int:
    """
    Calculates minutes late relative to 9:00 AM standard shift start.
    If checked in at or before 9:00 AM, returns 0.
    """
    if not check_in_time or check_in_time <= STANDARD_START:
        return 0
    delta_seconds = (check_in_time.hour * 3600 + check_in_time.minute * 60 + check_in_time.second) - (9 * 3600)
    return max(0, int(delta_seconds // 60))

def determine_status(check_in_time: time) -> AttendanceStatus:
    """
    Determines attendance status based on the check-in time.
    Standard start: 9:00 AM. Any check-in after 9:00 AM is considered LATE.
    """
    if not check_in_time or check_in_time <= STANDARD_START:
        return AttendanceStatus.PRESENT
    return AttendanceStatus.LATE

def calculate_hours(check_in: datetime, check_out: datetime) -> Tuple[Decimal, Decimal]:
    """
    Calculates total working hours and overtime hours for a single continuous shift.
    Deducts 1 hour for lunch break if the employee worked at least 4 hours.
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
    
    net_standard_hours = Decimal(str(settings.STANDARD_WORK_HOURS - 1)) if settings.STANDARD_WORK_HOURS == 8 else Decimal(str(settings.STANDARD_WORK_HOURS))
    overtime = max(working - net_standard_hours, Decimal("0.00"))
    
    return working, overtime

def calculate_multi_session_totals(sessions: List[Dict[str, Any]], standard_work_hours: int = 8) -> Tuple[Decimal, Decimal, int]:
    """
    Calculates cumulative working hours, overtime hours, and total checkout count
    across multiple check-in/check-out sessions in a workday (e.g. up to 5-6 times a day).
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
    1. 15-second anti-double-scan guard (replaces the old 1-hour lockout)
    2. Cross-midnight overtime / night-shift tracking (e.g. 9 AM to 3 AM next morning)
    3. Unlimited multiple check-in / check-out sessions per day (e.g. 5-6 times daily)
    4. Exact cumulative working time, overtime summation, and total checkouts counter
    """
    # ─── 1. Check for an ACTIVE (open) session ─────────────────────────────────
    open_stmt = (
        select(Attendance)
        .where(
            and_(
                Attendance.employee_id == employee.employee_id,
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

        # A. Anti-Double-Scan guard (15 seconds)
        if elapsed_sec < 15:
            return {
                "success": True,
                "status": "already_marked",
                "message": "Already scanned! Please wait 15 seconds.",
                "employee_name": employee.name,
                "method": scan_source,
                "time": punch_dt.strftime("%H:%M:%S"),
                "working_hours": str(open_att.working_hours or "0.00"),
                "overtime_hours": str(open_att.overtime_hours or "0.00"),
                "checkout_count": open_att.checkout_count or 0
            }

        # B. Valid Check-Out (up to 20 hours shift duration)
        if elapsed_sec <= 72000:  # 20 hours = 72,000s
            session_hours = round(elapsed_sec / 3600.0, 2)
            curr_session["out"] = punch_dt.strftime("%Y-%m-%d %H:%M:%S")
            curr_session["hours"] = session_hours

            working_hours, ot_hours, checkouts = calculate_multi_session_totals(sessions, settings.STANDARD_WORK_HOURS)

            open_att.punches = json.dumps(sessions)
            open_att.check_out = punch_dt
            open_att.working_hours = working_hours
            open_att.overtime_hours = ot_hours
            open_att.checkout_count = checkouts

            if open_att.status == AttendanceStatus.ABSENT:
                open_att.status = AttendanceStatus.PRESENT

            await db.commit()

            return {
                "success": True,
                "status": "check_out",
                "message": f"Goodbye {employee.name}! Checkout #{checkouts} (Worked: {session_hours:.1f}h, Total: {working_hours:.1f}h, {ot_hours:.1f}h OT)",
                "employee_name": employee.name,
                "method": scan_source,
                "time": punch_dt.strftime("%H:%M:%S"),
                "checkout_count": checkouts,
                "session_hours": str(session_hours),
                "working_hours": str(working_hours),
                "overtime_hours": str(ot_hours)
            }

        # C. Shift abandoned (> 20 hours ago)
        # Auto-close yesterday's abandoned session with standard 8h and proceed to new check-in
        curr_session["out"] = (curr_in_dt + timedelta(hours=8)).strftime("%Y-%m-%d %H:%M:%S")
        curr_session["hours"] = 7.0
        open_att.punches = json.dumps(sessions)
        open_att.check_out = curr_in_dt + timedelta(hours=8)
        open_att.working_hours = Decimal("7.00")
        open_att.overtime_hours = Decimal("0.00")
        open_att.checkout_count = len([s for s in sessions if s.get("out")])
        await db.commit()

    # ─── 2. No Active Session -> This is a CHECK-IN ───────────────────────────
    today = punch_dt.date()
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

    # Subcase 2A: An attendance record already exists for today (re-checkin for Session 2, 3, 4, 5, etc.)
    if today_att:
        sessions = []
        try:
            sessions = json.loads(today_att.punches or "[]")
        except Exception:
            sessions = []

        # Anti-bounce guard against last checkout (15 seconds)
        if today_att.check_out:
            elapsed_out = (punch_dt - today_att.check_out).total_seconds()
            if elapsed_out < 15:
                return {
                    "success": True,
                    "status": "already_marked",
                    "message": "Already scanned! Please wait 15 seconds.",
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
        if today_att.status == AttendanceStatus.ABSENT:
            today_att.status = AttendanceStatus.PRESENT

        await db.commit()

        return {
            "success": True,
            "status": "check_in",
            "message": f"Welcome back {employee.name}! (Check-In #{session_num})",
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
    attendance_status = determine_status(check_in_time)
    late_mins = calculate_late_minutes(check_in_time)

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
