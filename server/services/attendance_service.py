from datetime import datetime, time
from decimal import Decimal
from server.config import settings
from server.models.attendance import AttendanceStatus

def determine_status(check_in_time: time) -> AttendanceStatus:
    """
    Determines attendance status based on the check-in time.
    Standard start: 9:00 AM.
    Late threshold: 9:30 AM.
    """
    standard_start = time(9, 0)
    # Late threshold defaults to 9:30 AM (9:00 AM + 30 min)
    late_threshold = time(9, 30)
    
    if check_in_time <= standard_start:
        return AttendanceStatus.PRESENT
    elif check_in_time <= late_threshold:
        return AttendanceStatus.PRESENT
    else:
        return AttendanceStatus.LATE

def calculate_hours(check_in: datetime, check_out: datetime) -> tuple[Decimal, Decimal]:
    """
    Calculates total working hours and overtime hours.
    Subtracts a standard 1-hour lunch break.
    """
    if not check_in or not check_out:
        return Decimal("0.00"), Decimal("0.00")
        
    delta = check_out - check_in
    # Use total_seconds to support multi-day shifts robustly
    total_hours = Decimal(str(round(delta.total_seconds() / 3600.0, 2)))
    
    # Deduct 1 hour for lunch
    working = total_hours - Decimal("1.00")
    working = max(working, Decimal("0.00"))
    
    standard_hours = Decimal(str(settings.STANDARD_WORK_HOURS))
    overtime = max(working - standard_hours, Decimal("0.00"))
    
    return working, overtime
