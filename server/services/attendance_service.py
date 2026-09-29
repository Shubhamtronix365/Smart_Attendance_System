from datetime import datetime, time
from decimal import Decimal
from server.config import settings
from server.models.attendance import AttendanceStatus

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
    Standard start: 9:00 AM.
    Any check-in after 9:00 AM is considered LATE.
    """
    if not check_in_time or check_in_time <= STANDARD_START:
        return AttendanceStatus.PRESENT
    return AttendanceStatus.LATE

def calculate_hours(check_in: datetime, check_out: datetime) -> tuple[Decimal, Decimal]:
    """
    Calculates total working hours and overtime hours for the 9:00 AM - 5:00 PM shift.
    Deducts 1 hour for free lunch break during the work schedule.
    """
    if not check_in or not check_out:
        return Decimal("0.00"), Decimal("0.00")
        
    delta = check_out - check_in
    total_hours = Decimal(str(round(delta.total_seconds() / 3600.0, 2)))
    
    # Deduct 1 hour for lunch break if the employee worked at least 4 hours
    if total_hours >= Decimal("4.00"):
        working = total_hours - Decimal("1.00")
    else:
        working = total_hours
    working = max(working, Decimal("0.00"))
    
    # 9:00 AM to 5:00 PM total shift span is 8 hours.
    # With 1 hour free lunch break, standard net working hours is 7.0 hours.
    net_standard_hours = Decimal(str(settings.STANDARD_WORK_HOURS - 1)) if settings.STANDARD_WORK_HOURS == 8 else Decimal(str(settings.STANDARD_WORK_HOURS))
    overtime = max(working - net_standard_hours, Decimal("0.00"))
    
    return working, overtime
