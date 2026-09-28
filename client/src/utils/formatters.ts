/**
 * Standardized Date & Time Formatters
 * Formats ISO strings, UTC datetimes, and timestamps into clean, human-readable strings.
 */

export function formatTime(
  isoStr: string | null | undefined,
  includeSeconds = true
): string {
  if (!isoStr || isoStr === '—' || isoStr === '-') return '—';

  try {
    // If it's already a simple time string like '09:15:30' or '09:15'
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(isoStr)) {
      const parts = isoStr.split(':');
      const hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      const seconds = parts[2] || '00';
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return includeSeconds
        ? `${String(h12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`
        : `${String(h12).padStart(2, '0')}:${minutes} ${ampm}`;
    }

    // Parse ISO or SQL datetime
    let dateObj: Date;
    const cleanStr = isoStr.replace(' ', 'T');

    if (cleanStr.endsWith('Z') || cleanStr.includes('+')) {
      dateObj = new Date(cleanStr);
    } else {
      // If datetime was saved in UTC (e.g. from Python datetime.utcnow()), append Z
      dateObj = new Date(`${cleanStr}Z`);
      if (isNaN(dateObj.getTime())) {
        dateObj = new Date(cleanStr);
      }
    }

    if (isNaN(dateObj.getTime())) {
      return isoStr;
    }

    return dateObj.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: true,
    });
  } catch {
    return String(isoStr);
  }
}

export function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

export function formatCurrency(amount: number | null | undefined): string {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString("en-IN")}`;
}
