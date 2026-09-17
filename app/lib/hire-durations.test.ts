import { describe, expect, it } from "vitest";

import {
  DEFAULT_HIRE_DURATIONS,
  normalizeHireDurations,
  parseAllowedHireDuration,
} from "./hire-durations";

describe("hire-durations", () => {
  it("normalizes and deduplicates duration options", () => {
    expect(
      normalizeHireDurations([
        { days: 4, label: "4 Days" },
        { days: 4, label: "Duplicate" },
        { days: 10, label: "10 Days" },
      ]),
    ).toEqual([
      { days: 4, label: "4 Days" },
      { days: 10, label: "10 Days" },
    ]);
  });

  it("falls back to defaults when input is empty", () => {
    expect(normalizeHireDurations([])).toEqual(DEFAULT_HIRE_DURATIONS);
  });

  it("parses allowed duration days", () => {
    expect(parseAllowedHireDuration("8", [4, 8])).toBe(8);
    expect(parseAllowedHireDuration("6", [4, 8])).toBeNull();
  });
});
