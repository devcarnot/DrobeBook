import { describe, expect, it } from "vitest";

import {
  BOOKING_ID_KEY,
  LINKED_BOOKING_ID_KEY,
  buildMainDescriptor,
  findOrphanedProtectionKeys,
  looksLikeVariantSummary,
} from "./cart-behavior";

describe("cart-behavior", () => {
  it("builds a stable descriptor for booking items", () => {
    expect(
      buildMainDescriptor({
        key: "gown",
        product_title: "Evangeline Gown - Espresso",
        properties: {
          Size: "6",
          Duration: "4 Days",
          Color: "Espresso",
        },
      }),
    ).toBe("Evangeline Gown - Espresso [6 / 4 Days / Espresso]");
  });

  it("finds orphaned protection when the linked booking id is gone", () => {
    const orphaned = findOrphanedProtectionKeys({
      items: [
        {
          key: "protection",
          product_title: "Accidental Damage protection",
          properties: {
            "For item": "Evangeline Gown - Espresso [6 / 4 Days / Espresso]",
            [LINKED_BOOKING_ID_KEY]: "booking-1",
          },
        },
      ],
    });

    expect(orphaned).toEqual(["protection"]);
  });

  it("keeps protection while the linked booking item is still in cart", () => {
    const orphaned = findOrphanedProtectionKeys({
      items: [
        {
          key: "gown",
          product_title: "Evangeline Gown - Espresso",
          properties: {
            Size: "6",
            Duration: "4 Days",
            [BOOKING_ID_KEY]: "booking-1",
          },
        },
        {
          key: "protection",
          product_title: "Accidental Damage protection",
          properties: {
            "For item": "Evangeline Gown - Espresso [6 / 4 Days]",
            [LINKED_BOOKING_ID_KEY]: "booking-1",
          },
        },
      ],
    });

    expect(orphaned).toEqual([]);
  });

  it("removes protection by matching For item when booking ids are missing", () => {
    const orphaned = findOrphanedProtectionKeys({
      items: [
        {
          key: "protection",
          product_title: "Accidental Damage protection",
          properties: {
            "For item": "Evangeline Gown - Espresso [6 / 4 Days / Espresso]",
          },
        },
      ],
    });

    expect(orphaned).toEqual(["protection"]);
  });

  it("matches older For item descriptors that included inventory counts", () => {
    const orphaned = findOrphanedProtectionKeys({
      items: [
        {
          key: "protection",
          product_title: "Accidental Damage protection",
          properties: {
            "For item":
              "Evangeline Gown - Espresso [6 (2) / 4 Days / Espresso]",
          },
        },
      ],
    });

    expect(orphaned).toEqual(["protection"]);
  });

  it("detects unlabeled variant summary text", () => {
    expect(looksLikeVariantSummary("6, 4 Days")).toBe(true);
    expect(looksLikeVariantSummary("6 / 4 Days")).toBe(true);
    expect(looksLikeVariantSummary("Size: 6")).toBe(false);
  });
});
