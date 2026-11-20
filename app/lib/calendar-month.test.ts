import { describe, expect, it } from "vitest";

import {
  buildSundayStartMonthCells,
  formatCalendarIso,
  startWeekdaySundayUtc,
} from "./calendar-month";

describe("calendar-month (Sunday-start, UTC)", () => {
  it("December 2026 starts on Tuesday with correct cell positions", () => {
    expect(startWeekdaySundayUtc(2026, 12)).toBe(2);

    const { leadingDays, cells } = buildSundayStartMonthCells(2026, 12);
    expect(leadingDays).toBe(2);
    expect(cells[0]).toBe(null);
    expect(cells[1]).toBe(null);
    expect(cells[2]).toBe(1);
    expect(cells[4]).toBe(3);
    expect(cells[7]).toBe(6);

    const day5Index = cells.indexOf(5);
    const day6Index = cells.indexOf(6);
    expect(day5Index % 7).toBe(6);
    expect(day6Index % 7).toBe(0);
    expect(formatCalendarIso(2026, 12, 5)).toBe("2026-12-05");
  });
});