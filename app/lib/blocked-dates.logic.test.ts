import { describe, expect, it } from "vitest";

import {
  formatWeekdayMask,
  hireWindowBlockedByRule,
  isDateBlockedByRule,
  weekdayBit,
} from "./blocked-dates.logic";

describe("blocked-dates.logic", () => {
  it("blocks saturday and sunday weekly rules", () => {
    const rule = {
      blockKind: "weekly" as const,
      startDate: new Date("1970-01-01T12:00:00.000Z"),
      endDate: new Date("2099-12-31T12:00:00.000Z"),
      weekdayMask: weekdayBit(0) | weekdayBit(6),
      appliesToHire: true,
      appliesToTryOn: true,
      productId: null,
      variantId: null,
      reason: "Weekend",
    };

    expect(
      isDateBlockedByRule(
        new Date("2026-11-22T12:00:00.000Z"),
        rule,
        "hire",
      ),
    ).toBe(true);
    expect(
      isDateBlockedByRule(
        new Date("2026-11-21T12:00:00.000Z"),
        rule,
        "try_on",
      ),
    ).toBe(true);
    expect(
      isDateBlockedByRule(
        new Date("2026-11-24T12:00:00.000Z"),
        rule,
        "hire",
      ),
    ).toBe(false);
  });

  it("scopes hire vs try-on", () => {
    const rule = {
      blockKind: "weekly" as const,
      startDate: new Date("1970-01-01T12:00:00.000Z"),
      endDate: new Date("2099-12-31T12:00:00.000Z"),
      weekdayMask: weekdayBit(1),
      appliesToHire: true,
      appliesToTryOn: false,
      productId: null,
      variantId: null,
    };

    const monday = new Date("2026-11-23T12:00:00.000Z");
    expect(isDateBlockedByRule(monday, rule, "hire")).toBe(true);
    expect(isDateBlockedByRule(monday, rule, "try_on")).toBe(false);
  });

  it("hireWindowBlockedByRule blocks Saturday delivery but not mid-week span", () => {
    const rule = {
      blockKind: "weekly" as const,
      startDate: new Date("1970-01-01T12:00:00.000Z"),
      endDate: new Date("2099-12-31T12:00:00.000Z"),
      weekdayMask: weekdayBit(6),
      appliesToHire: true,
      appliesToTryOn: false,
      productId: null,
      variantId: null,
    };

    expect(
      hireWindowBlockedByRule(
        new Date("2026-11-21T12:00:00.000Z"),
        new Date("2026-11-24T12:00:00.000Z"),
        new Date("2026-11-21T12:00:00.000Z"),
        new Date("2026-11-24T12:00:00.000Z"),
        rule,
      ),
    ).toBe(true);

    expect(
      hireWindowBlockedByRule(
        new Date("2026-11-23T12:00:00.000Z"),
        new Date("2026-11-26T12:00:00.000Z"),
        new Date("2026-11-23T12:00:00.000Z"),
        new Date("2026-11-26T12:00:00.000Z"),
        rule,
      ),
    ).toBe(false);
  });

  it("formats weekday mask for admin display", () => {
    expect(formatWeekdayMask(weekdayBit(0) | weekdayBit(6))).toBe("Sunday, Saturday");
  });
});