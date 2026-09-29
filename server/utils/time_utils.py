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

def get_working_days_in_month(year: int, month: int, include_saturday: bool = True) -> int:
    """
    Returns the count of working days for the specified month and year.
    By default, Monday to Saturday (excluding Sundays) are counted as working days.
    """
    num_days = calendar.monthrange(year, month)[1]
    working_days = 0
    for day in range(1, num_days + 1):
        d = date(year, month, day)
        # 6 represents Sunday
        if d.weekday() != 6 if include_saturday else d.weekday() < 5:
            working_days += 1
    return working_days

def get_elapsed_working_days(
    year: int,
    month: int,
    as_of_date: date = None,
    include_saturday: bool = True
) -> int:
    """
    Returns the count of working days that have elapsed from the 1st of the month
    up to as_of_date (defaults to today).
    If as_of_date is in a future month, returns 0.
    If as_of_date is in a past month, returns total working days for that month.
    """
    if as_of_date is None:
        as_of_date = get_current_local_date()

    month_start = date(year, month, 1)
    num_days = calendar.monthrange(year, month)[1]
    month_end = date(year, month, num_days)

    if as_of_date < month_start:
        return 0
    
    effective_end = min(as_of_date, month_end)
    elapsed = 0
    cur = month_start
    while cur <= effective_end:
        is_work = cur.weekday() != 6 if include_saturday else cur.weekday() < 5
        if is_work:
            elapsed += 1
        cur += timedelta(days=1)

    return elapsed

def datetime_to_time_str(dt: datetime) -> str:
    """Formats datetime to standard HH:MM AM/PM string."""
    if not dt:
        return "--:--"
    return dt.strftime("%I:%M %p")

