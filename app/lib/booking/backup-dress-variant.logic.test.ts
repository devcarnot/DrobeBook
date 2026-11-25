import { describe, expect, it } from "vitest";

import {
  buildBackupOptionValuePlans,
  buildCompleteBackupOptionValues,
  HIRE_PRICING_BACKUP,
  listAlterationCandidates,
  normalizeProductOptions,
  shouldUseHirePricingBackupPath,
} from "./backup-dress-variant.logic";

const sizeHireProduct = normalizeProductOptions([
  { id: "1", name: "Size", position: 1, optionValues: [{ name: "6" }, { name: "10" }] },
  {
    id: "2",
    name: "Hire pricing",
    position: 2,
    optionValues: [{ name: "Standard" }],
  },
]);

const judeProduct = normalizeProductOptions([
  { id: "1", name: "Size", position: 1, optionValues: [{ name: "M" }] },
  {
    id: "2",
    name: "Duration",
    position: 2,
    optionValues: [{ name: "4 Days" }, { name: "8 Days" }],
  },
  {
    id: "3",
    name: "Hire pricing",
    position: 3,
    optionValues: [{ name: "Standard" }],
  },
]);

describe("backup-dress-variant.logic", () => {
  it("does not use hire pricing path when Hire pricing option already exists", () => {
    expect(shouldUseHirePricingBackupPath(sizeHireProduct)).toBe(false);
    expect(shouldUseHirePricingBackupPath(judeProduct)).toBe(false);
  });

  it("builds complete option rows for Size + Hire pricing using Size suffix", () => {
    const selected = [
      { name: "Size", value: "6" },
      { name: "Hire pricing", value: "Standard" },
    ];
    const [sizeCandidate] = listAlterationCandidates(selected, sizeHireProduct);
    expect(sizeCandidate?.mainValue).toBe("6");

    const rows = buildCompleteBackupOptionValues(
      selected,
      sizeHireProduct,
      sizeCandidate,
    );
    expect(rows).toEqual([
      { optionName: "Size", name: "6 · Backup" },
      { optionName: "Hire pricing", name: "Standard" },
    ]);
  });

  it("prefers Duration suffix when three options include Hire pricing", () => {
    const selected = [
      { name: "Size", value: "M" },
      { name: "Duration", value: "4 Days" },
      { name: "Hire pricing", value: "Standard" },
    ];
    const plans = buildBackupOptionValuePlans(selected, judeProduct);
    expect(plans[0]).toEqual([
      { optionName: "Size", name: "M" },
      { optionName: "Duration", name: "4 Days · Backup" },
      { optionName: "Hire pricing", name: "Standard" },
    ]);
  });

  it("uses hire pricing backup only on simple one-option products", () => {
    const simple = normalizeProductOptions([
      { id: "1", name: "Size", position: 1, optionValues: [{ name: "6" }] },
    ]);
    expect(shouldUseHirePricingBackupPath(simple)).toBe(true);
    const plans = buildBackupOptionValuePlans([{ name: "Size", value: "6" }], simple);
    expect(plans[0]).toEqual([
      { optionName: "Size", name: "6" },
      { optionName: "Hire pricing", name: HIRE_PRICING_BACKUP },
    ]);
  });
});