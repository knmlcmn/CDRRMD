const MANILA_TIME_ZONE = 'Asia/Manila';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function calendarDayInManila(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = partValue('year');
  const month = partValue('month');
  const day = partValue('day');

  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function isInCurrentManilaWeek(value: string | number | Date | null | undefined, now = new Date()) {
  if (value == null || value === '') return false;

  const recordDay = calendarDayInManila(value);
  const today = calendarDayInManila(now);
  if (recordDay == null || today == null) return false;

  const mondayOffset = (new Date(today).getUTCDay() + 6) % 7;
  const weekStart = today - mondayOffset * ONE_DAY_MS;
  return recordDay >= weekStart && recordDay < weekStart + 7 * ONE_DAY_MS;
}
