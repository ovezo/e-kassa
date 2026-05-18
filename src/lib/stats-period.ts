import { getBusinessDayRange } from "./business-day";

export type StatsPeriod = "day" | "week" | "month";

export type PeriodRange = { start: Date; end: Date };

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

/** Monday 00:00:00 local time. */
export function getWeekStart(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function getPeriodRanges(
  period: StatsPeriod,
  now: Date = new Date(),
): { current: PeriodRange; previous: PeriodRange } {
  switch (period) {
    case "day": {
      const { start } = getBusinessDayRange(now);
      return {
        current: { start, end: now },
        previous: { start: addDays(start, -1), end: addDays(now, -1) },
      };
    }
    case "week": {
      const start = getWeekStart(now);
      return {
        current: { start, end: now },
        previous: { start: addDays(start, -7), end: addDays(now, -7) },
      };
    }
    case "month": {
      const start = getMonthStart(now);
      return {
        current: { start, end: now },
        previous: { start: addMonths(start, -1), end: addMonths(now, -1) },
      };
    }
  }
}
