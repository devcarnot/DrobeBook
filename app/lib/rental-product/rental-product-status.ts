import type { RentalProductConfigStatus } from "./rental-product.types";

type StatusInput = {
  removedAt: Date | null;
  syncError: string | null;
  shopifyStatus: string;
  shopifyAvailable: boolean;
  isConfigured: boolean;
  rentalEnabled: boolean;
};

export function deriveConfigStatus(input: StatusInput): RentalProductConfigStatus {
  if (input.removedAt) {
    return "rental_disabled";
  }
  if (input.syncError) {
    return "sync_error";
  }
  if (
    !input.shopifyAvailable ||
    input.shopifyStatus === "ARCHIVED" ||
    input.shopifyStatus === "DRAFT"
  ) {
    return "shopify_unavailable";
  }
  if (!input.isConfigured) {
    return "setup_required";
  }
  if (input.rentalEnabled) {
    return "rental_enabled";
  }
  return input.isConfigured ? "configured" : "rental_disabled";
}

export function parseShopifyProductIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const ids = raw
    .map((value) => String(value ?? "").trim())
    .filter((value) => /^\d+$/.test(value));

  return [...new Set(ids)];
}

export function buildCatalogSearchQuery(filters: {
  search?: string | null;
  status?: string | null;
  vendor?: string | null;
  productType?: string | null;
}): string | undefined {
  const parts: string[] = [];

  if (filters.search?.trim()) {
    parts.push(`title:*${filters.search.trim()}*`);
  }
  if (filters.status?.trim()) {
    parts.push(`status:${filters.status.trim().toUpperCase()}`);
  }
  if (filters.vendor?.trim()) {
    parts.push(`vendor:'${filters.vendor.trim().replace(/'/g, "\\'")}'`);
  }
  if (filters.productType?.trim()) {
    parts.push(`product_type:'${filters.productType.trim().replace(/'/g, "\\'")}'`);
  }

  return parts.length ? parts.join(" AND ") : undefined;
}

export function mergeVariantSyncState(
  existingVariants: Array<{ shopifyVariantId: string; id: string }>,
  shopifyVariantIds: Set<string>,
): {
  toMarkUnavailable: string[];
  existingByShopifyId: Map<string, string>;
} {
  const existingByShopifyId = new Map(
    existingVariants.map((variant) => [variant.shopifyVariantId, variant.id]),
  );
  const toMarkUnavailable = existingVariants
    .filter((variant) => !shopifyVariantIds.has(variant.shopifyVariantId))
    .map((variant) => variant.id);

  return { toMarkUnavailable, existingByShopifyId };
}
