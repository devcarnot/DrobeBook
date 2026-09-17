import { describe, expect, it } from "vitest";

import {
  buildCatalogSearchQuery,
  deriveConfigStatus,
  mergeVariantSyncState,
  parseShopifyProductIds,
} from "./rental-product-status";

describe("rental-product-status", () => {
  it("derives setup required for newly imported products", () => {
    expect(
      deriveConfigStatus({
        removedAt: null,
        syncError: null,
        shopifyStatus: "ACTIVE",
        shopifyAvailable: true,
        isConfigured: false,
        rentalEnabled: false,
      }),
    ).toBe("setup_required");
  });

  it("derives rental enabled when configured and enabled", () => {
    expect(
      deriveConfigStatus({
        removedAt: null,
        syncError: null,
        shopifyStatus: "ACTIVE",
        shopifyAvailable: true,
        isConfigured: true,
        rentalEnabled: true,
      }),
    ).toBe("rental_enabled");
  });

  it("derives shopify unavailable for archived products", () => {
    expect(
      deriveConfigStatus({
        removedAt: null,
        syncError: null,
        shopifyStatus: "ARCHIVED",
        shopifyAvailable: true,
        isConfigured: true,
        rentalEnabled: true,
      }),
    ).toBe("shopify_unavailable");
  });

  it("parses and deduplicates Shopify product IDs", () => {
    expect(parseShopifyProductIds(["123", "123", "456", "", "abc"])).toEqual([
      "123",
      "456",
    ]);
  });

  it("builds Shopify catalog search query parts", () => {
    expect(
      buildCatalogSearchQuery({
        search: "gown",
        status: "active",
        vendor: "Niraa",
        productType: "Dress",
      }),
    ).toBe("title:*gown* AND status:ACTIVE AND vendor:'Niraa' AND product_type:'Dress'");
  });

  it("marks removed Shopify variants as unavailable", () => {
    const result = mergeVariantSyncState(
      [
        { id: "local-1", shopifyVariantId: "1" },
        { id: "local-2", shopifyVariantId: "2" },
      ],
      new Set(["1"]),
    );

    expect(result.toMarkUnavailable).toEqual(["local-2"]);
    expect(result.existingByShopifyId.get("1")).toBe("local-1");
  });
});

describe("shopify-ids", () => {
  it("builds Shopify admin product URLs", async () => {
    const { shopifyAdminProductUrl } = await import("../shopify-ids");
    expect(
      shopifyAdminProductUrl(
        "demo.myshopify.com",
        "gid://shopify/Product/123456789",
      ),
    ).toBe("https://admin.shopify.com/store/demo/products/123456789");
  });
});
