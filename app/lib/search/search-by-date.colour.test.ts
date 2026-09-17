import { describe, expect, it } from "vitest";

import { extractProductColour } from "./search-by-date.server";

describe("extractProductColour", () => {
  it("reads Color from the matched variant", () => {
    const colour = extractProductColour(
      {
        options: [{ name: "Color", values: ["Black", "Espresso"] }],
      },
      {
        selectedOptions: [
          { name: "Size", value: "6" },
          { name: "Color", value: "Espresso" },
        ],
      },
    );
    expect(colour).toBe("Espresso");
  });

  it("supports Colour spelling", () => {
    const colour = extractProductColour(
      {
        options: [{ name: "Colour", values: ["Into Blue"] }],
      },
      {
        selectedOptions: [
          { name: "Size", value: "8" },
          { name: "Colour", value: "Into Blue" },
        ],
      },
    );
    expect(colour).toBe("Into Blue");
  });

  it("returns null when no colour option exists", () => {
    const colour = extractProductColour(
      {
        options: [{ name: "Size", values: ["6", "8"] }],
      },
      {
        selectedOptions: [{ name: "Size", value: "6" }],
      },
    );
    expect(colour).toBeNull();
  });
});
