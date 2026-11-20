/** Sunday-start month grid (SU…SA headers). All dates use UTC noon to avoid DST edge cases. */

export const CALENDAR_WEEKDAY_HEADERS = [
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
] as const;

export function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function startWeekdaySundayUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).getUTCDay();
}

export function formatCalendarIso(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export type MonthGridCell = number | null;

export function buildSundayStartMonthCells(
  year: number,
  month: number,
): { leadingDays: number; daysInMonth: number; cells: MonthGridCell[] } {
  const daysInMonth = daysInUtcMonth(year, month);
  const leadingDays = startWeekdaySundayUtc(year, month);
  const cells: MonthGridCell[] = [];

  for (let i = 0; i < leadingDays; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return { leadingDays, daysInMonth, cells };
}