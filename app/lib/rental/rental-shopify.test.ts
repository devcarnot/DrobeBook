import { describe, expect, it } from "vitest";

import { resolveOrderCustomerNames } from "./rental-shopify.server";
import type { CreateRentalInput } from "./rental.server";

function baseInput(
  overrides: Partial<CreateRentalInput> = {},
): CreateRentalInput {
  return {
    shopifyOrderMode: "draft",
    customerFirstName: "",
    customerLastName: "",
    customerName: "",
    customerEmail: "test@example.com",
    productId: "1",
    variantId: "1",
    productTitle: "Gown",
    size: "8",
    deliveryMethod: "post",
    rentalStart: "2026-11-01",
    rentalEnd: "2026-11-05",
    eventDate: "2026-11-05",
    bufferBeforeDays: 0,
    bufferBeforeUnit: "calendar",
    bufferAfterDays: 0,
    bufferAfterUnit: "calendar",
    workflowStatus: "confirmed",
    rentalNotes: "",
    fulfillmentTrackingNumber: "",
    fulfillmentTrackingLink: "",
    returnTrackingNumber: "",
    returnTrackingLink: "",
    tags: [],
    deliveryAddress: {
      address1: "",
      address2: "",
      city: "",
      province: "",
      zip: "",
      country: "",
    },
    ...overrides,
  };
}

describe("resolveOrderCustomerNames", () => {
  it("prefers explicit first and last name fields", () => {
    expect(
      resolveOrderCustomerNames(
        baseInput({ customerFirstName: "Georgie", customerLastName: "Kelly" }),
      ),
    ).toEqual({ firstName: "Georgie", lastName: "Kelly" });
  });

  it("falls back to splitting customerName", () => {
    expect(
      resolveOrderCustomerNames(baseInput({ customerName: "Alex Morgan" })),
    ).toEqual({ firstName: "Alex", lastName: "Morgan" });
  });
});
