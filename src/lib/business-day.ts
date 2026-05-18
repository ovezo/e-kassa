/** Business day runs 06:00 → 06:00 (next calendar day) in system local time. */
export const BUSINESS_DAY_START_HOUR = 6;

/** Inclusive start, exclusive end: [start, end). */
export function getBusinessDayRange(
  now: Date = new Date(),
): { start: Date; end: Date } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const hour = now.getHours();

  let start: Date;
  let end: Date;

  if (hour < BUSINESS_DAY_START_HOUR) {
    start = new Date(year, month, day - 1, BUSINESS_DAY_START_HOUR, 0, 0, 0);
    end = new Date(year, month, day, BUSINESS_DAY_START_HOUR, 0, 0, 0);
  } else {
    start = new Date(year, month, day, BUSINESS_DAY_START_HOUR, 0, 0, 0);
    end = new Date(year, month, day + 1, BUSINESS_DAY_START_HOUR, 0, 0, 0);
  }

  return { start, end };
}

export function formatBusinessDayRange(
  start: Date,
  end: Date,
  locale?: string,
): string {
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
