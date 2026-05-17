/** Business day runs 06:00 → 06:00 (next calendar day) in the venue timezone. */
export const BUSINESS_DAY_START_HOUR = 6;

/** IANA timezone for day boundaries (override with IKASSIR_TIMEZONE). */
export const DEFAULT_BUSINESS_TIMEZONE =
  process.env.IKASSIR_TIMEZONE?.trim() || "Asia/Ashgabat";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    formatter.formatToParts(instant).find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: Number(pick("hour")),
  };
}

function getTimeZoneOffsetMs(at: Date, timeZone: string): number {
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const zoned = new Date(at.toLocaleString("en-US", { timeZone }));
  return zoned.getTime() - utc.getTime();
}

/** Wall-clock date/time in `timeZone` as a UTC instant. */
function zonedWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
  timeZone: string,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(wallAsUtc), timeZone);
  let utc = wallAsUtc - offset;
  const refined = getTimeZoneOffsetMs(new Date(utc), timeZone);
  if (refined !== offset) utc = wallAsUtc - refined;
  return new Date(utc);
}

function calendarDayBefore(year: number, month: number, day: number): {
  year: number;
  month: number;
  day: number;
} {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - 1);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function calendarDayAfter(year: number, month: number, day: number): {
  year: number;
  month: number;
  day: number;
} {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + 1);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Inclusive start, exclusive end: [start, end). */
export function getBusinessDayRange(
  now: Date = new Date(),
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
): { start: Date; end: Date; timeZone: string } {
  const { year, month, day, hour } = getZonedParts(now, timeZone);

  const businessDate =
    hour < BUSINESS_DAY_START_HOUR
      ? calendarDayBefore(year, month, day)
      : { year, month, day };

  const start = zonedWallTimeToDate(
    businessDate.year,
    businessDate.month,
    businessDate.day,
    BUSINESS_DAY_START_HOUR,
    0,
    0,
    timeZone,
  );
  const nextDay = calendarDayAfter(
    businessDate.year,
    businessDate.month,
    businessDate.day,
  );
  const end = zonedWallTimeToDate(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    BUSINESS_DAY_START_HOUR,
    0,
    0,
    timeZone,
  );

  return { start, end, timeZone };
}

export function formatBusinessDayRange(
  start: Date,
  end: Date,
  locale?: string,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  };
  const loc = locale ?? undefined;
  const endShown = new Date(end.getTime() - 1);
  return `${start.toLocaleString(loc, opts)} – ${endShown.toLocaleString(loc, opts)}`;
}
