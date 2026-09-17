import { describe, expect, it } from "vitest";

import {
  DEFAULT_HIRE_TERMS,
  normalizeHireTerms,
} from "./hire-terms";

describe("normalizeHireTerms", () => {
  it("returns defaults when input is empty", () => {
    expect(normalizeHireTerms([])).toEqual(DEFAULT_HIRE_TERMS);
  });

  it("keeps valid custom terms", () => {
    expect(
      normalizeHireTerms([
        { id: "terms", label: "I agree to hire terms" },
        { id: "care", label: "I will care for the garment" },
      ]),
    ).toEqual([
      { id: "terms", label: "I agree to hire terms" },
      { id: "care", label: "I will care for the garment" },
    ]);
  });

  it("filters blank labels and generates ids", () => {
    expect(
      normalizeHireTerms([{ label: "  Accept terms  " }, { label: "   " }]),
    ).toEqual([{ id: "accept-terms", label: "Accept terms" }]);
  });
});
