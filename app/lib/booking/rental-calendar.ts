/**
 * Pure layout helpers for the admin rental calendar (ProductRentalsPro-style).
 */

export type CalendarEventInput = {
  id: string;
  startDate: string;
  endDate: string;
};

export type CalendarDayCell = {
  iso: string | null;
  dayNumber: number | null;
};

export type CalendarWeek = CalendarDayCell[];

export type CalendarBarSegment<T extends CalendarEventInput = CalendarEventInput> = {
  event: T;
  weekIndex: number;
  colStart: number;
  colEnd: number;
  lane: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDateOnly(iso: string): Date {
  const match = ISO_DATE.exec(iso);
  if (!match) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDateOnly(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

export function buildMonthWeeks(year: number, month: number): CalendarWeek[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingPadding = (firstWeekday + 6) % 7;

  const cells: CalendarDayCell[] = [];

  for (let index = 0; index < leadingPadding; index += 1) {
    cells.push({ iso: null, dayNumber: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ iso, dayNumber: day });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ iso: null, dayNumber: null });
  }

  const weeks: CalendarWeek[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

function weekDateRange(week: CalendarWeek): { start: string; end: string } | null {
  const dates = week.map((cell) => cell.iso).filter(Boolean) as string[];
  if (dates.length === 0) {
    return null;
  }
  return { start: dates[0], end: dates[dates.length - 1] };
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function segmentColumns(
  eventStart: string,
  eventEnd: string,
  week: CalendarWeek,
): { colStart: number; colEnd: number } | null {
  const range = weekDateRange(week);
  if (!range || !rangesOverlap(eventStart, eventEnd, range.start, range.end)) {
    return null;
  }

  let colStart: number | null = null;
  let colEnd: number | null = null;

  for (let index = 0; index < week.length; index += 1) {
    const iso = week[index].iso;
    if (!iso || iso < eventStart || iso > eventEnd) {
      continue;
    }
    if (colStart === null) {
      colStart = index + 1;
    }
    colEnd = index + 1;
  }

  if (colStart === null || colEnd === null) {
    return null;
  }

  return { colStart, colEnd };
}

function segmentsCollide(
  a: Pick<CalendarBarSegment, "colStart" | "colEnd" | "lane">,
  b: Pick<CalendarBarSegment, "colStart" | "colEnd" | "lane">,
): boolean {
  return a.lane === b.lane && a.colStart <= b.colEnd && b.colStart <= a.colEnd;
}

export function layoutCalendarBars<T extends CalendarEventInput>(
  events: T[],
  year: number,
  month: number,
): { weeks: CalendarWeek[]; segments: CalendarBarSegment<T>[] } {
  const weeks = buildMonthWeeks(year, month);
  const segments: CalendarBarSegment<T>[] = [];

  for (const event of events) {
    weeks.forEach((week, weekIndex) => {
      const columns = segmentColumns(event.startDate, event.endDate, week);
      if (!columns) {
        return;
      }

      let lane = 0;
      while (
        segments.some(
          (existing) =>
            existing.weekIndex === weekIndex &&
            segmentsCollide(existing, { ...columns, lane }),
        )
      ) {
        lane += 1;
      }

      segments.push({
        event,
        weekIndex,
        colStart: columns.colStart,
        colEnd: columns.colEnd,
        lane,
      });
    });
  }

  return { weeks, segments };
}

export function maxLaneByWeek(segments: CalendarBarSegment[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const segment of segments) {
    const current = map.get(segment.weekIndex) ?? 0;
    map.set(segment.weekIndex, Math.max(current, segment.lane + 1));
  }
  return map;
}

/** Turnaround buffer shown after return (cleaning / prep), matching reference apps. */
export const END_BUFFER_DAYS = 2;

export function withEndBuffer(endDate: string): string {
  return addDaysIso(endDate, END_BUFFER_DAYS);
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
