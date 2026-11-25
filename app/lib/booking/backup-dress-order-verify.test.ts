import { describe, expect, it } from "vitest";

import {
  BACKUP_HIRE_TIER,
  MAIN_HIRE_TIER,
  roundBackupPriceCents,
} from "./backup-dress-pricing";
import { verifyBackupDressOrderLines } from "./backup-dress-order-verify.server";

function props(overrides: Record<string, string> = {}) {
  return {
    _Size: "6",
    _Duration: "4 Day Hire",
    "Delivery Date": "1 December 2026",
    "Return Date": "4 December 2026",
    ...overrides,
  };
}

describe("verifyBackupDressOrderLines", () => {
  const mainById = new Map([
    [
      "100",
      {
        shopifyVariantId: "100",
        backupShopifyVariantId: "200",
        price: "110.00",
      },
    ],
    [
      "101",
      {
        shopifyVariantId: "101",
        backupShopifyVariantId: "201",
        price: "90.00",
      },
    ],
  ]);
  const backupToMain = new Map([
    ["200", { shopifyVariantId: "100", price: "110.00" }],
    ["201", { shopifyVariantId: "101", price: "90.00" }],
  ]);

  it("flags backup variant on a lone gown", () => {
    const violations = verifyBackupDressOrderLines({
      discountEnabled: true,
      mainById,
      backupToMain,
      lines: [
        {
          variantId: "200",
          quantity: 1,
          priceCents: roundBackupPriceCents(11_000),
          properties: props(),
        },
      ],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].actualTier).toBe(BACKUP_HIRE_TIER);
    expect(violations[0].expectedTier).toBe(MAIN_HIRE_TIER);
  });

  it("accepts valid two-gown split", () => {
    const violations = verifyBackupDressOrderLines({
      discountEnabled: true,
      mainById,
      backupToMain,
      lines: [
        {
          variantId: "100",
          quantity: 1,
          priceCents: 11_000,
          properties: props(),
        },
        {
          variantId: "201",
          quantity: 1,
          priceCents: roundBackupPriceCents(9_000),
          properties: props(),
        },
      ],
    });

    expect(violations).toHaveLength(0);
  });

  it("flags full-price main when server expects backup tier", () => {
    const violations = verifyBackupDressOrderLines({
      discountEnabled: true,
      mainById,
      backupToMain,
      lines: [
        {
          variantId: "100",
          quantity: 1,
          priceCents: 11_000,
          properties: props(),
        },
        {
          variantId: "101",
          quantity: 1,
          priceCents: 9_000,
          properties: props(),
        },
      ],
    });

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(
      violations.some(
        (row) => row.expectedTier === BACKUP_HIRE_TIER && row.actualTier === MAIN_HIRE_TIER,
      ),
    ).toBe(true);
  });
});