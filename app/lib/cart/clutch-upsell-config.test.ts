import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLUTCH_UPSELL_CONFIG,
  normalizeClutchUpsellConfig,
} from "./clutch-upsell-config";

describe("clutch upsell config", () => {
  it("normalizes percent bounds", () => {
    expect(
      normalizeClutchUpsellConfig({ discountPercent: 120, enabled: true }),
    ).toMatchObject({
      discountPercent: 90,
      enabled: true,
    });
  });

  it("fills defaults", () => {
    expect(normalizeClutchUpsellConfig(null)).toEqual(DEFAULT_CLUTCH_UPSELL_CONFIG);
  });
});