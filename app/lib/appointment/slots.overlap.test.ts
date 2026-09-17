import { describe, expect, it } from "vitest";

import {
  appointmentOccupiesSlot,
  formatSlotOptionLabel,
  timeRangesOverlap,
  timeToMinutes,
  type AppointmentSlotView,
} from "./slots";

describe("appointment time overlap", () => {
  it("parses HH:MM to minutes", () => {
    expect(timeToMinutes("10:00")).toBe(600);
    expect(timeToMinutes("10:30")).toBe(630);
    expect(timeToMinutes("13:00")).toBe(780);
  });

  it("detects overlapping ranges", () => {
    expect(timeRangesOverlap(600, 650, 600, 630)).toBe(true);
    expect(timeRangesOverlap(600, 650, 630, 650)).toBe(true);
    expect(timeRangesOverlap(600, 650, 650, 680)).toBe(false);
    expect(timeRangesOverlap(600, 630, 630, 660)).toBe(false);
  });

  it("syncs a 50-min booking onto overlapping 30 and 20 min slots", () => {
    // 10:00–10:50 booking
    expect(appointmentOccupiesSlot("10:00", 50, "10:00", 50)).toBe(true);
    expect(appointmentOccupiesSlot("10:00", 50, "10:00", 30)).toBe(true);
    expect(appointmentOccupiesSlot("10:00", 50, "10:00", 20)).toBe(true);
    expect(appointmentOccupiesSlot("10:00", 50, "10:30", 20)).toBe(true);
    expect(appointmentOccupiesSlot("10:00", 50, "10:30", 30)).toBe(true);
    // Next hour should stay free
    expect(appointmentOccupiesSlot("10:00", 50, "11:00", 50)).toBe(false);
    expect(appointmentOccupiesSlot("10:00", 50, "11:00", 30)).toBe(false);
  });

  it("syncs a 30-min booking onto overlapping 50 and 20 min slots", () => {
    expect(appointmentOccupiesSlot("10:00", 30, "10:00", 50)).toBe(true);
    expect(appointmentOccupiesSlot("10:00", 30, "10:00", 20)).toBe(true);
    expect(appointmentOccupiesSlot("10:00", 30, "10:30", 20)).toBe(false);
  });

  it("formats sold out labels like the reference UI", () => {
    const soldOut: AppointmentSlotView = {
      time: "14:00",
      endTime: "14:50",
      label: "2 pm - 2:50 pm",
      durationMinutes: 50,
      capacity: 3,
      bookedCount: 3,
      available: 0,
      soldOut: true,
    };
    expect(formatSlotOptionLabel(soldOut)).toBe("2 pm - 2:50 pm / Sold out");
  });
});
