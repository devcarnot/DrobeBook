import { describe, expect, it } from "vitest";

import {
  DEFAULT_HIRE_ADDONS_HEADING,
  MAX_HIRE_ADDONS,
  normalizeAddOnsHeading,
  normalizeHireAddOns,
} from "./hire-add-ons";

describe("hire add-ons", () => {
  it("normalizes valid add-on rows and caps at max", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      variantId: String(1000 + index),
      title: `Product ${index + 1}`,
    }));

    expect(normalizeHireAddOns(rows)).toHaveLength(MAX_HIRE_ADDONS);
  });

  it("drops rows without a variant id", () => {
    expect(
      normalizeHireAddOns([
        { title: "Tape", variantId: "123" },
        { title: "Broken" },
      ]),
    ).toEqual([
      expect.objectContaining({
        title: "Tape",
        variantId: "123",
      }),
    ]);
  });

  it("falls back add-on heading", () => {
    expect(normalizeAddOnsHeading("")).toBe(DEFAULT_HIRE_ADDONS_HEADING);
    expect(normalizeAddOnsHeading("Styling tape & essentials")).toBe(
      "Styling tape & essentials",
    );
  });
});