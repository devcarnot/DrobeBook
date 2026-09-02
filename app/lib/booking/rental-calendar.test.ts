import { describe, expect, it } from "vitest";

import { buildMonthWeeks, layoutCalendarBars } from "./rental-calendar";

describe("rental calendar layout", () => {
  it("builds week rows for a month", () => {
    const weeks = buildMonthWeeks(2026, 9);
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    expect(weeks[0]).toHaveLength(7);
  });

  it("lays out a multi-day booking across week boundaries", () => {
    const events = [
      {
        id: "booking-1",
        startDate: "2026-09-08",
        endDate: "2026-09-12",
      },
    ];

    const { segments } = layoutCalendarBars(events, 2026, 9);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.some((segment) => segment.colStart >= 1)).toBe(true);
  });

  it("stacks overlapping bookings in separate lanes", () => {
    const events = [
      { id: "a", startDate: "2026-09-10", endDate: "2026-09-12" },
      { id: "b", startDate: "2026-09-11", endDate: "2026-09-13" },
    ];

    const { segments } = layoutCalendarBars(events, 2026, 9);
    const weekSegments = segments.filter((segment) => segment.weekIndex === 1);
    const lanes = new Set(weekSegments.map((segment) => segment.lane));
    expect(lanes.size).toBeGreaterThan(1);
  });
});
