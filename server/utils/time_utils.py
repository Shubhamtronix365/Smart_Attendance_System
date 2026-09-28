import calendar
from datetime import date, datetime, time, timezone, timedelta

IST_OFFSET = timezone(timedelta(hours=5, minutes=30))

def get_current_local_time() -> datetime:
    """
    Returns current local office time (IST UTC+05:30) as a naive datetime object.
    Matches DS3231 RTC module hardware clock and avoids server UTC container drift.
    """
    utc_now = datetime.now(timezone.utc)
    ist_now = utc_now.astimezone(IST_OFFSET)
    return ist_now.replace(tzinfo=None)

def get_current_local_date() -> date:
    return get_current_local_time().date()

def get_working_days_in_month(year: int, month: int) -> int:
    """
    Returns the count of working days (Monday to Saturday, excluding Sundays) 
    for the specified month and year.
    """
    num_days = calendar.monthrange(year, month)[1]
    working_days = 0
    for day in range(1, num_days + 1):
        d = date(year, month, day)
        # 6 represents Sunday
        if d.weekday() != 6:
            working_days += 1
    return working_days

def datetime_to_time_str(dt: datetime) -> str:
    """Formats datetime to standard HH:MM AM/PM string."""
    if not dt:
        return "--:--"
    return dt.strftime("%I:%M %p")

