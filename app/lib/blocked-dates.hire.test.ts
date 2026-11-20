import { describe, expect, it } from "vitest";

import {
  hireWindowBlockedByRule,
  weekdayBit,
} from "./blocked-dates.logic";
import {
  formatDateIso,
  isProductVariantAvailable,
  type HireDurationDays,
} from "./booking/availability";
import { DEFAULT_BUFFER_CONFIG } from "./booking/buffer-config";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

const saturdayOnlyWeekly = {
  blockKind: "weekly" as const,
  startDate: d("1970-01-01"),
  endDate: d("2099-12-31"),
  weekdayMask: weekdayBit(6),
  appliesToHire: true,
  appliesToTryOn: true,
  appliesToPost: true,
  appliesToPickup: false,
  productId: null,
  variantId: null,
};

function simulateMonthUnavailable(
  durationDays: HireDurationDays,
  blockedDates: Parameters<typeof isProductVariantAvailable>[0]["blockedDates"],
  year: number,
  month: number,
) {
  const unavailable: string[] = [];
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

  for (let day = 1; day <= totalDays; day += 1) {
    const deliveryDate = new Date(Date.UTC(year, month - 1, day));
    const result = isProductVariantAvailable({
      productId: "p1",
      variantId: "v1",
      deliveryDate,
      durationDays,
      today: d("2026-11-01"),
      bookings: [],
      blockedDates,
    });
    if (!result.available) {
      unavailable.push(formatDateIso(deliveryDate));
    }
  }

  return unavailable;
}

describe("hire blocked dates — calendar behaviour", () => {
  it("weekly Saturday block does not disable the whole month for 4-day hire", () => {
    const blockedDates = [
      {
        startDate: d("1970-01-01"),
        endDate: d("2099-12-31"),
        blockKind: "weekly" as const,
        weekdayMask: weekdayBit(6),
        appliesToHire: true,
        appliesToTryOn: true,
      },
    ];

    const unavailable = simulateMonthUnavailable(4, blockedDates, 2026, 11);
    const allNovember = unavailable.length;

    expect(allNovember).toBeLessThan(20);
    expect(unavailable).toContain("2026-11-21");
    expect(unavailable).toContain("2026-11-28");
    expect(unavailable).not.toContain("2026-11-23");
    expect(unavailable).not.toContain("2026-11-24");
  });

  it("8-day hire stays available when only Saturday is blocked (rental may span Saturday)", () => {
    const blockedDates = [
      {
        startDate: d("1970-01-01"),
        endDate: d("2099-12-31"),
        blockKind: "weekly" as const,
        weekdayMask: weekdayBit(6),
        appliesToHire: true,
      },
    ];

    const result = isProductVariantAvailable({
      productId: "p1",
      variantId: "v1",
      deliveryDate: d("2026-11-22"),
      durationDays: 8,
      today: d("2026-11-01"),
      bookings: [],
      blockedDates,
    });

    expect(result.available).toBe(true);
  });

  it("date range marks every in-range delivery day unavailable", () => {
    const blockedDates = [
      {
        startDate: d("2026-11-10"),
        endDate: d("2026-11-14"),
        blockKind: "range" as const,
        appliesToHire: true,
      },
    ];

    const unavailable = simulateMonthUnavailable(4, blockedDates, 2026, 11);

    expect(unavailable).toContain("2026-11-10");
    expect(unavailable).toContain("2026-11-11");
    expect(unavailable).toContain("2026-11-12");
    expect(unavailable).toContain("2026-11-13");
    expect(unavailable).toContain("2026-11-14");
    expect(unavailable).not.toContain("2026-11-09");
    expect(unavailable).not.toContain("2026-11-15");
  });

  it("hireWindowBlockedByRule treats Saturday delivery as blocked", () => {
    expect(
      hireWindowBlockedByRule(
        d("2026-11-21"),
        d("2026-11-24"),
        d("2026-11-21"),
        d("2026-11-24"),
        saturdayOnlyWeekly,
        "post",
      ),
    ).toBe(true);
  });

  it("studio pickup ignores post-only weekend blocks", () => {
    const blockedDates = [
      {
        startDate: d("1970-01-01"),
        endDate: d("2099-12-31"),
        blockKind: "weekly" as const,
        weekdayMask: weekdayBit(0) | weekdayBit(6),
        appliesToHire: true,
        appliesToPost: true,
        appliesToPickup: false,
      },
    ];

    const saturday = isProductVariantAvailable({
      productId: "p1",
      variantId: "v1",
      deliveryDate: d("2026-11-21"),
      durationDays: 4,
      deliveryMethod: "pickup",
      today: d("2026-11-01"),
      bookings: [],
      blockedDates,
    });

    expect(saturday.available).toBe(true);

    const postSaturday = isProductVariantAvailable({
      productId: "p1",
      variantId: "v1",
      deliveryDate: d("2026-11-21"),
      durationDays: 4,
      deliveryMethod: "post",
      today: d("2026-11-01"),
      bookings: [],
      blockedDates,
    });

    expect(postSaturday.available).toBe(false);
  });

  it("December post + buffers: only weekend delivery starts are blocked", () => {
    const weekendRule = {
      startDate: d("1970-01-01"),
      endDate: d("2099-12-31"),
      blockKind: "weekly" as const,
      weekdayMask: weekdayBit(0) | weekdayBit(6),
      appliesToHire: true,
      appliesToPost: true,
      appliesToPickup: false,
    };

    const now = d("2026-11-20");
    const unavailable: string[] = [];

    for (let day = 1; day <= 31; day += 1) {
      const deliveryDate = new Date(Date.UTC(2026, 11, day));
      const result = isProductVariantAvailable({
        productId: "p1",
        variantId: "v1",
        deliveryDate,
        durationDays: 4,
        deliveryMethod: "post",
        now,
        today: now,
        bufferConfig: DEFAULT_BUFFER_CONFIG,
        holidays: new Set(),
        bookings: [],
        blockedDates: [weekendRule],
      });
      if (!result.available) {
        unavailable.push(formatDateIso(deliveryDate));
      }
    }

    for (const iso of [
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
      "2026-12-06",
    ]) {
      expect(
        unavailable.includes(iso),
        `unexpected availability for ${iso}`,
      ).toBe(iso === "2026-12-05" || iso === "2026-12-06");
    }
    expect(unavailable).not.toContain("2026-12-03");
    expect(unavailable).not.toContain("2026-12-04");
  });

  it("shop-wide date range blocks only in-range delivery starts (not buffer spillover)", () => {
    const weekendRange = {
      startDate: d("2026-12-05"),
      endDate: d("2026-12-06"),
      blockKind: "range" as const,
      appliesToHire: true,
      appliesToPost: true,
      appliesToPickup: false,
    };

    const now = d("2026-11-20");
    const check = (iso: string) =>
      isProductVariantAvailable({
        productId: "p1",
        variantId: "v1",
        deliveryDate: d(iso),
        durationDays: 4,
        deliveryMethod: "post",
        now,
        today: now,
        bufferConfig: DEFAULT_BUFFER_CONFIG,
        holidays: new Set(),
        bookings: [],
        blockedDates: [weekendRange],
      });

    expect(check("2026-12-03").available).toBe(true);
    expect(check("2026-12-04").available).toBe(true);
    expect(check("2026-12-05").available).toBe(false);
    expect(check("2026-12-06").available).toBe(false);
    expect(check("2026-12-07").available).toBe(true);
  });

});