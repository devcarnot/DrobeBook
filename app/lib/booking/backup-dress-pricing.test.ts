import { describe, expect, it } from "vitest";

import {
  allocateHireTierCounts,
  BACKUP_HIRE_TIER,
  computeBackupDressAssignments,
  computeBackupDressSummary,
  isGownHireLine,
  MAIN_HIRE_TIER,
} from "./backup-dress-pricing";

function gownLine(
  key: string,
  priceCents: number,
  overrides: Record<string, string> = {},
  meta: { variantId?: string; createdAt?: number } = {},
) {
  return {
    key,
    priceCents,
    variantId: meta.variantId,
    createdAt: meta.createdAt,
    properties: {
      _Size: "6",
      _Duration: "4 Day Hire",
      "Delivery Date": "1 December 2026",
      "Return Date": "4 December 2026",
      "Delivery Method": "Post",
      ...overrides,
    },
  };
}

describe("allocateHireTierCounts", () => {
  it.each([
    [1, { fullPriceCount: 1, backupCount: 0 }],
    [2, { fullPriceCount: 1, backupCount: 1 }],
    [3, { fullPriceCount: 2, backupCount: 1 }],
    [4, { fullPriceCount: 2, backupCount: 2 }],
    [5, { fullPriceCount: 3, backupCount: 2 }],
    [6, { fullPriceCount: 3, backupCount: 3 }],
  ])("allocates %i dresses", (total, expected) => {
    expect(allocateHireTierCounts(total)).toEqual(expected);
  });
});

describe("computeBackupDressAssignments", () => {
  it("charges most expensive at full price and cheapest as backup", () => {
    const assignments = computeBackupDressAssignments([
      gownLine("a", 15_900),
      gownLine("b", 13_900),
    ]);

    expect(assignments).toHaveLength(2);
    const main = assignments.find((row) => row.key === "a");
    const backup = assignments.find((row) => row.key === "b");
    expect(main?.tier).toBe(MAIN_HIRE_TIER);
    expect(backup?.tier).toBe(BACKUP_HIRE_TIER);
    expect(backup?.chargedCents).toBe(2780);
    expect(computeBackupDressSummary(assignments).chargedSubtotalCents).toBe(18_680);
  });

  it("allocates 3 gowns as 2 main + 1 backup", () => {
    const assignments = computeBackupDressAssignments(
      [gownLine("a", 12_000), gownLine("b", 11_000), gownLine("c", 10_000)],
      { expandQuantity: false },
    );

    expect(assignments).toHaveLength(3);
    expect(assignments.filter((row) => row.tier === MAIN_HIRE_TIER)).toHaveLength(2);
    expect(assignments.filter((row) => row.tier === BACKUP_HIRE_TIER)).toHaveLength(1);
  });

  it("expands quantity 2 into two group units", () => {
    const assignments = computeBackupDressAssignments(
      [
        gownLine("only", 10_000, {}, { variantId: "1", createdAt: 1 }),
        {
          key: "pair",
          priceCents: 9_000,
          variantId: "2",
          createdAt: 2,
          quantity: 2,
          properties: gownLine("x", 0).properties,
        },
      ],
      { expandQuantity: true },
    );

    expect(assignments).toHaveLength(3);
    expect(assignments.filter((row) => row.tier === BACKUP_HIRE_TIER)).toHaveLength(1);
  });

  it("groups only matching hire periods", () => {
    const assignments = computeBackupDressAssignments([
      gownLine("a", 10_000),
      gownLine("b", 9_000, { "Return Date": "5 December 2026" }),
    ]);

    expect(assignments).toHaveLength(0);
  });

  it("ties break on creation time then variant id", () => {
    const assignments = computeBackupDressAssignments([
      gownLine("a", 10_000, {}, { variantId: "2", createdAt: 200 }),
      gownLine("b", 10_000, {}, { variantId: "1", createdAt: 100 }),
    ]);

    expect(assignments.find((row) => row.key === "b")?.tier).toBe(MAIN_HIRE_TIER);
    expect(assignments.find((row) => row.key === "a")?.tier).toBe(BACKUP_HIRE_TIER);
  });

  it("ignores clutches and linked add-ons", () => {
    const assignments = computeBackupDressAssignments([
      gownLine("gown-a", 11_000),
      gownLine("gown-b", 9_000),
      {
        key: "clutch",
        priceCents: 4500,
        properties: {
          _Size: "One Size",
          _Duration: "4 Day Hire",
          "Delivery Date": "1 December 2026",
          "Return Date": "4 December 2026",
          _gk_clutch_upsell: "true",
        },
      },
      {
        key: "addon",
        priceCents: 1200,
        properties: {
          "For item": "Gown [6 / 4 Day Hire]",
          _gk_linked_booking_id: "abc",
        },
      },
    ]);

    expect(assignments).toHaveLength(2);
    expect(assignments.map((row) => row.key).sort()).toEqual(["gown-a", "gown-b"]);
  });
});

describe("isGownHireLine", () => {
  it("requires size, duration, and hire dates", () => {
    expect(
      isGownHireLine({
        _Size: "6",
        _Duration: "4 Day Hire",
        "Delivery Date": "1 December 2026",
        "Return Date": "4 December 2026",
      }),
    ).toBe(true);
  });
});