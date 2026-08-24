import { describe, expect, it } from "vitest";

import {
  addDays,
  computeReturnDate,
  dateRangesOverlap,
  formatDateIso,
  isProductVariantAvailable,
  meetsLeadTime,
  toDateOnly,
} from "./availability";

const d = (iso: string) => toDateOnly(new Date(`${iso}T12:00:00.000Z`));

describe("booking availability rules", () => {
  it("computes return date from delivery date and duration", () => {
    expect(formatDateIso(computeReturnDate(d("2026-03-01"), 4))).toBe(
      "2026-03-04",
    );
    expect(formatDateIso(computeReturnDate(d("2026-03-01"), 8))).toBe(
      "2026-03-08",
    );
  });

  it("enforces the 4-day lead time", () => {
    const today = d("2026-03-01");

    expect(meetsLeadTime(d("2026-03-04"), today)).toBe(false);
    expect(meetsLeadTime(d("2026-03-05"), today)).toBe(true);
  });

  it("detects overlapping booking ranges", () => {
    expect(
      dateRangesOverlap(
        { start: d("2026-03-10"), end: d("2026-03-14") },
        { start: d("2026-03-12"), end: d("2026-03-16") },
      ),
    ).toBe(true);

    expect(
      dateRangesOverlap(
        { start: d("2026-03-10"), end: d("2026-03-14") },
        { start: d("2026-03-15"), end: d("2026-03-18") },
      ),
    ).toBe(false);

    expect(
      dateRangesOverlap(
        { start: d("2026-03-10"), end: d("2026-03-14") },
        { start: d("2026-03-14"), end: d("2026-03-18") },
      ),
    ).toBe(true);
  });

  it("marks unavailable when an active booking overlaps", () => {
    const result = isProductVariantAvailable({
      productId: "prod-1",
      variantId: "var-8",
      deliveryDate: d("2026-04-10"),
      durationDays: 4,
      today: d("2026-04-01"),
      bookings: [
        {
          startDate: d("2026-04-08"),
          endDate: d("2026-04-12"),
          status: "confirmed",
        },
      ],
      blockedDates: [],
    });

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/already booked/i);
  });

  it("ignores cancelled bookings", () => {
    const result = isProductVariantAvailable({
      productId: "prod-1",
      variantId: "var-8",
      deliveryDate: d("2026-04-10"),
      durationDays: 4,
      today: d("2026-04-01"),
      bookings: [
        {
          startDate: d("2026-04-10"),
          endDate: d("2026-04-14"),
          status: "cancelled",
        },
      ],
      blockedDates: [],
    });

    expect(result.available).toBe(true);
  });

  it("marks unavailable when a blocked date falls inside the hire window", () => {
    const result = isProductVariantAvailable({
      productId: "prod-1",
      variantId: "var-8",
      deliveryDate: d("2026-04-10"),
      durationDays: 4,
      today: d("2026-04-01"),
      bookings: [],
      blockedDates: [
        {
          date: d("2026-04-12"),
          productId: "prod-1",
          variantId: "var-8",
          reason: "Cleaning turnaround",
        },
      ],
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe("Cleaning turnaround");
  });

  it("respects product and variant scoping on blocked dates", () => {
    const availableForOtherVariant = isProductVariantAvailable({
      productId: "prod-1",
      variantId: "var-10",
      deliveryDate: d("2026-04-10"),
      durationDays: 4,
      today: d("2026-04-01"),
      bookings: [],
      blockedDates: [
        {
          date: d("2026-04-12"),
          productId: "prod-1",
          variantId: "var-8",
        },
      ],
    });

    expect(availableForOtherVariant.available).toBe(true);
  });

  it("treats shop-wide blocked dates as applying to all variants", () => {
    const result = isProductVariantAvailable({
      productId: "prod-1",
      variantId: "var-10",
      deliveryDate: d("2026-04-10"),
      durationDays: 4,
      today: d("2026-04-01"),
      bookings: [],
      blockedDates: [
        {
          date: d("2026-04-11"),
          productId: null,
          variantId: null,
        },
      ],
    });

    expect(result.available).toBe(false);
  });

  it("addDays advances calendar dates correctly across month boundaries", () => {
    expect(formatDateIso(addDays(d("2026-01-30"), 4))).toBe("2026-02-03");
  });
});
