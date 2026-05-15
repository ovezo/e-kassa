/** Business day runs 06:00 → 06:00 (next calendar day). */
export const BUSINESS_DAY_START_HOUR = 6;

/** Inclusive start, exclusive end: [start, end). */
export function getBusinessDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  if (start.getHours() < BUSINESS_DAY_START_HOUR) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export function formatBusinessDayRange(start: Date, end: Date, locale?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const loc = locale ?? undefined;
  const endShown = new Date(end.getTime() - 1);
  return `${start.toLocaleString(loc, opts)} – ${endShown.toLocaleString(loc, opts)}`;
}
