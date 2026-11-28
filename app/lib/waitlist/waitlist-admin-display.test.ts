import { describe, expect, it } from "vitest";

import {
  deliveryDateFromWaitlistEvent,
  parseWaitlistEntryNotes,
} from "./waitlist-admin-display";

describe("parseWaitlistEntryNotes", () => {
  it("splits delivery prefix from customer message", () => {
    const result = parseWaitlistEntryNotes(
      "Delivery start: 15 November 2026\nSIZE: 6\nTesting",
    );
    expect(result.deliveryFromNotes).toBe("15 November 2026");
    expect(result.customerMessage).toBe("SIZE: 6\nTesting");
  });

  it("returns nulls for empty notes", () => {
    expect(parseWaitlistEntryNotes(null)).toEqual({
      customerMessage: null,
      deliveryFromNotes: null,
    });
  });
});

describe("deliveryDateFromWaitlistEvent", () => {
  it("is one day before event", () => {
    const event = new Date("2026-11-16T00:00:00.000Z");
    const delivery = deliveryDateFromWaitlistEvent(event);
    expect(delivery?.toISOString().slice(0, 10)).toBe("2026-11-15");
  });
});