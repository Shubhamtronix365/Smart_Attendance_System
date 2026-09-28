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
    const cleanStr = isoStr.replace(' ', 'T');

    // If string has date + time without explicit UTC timezone indicator (e.g. "2026-09-28T17:14:10")
    // format directly from the time components to preserve exact local punch time
    const match = cleanStr.match(/[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match && !cleanStr.endsWith('Z') && !cleanStr.includes('+')) {
      const hours = parseInt(match[1], 10);
      const minutes = match[2];
      const seconds = match[3] || '00';
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return includeSeconds
        ? `${String(h12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`
        : `${String(h12).padStart(2, '0')}:${minutes} ${ampm}`;
    }

    // Otherwise, parse as Date (e.g. UTC ISO string ending in Z or with timezone offset)
    const dateObj = new Date(cleanStr);
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
