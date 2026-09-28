from datetime import datetime, timezone, timedelta

IST_OFFSET = timezone(timedelta(hours=5, minutes=30))

def get_current_local_time() -> datetime:
    """
    Returns current local office time (IST UTC+05:30) as a naive datetime object.
    Matches DS3231 RTC module hardware clock and avoids server UTC container drift.
    """
    utc_now = datetime.now(timezone.utc)
    ist_now = utc_now.astimezone(IST_OFFSET)
    return ist_now.replace(tzinfo=None)

def get_current_local_date():
    return get_current_local_time().date()
