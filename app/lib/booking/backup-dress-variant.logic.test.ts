import { describe, expect, it } from "vitest";

import {
  buildBackupOptionValuePlans,
  buildCompleteBackupOptionValues,
  HIRE_PRICING_BACKUP,
  isBackupCatalogVariantTitle,
  isCustomerFacingHireVariant,
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

const judeWithHireBackupValues = normalizeProductOptions([
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
    optionValues: [{ name: "Standard" }, { name: "Backup (80% off)" }],
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

  it("uses existing Hire pricing Backup option when present on product", () => {
    const selected = [
      { name: "Size", value: "M" },
      { name: "Duration", value: "4 Days" },
      { name: "Hire pricing", value: "Standard" },
    ];
    const plans = buildBackupOptionValuePlans(selected, judeWithHireBackupValues);
    expect(plans[0]).toEqual([
      { optionName: "Size", name: "M" },
      { optionName: "Duration", name: "4 Days" },
      { optionName: "Hire pricing", name: "Backup (80% off)" },
    ]);
  });

  it("falls back to Duration suffix when Hire pricing has only Standard", () => {
    const selected = [
      { name: "Size", value: "M" },
      { name: "Duration", value: "4 Days" },
      { name: "Hire pricing", value: "Standard" },
    ];
    const plans = buildBackupOptionValuePlans(selected, judeProduct);
    expect(plans.some((plan) => plan.some((row) => row.name === "4 Days · Backup"))).toBe(
      true,
    );
  });

  it("detects backup catalog variants from Shopify variant titles", () => {
    expect(isBackupCatalogVariantTitle("6 / 4 Days / Standard")).toBe(false);
    expect(isBackupCatalogVariantTitle("M / 4 Days / Backup (80% off)")).toBe(true);
    expect(isBackupCatalogVariantTitle("6 / 4 Days · Backup / Standard")).toBe(true);
  });

  it("flags backup catalog variants for search and checkout", () => {
    expect(
      isCustomerFacingHireVariant([
        { name: "Size", value: "6" },
        { name: "Hire pricing", value: "Standard" },
      ]),
    ).toBe(true);
    expect(
      isCustomerFacingHireVariant([
        { name: "Size", value: "6" },
        { name: "Hire pricing", value: "Backup (80% off)" },
      ]),
    ).toBe(false);
    expect(
      isCustomerFacingHireVariant([
        { name: "Size", value: "6 · Backup" },
        { name: "Hire pricing", value: "Standard" },
      ]),
    ).toBe(false);
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