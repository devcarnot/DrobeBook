import { describe, expect, it } from "vitest";

import {
  isBookingLineItem,
  parseBookingLineItem,
  parseDisplayDate,
} from "./order-booking.server";

describe("order-booking", () => {
  it("parses display dates from booking widget format", () => {
    const date = parseDisplayDate("7 September 2026");
    expect(date?.toISOString().slice(0, 10)).toBe("2026-09-07");
  });

  it("detects gown hire line items", () => {
    expect(
      isBookingLineItem({
        properties: [{ name: "_gk_booking_id", value: "abc-123" }],
      }),
    ).toBe(true);
  });

  it("parses a booking line item from order payload", () => {
    const parsed = parseBookingLineItem({
      product_id: 123,
      variant_id: 456,
      price: "249.00",
      properties: [
        { name: "_gk_booking_id", value: "2891ab2f-52f7-45aa-af8a-af9212efb294" },
        { name: "_Size", value: "6" },
        { name: "_Duration", value: "4 Days" },
        { name: "Delivery Date", value: "7 September 2026" },
        { name: "Return Date", value: "10 September 2026" },
        { name: "Event Date", value: "8 September 2026" },
        { name: "Delivery Method", value: "Post" },
      ],
    });

    expect(parsed?.bookingId).toBe("2891ab2f-52f7-45aa-af8a-af9212efb294");
    expect(parsed?.productId).toBe("123");
    expect(parsed?.variantId).toBe("456");
    expect(parsed?.size).toBe("6");
    expect(parsed?.deliveryMethod).toBe("post");
    expect(parsed?.deliveryDate.toISOString().slice(0, 10)).toBe("2026-09-07");
  });

  it("accepts legacy Size and Duration property names", () => {
    const parsed = parseBookingLineItem({
      product_id: 123,
      variant_id: 456,
      price: "249.00",
      properties: [
        { name: "_gk_booking_id", value: "booking-legacy" },
        { name: "Size", value: "8" },
        { name: "Duration", value: "8 Days" },
        { name: "Delivery Date", value: "7 September 2026" },
        { name: "Return Date", value: "14 September 2026" },
        { name: "Event Date", value: "8 September 2026" },
        { name: "Delivery Method", value: "Post" },
      ],
    });

    expect(parsed?.size).toBe("8");
    expect(parsed?.durationDays).toBe(8);
  });
});
