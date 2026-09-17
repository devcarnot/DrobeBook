import prisma from "../../db.server";
import {
  extractNumericId,
  shopifyAdminProductUrl,
  toProductGid,
} from "../shopify-ids";
import { deriveConfigStatus, mergeVariantSyncState } from "./rental-product-status";
import {
  fetchShopifyProductById,
} from "./shopify-catalog.server";
import type {
  BulkImportSummary,
  ImportProductResult,
  RentalProductListItem,
  ShopifyCatalogProduct,
} from "./rental-product.types";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type RentalProductListSort =
  | "title_asc"
  | "title_desc"
  | "imported_desc"
  | "updated_desc";

export type RentalProductListFilter =
  | "all"
  | "setup_required"
  | "configured"
  | "rental_enabled"
  | "rental_disabled"
  | "shopify_unavailable";

const DEFAULT_PAGE_SIZE = 12;

function matchesSearch(
  product: {
    title: string;
    vendor: string | null;
    handle: string;
    variants: Array<{ title: string; sku: string | null }>;
  },
  search: string,
): boolean {
  const query = search.toLowerCase();
  if (product.title.toLowerCase().includes(query)) return true;
  if (product.vendor?.toLowerCase().includes(query)) return true;
  if (product.handle.toLowerCase().includes(query)) return true;
  return product.variants.some(
    (variant) =>
      variant.title.toLowerCase().includes(query) ||
      variant.sku?.toLowerCase().includes(query),
  );
}

function formatIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function mapListItem(
  product: {
    id: string;
    shop: string;
    shopifyProductId: string;
    title: string;
    handle: string;
    featuredImageUrl: string | null;
    shopifyStatus: string;
    vendor: string | null;
    productType: string | null;
    rentalEnabled: boolean;
    isConfigured: boolean;
    shopifyAvailable: boolean;
    syncError: string | null;
    removedAt: Date | null;
    lastSyncedAt: Date | null;
    importedAt: Date;
    variants: Array<{ shopifyVariantId: string }>;
  },
): RentalProductListItem {
  const firstVariantId = product.variants[0]?.shopifyVariantId ?? null;
  const configStatus = deriveConfigStatus({
    removedAt: product.removedAt,
    syncError: product.syncError,
    shopifyStatus: product.shopifyStatus,
    shopifyAvailable: product.shopifyAvailable,
    isConfigured: product.isConfigured,
    rentalEnabled: product.rentalEnabled,
  });

  return {
    id: product.id,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    handle: product.handle,
    featuredImageUrl: product.featuredImageUrl,
    shopifyStatus: product.shopifyStatus,
    vendor: product.vendor,
    productType: product.productType,
    variantCount: product.variants.length,
    configStatus,
    lastSyncedAt: formatIso(product.lastSyncedAt ?? product.importedAt),
    importedAt: product.importedAt.toISOString(),
    rentalEnabled: product.rentalEnabled,
    isConfigured: product.isConfigured,
    syncError: product.syncError,
    shopifyAdminUrl: shopifyAdminProductUrl(product.shop, product.shopifyProductId),
    configureUrl: `/app/products/configure?id=${product.id}`,
    rentalsUrl: `/app/bookings?q=${encodeURIComponent(product.title)}`,
    calendarUrl: firstVariantId
      ? `/app/inventory/detail?productId=${product.shopifyProductId}&variantId=${firstVariantId}`
      : `/app/bookings?q=${encodeURIComponent(product.title)}`,
  };
}

export async function listImportedProducts(
  shop: string,
  params: {
    search?: string | null;
    filter?: RentalProductListFilter;
    sort?: RentalProductListSort;
    page?: number;
    pageSize?: number;
  },
): Promise<{
  products: RentalProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const search = params.search?.trim() ?? "";
  const sort = params.sort ?? "title_asc";

  const where: {
    shop: string;
    removedAt: null;
    OR?: Array<Record<string, unknown>>;
    rentalEnabled?: boolean;
    isConfigured?: boolean;
    shopifyAvailable?: boolean;
    syncError?: { not: null } | null;
  } = {
    shop,
    removedAt: null,
  };

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { vendor: { contains: search } },
      { handle: { contains: search } },
      {
        variants: {
          some: {
            OR: [
              { title: { contains: search } },
              { sku: { contains: search } },
            ],
          },
        },
      },
    ];
  }

  const rows = await prisma.rentalProduct.findMany({
    where,
    include: {
      variants: {
        where: { availableInShopify: true },
        select: { shopifyVariantId: true, title: true, sku: true },
        orderBy: { title: "asc" },
      },
    },
    orderBy:
      sort === "title_desc"
        ? { title: "desc" }
        : sort === "imported_desc"
          ? { importedAt: "desc" }
          : sort === "updated_desc"
            ? { updatedAt: "desc" }
            : { title: "asc" },
  });

  const filtered = rows
    .filter((product) => (search ? matchesSearch(product, search) : true))
    .filter((product) => {
    const status = deriveConfigStatus({
      removedAt: product.removedAt,
      syncError: product.syncError,
      shopifyStatus: product.shopifyStatus,
      shopifyAvailable: product.shopifyAvailable,
      isConfigured: product.isConfigured,
      rentalEnabled: product.rentalEnabled,
    });

    switch (params.filter) {
      case "setup_required":
        return status === "setup_required";
      case "configured":
        return status === "configured";
      case "rental_enabled":
        return status === "rental_enabled";
      case "rental_disabled":
        return status === "rental_disabled";
      case "shopify_unavailable":
        return status === "shopify_unavailable" || status === "sync_error";
      default:
        return true;
    }
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const products = filtered.slice(start, start + pageSize).map(mapListItem);

  return { products, total, page, pageSize, totalPages };
}

export async function getImportedProductIdSet(shop: string): Promise<Set<string>> {
  const rows = await prisma.rentalProduct.findMany({
    where: { shop, removedAt: null },
    select: { shopifyProductId: true },
  });
  return new Set(rows.map((row) => row.shopifyProductId));
}

async function upsertImportedProduct(
  shop: string,
  catalogProduct: ShopifyCatalogProduct,
): Promise<{ rentalProductId: string; created: boolean }> {
  const existing = await prisma.rentalProduct.findUnique({
    where: {
      shop_shopifyProductId: {
        shop,
        shopifyProductId: catalogProduct.shopifyProductId,
      },
    },
    include: {
      variants: {
        select: { id: true, shopifyVariantId: true },
      },
    },
  });

  const shopifyVariantIds = new Set(
    catalogProduct.variants.map((variant) => variant.shopifyVariantId),
  );
  const { toMarkUnavailable, existingByShopifyId } = mergeVariantSyncState(
    existing?.variants ?? [],
    shopifyVariantIds,
  );

  const rentalProduct = existing
    ? await prisma.rentalProduct.update({
        where: { id: existing.id },
        data: {
          title: catalogProduct.title,
          handle: catalogProduct.handle,
          featuredImageUrl: catalogProduct.featuredImageUrl,
          shopifyStatus: catalogProduct.shopifyStatus,
          vendor: catalogProduct.vendor,
          productType: catalogProduct.productType,
          shopifyAvailable: true,
          syncError: null,
          removedAt: null,
          lastSyncedAt: new Date(),
        },
      })
    : await prisma.rentalProduct.create({
        data: {
          shop,
          shopifyProductId: catalogProduct.shopifyProductId,
          title: catalogProduct.title,
          handle: catalogProduct.handle,
          featuredImageUrl: catalogProduct.featuredImageUrl,
          shopifyStatus: catalogProduct.shopifyStatus,
          vendor: catalogProduct.vendor,
          productType: catalogProduct.productType,
          rentalEnabled: false,
          isConfigured: false,
          shopifyAvailable: true,
          lastSyncedAt: new Date(),
        },
      });

  for (const variant of catalogProduct.variants) {
    await prisma.rentalProductVariant.upsert({
      where: {
        shop_shopifyVariantId: {
          shop,
          shopifyVariantId: variant.shopifyVariantId,
        },
      },
      create: {
        rentalProductId: rentalProduct.id,
        shop,
        shopifyVariantId: variant.shopifyVariantId,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        inventoryItemId: variant.inventoryItemId,
        inventoryQuantity: variant.inventoryQuantity,
        availableInShopify: true,
      },
      update: {
        rentalProductId: rentalProduct.id,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        inventoryItemId: variant.inventoryItemId,
        inventoryQuantity: variant.inventoryQuantity,
        availableInShopify: true,
      },
    });
  }

  if (toMarkUnavailable.length) {
    await prisma.rentalProductVariant.updateMany({
      where: { id: { in: toMarkUnavailable } },
      data: { availableInShopify: false },
    });
  }

  for (const [shopifyVariantId] of existingByShopifyId) {
    if (!shopifyVariantIds.has(shopifyVariantId)) {
      continue;
    }
  }

  return { rentalProductId: rentalProduct.id, created: !existing };
}

export async function importShopifyProducts(
  admin: AdminGraphqlClient,
  shop: string,
  shopifyProductIds: string[],
): Promise<BulkImportSummary> {
  const uniqueIds = [...new Set(shopifyProductIds.map((id) => extractNumericId(id)))];
  const results: ImportProductResult[] = [];
  let imported = 0;
  let updated = 0;
  let failed = 0;
  let firstConfigureId: string | null = null;

  for (const shopifyProductId of uniqueIds) {
    try {
      const catalogProduct = await fetchShopifyProductById(admin, shopifyProductId);
      if (!catalogProduct) {
        failed += 1;
        results.push({
          shopifyProductId,
          title: shopifyProductId,
          ok: false,
          created: false,
          error: "Product not found in Shopify or is inaccessible.",
        });
        continue;
      }

      const { rentalProductId, created } = await upsertImportedProduct(
        shop,
        catalogProduct,
      );

      if (created) {
        imported += 1;
      } else {
        updated += 1;
      }

      if (!firstConfigureId) {
        firstConfigureId = rentalProductId;
      }

      results.push({
        shopifyProductId,
        title: catalogProduct.title,
        ok: true,
        created,
        rentalProductId,
      });
    } catch (error) {
      failed += 1;
      results.push({
        shopifyProductId,
        title: shopifyProductId,
        ok: false,
        created: false,
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  return { imported, updated, failed, results, firstConfigureId };
}

export async function refreshImportedProduct(
  admin: AdminGraphqlClient,
  shop: string,
  rentalProductId: string,
): Promise<{ ok: boolean; message: string }> {
  const product = await prisma.rentalProduct.findFirst({
    where: { id: rentalProductId, shop, removedAt: null },
  });

  if (!product) {
    return { ok: false, message: "Product not found for this store." };
  }

  try {
    const catalogProduct = await fetchShopifyProductById(
      admin,
      product.shopifyProductId,
    );

    if (!catalogProduct) {
      await prisma.rentalProduct.update({
        where: { id: product.id },
        data: {
          shopifyAvailable: false,
          syncError: "Product is no longer accessible in Shopify.",
          lastSyncedAt: new Date(),
        },
      });
      return {
        ok: false,
        message: "Product is no longer accessible in Shopify.",
      };
    }

    await upsertImportedProduct(shop, catalogProduct);
    return { ok: true, message: "Product refreshed from Shopify." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    await prisma.rentalProduct.update({
      where: { id: product.id },
      data: { syncError: message, lastSyncedAt: new Date() },
    });
    return { ok: false, message };
  }
}

export async function refreshAllImportedProducts(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<{ refreshed: number; failed: number }> {
  const products = await prisma.rentalProduct.findMany({
    where: { shop, removedAt: null },
    select: { id: true },
    orderBy: { title: "asc" },
  });

  let refreshed = 0;
  let failed = 0;

  for (const product of products) {
    const result = await refreshImportedProduct(admin, shop, product.id);
    if (result.ok) {
      refreshed += 1;
    } else {
      failed += 1;
    }
  }

  return { refreshed, failed };
}

export async function removeImportedProduct(
  shop: string,
  rentalProductId: string,
): Promise<{ ok: boolean; message: string }> {
  const product = await prisma.rentalProduct.findFirst({
    where: { id: rentalProductId, shop, removedAt: null },
    select: { id: true, shopifyProductId: true, title: true },
  });

  if (!product) {
    return { ok: false, message: "Product not found for this store." };
  }

  const activeBookings = await prisma.booking.count({
    where: {
      shop,
      productId: product.shopifyProductId,
      status: { in: ["pending", "confirmed"] },
      endDate: { gte: new Date() },
    },
  });

  if (activeBookings > 0) {
    await prisma.rentalProduct.update({
      where: { id: product.id },
      data: {
        rentalEnabled: false,
        removedAt: new Date(),
      },
    });
    return {
      ok: true,
      message:
        "Product archived in the rental app because it has current or upcoming rentals. Shopify product was not deleted.",
    };
  }

  await prisma.rentalProduct.update({
    where: { id: product.id },
    data: {
      rentalEnabled: false,
      removedAt: new Date(),
    },
  });

  return {
    ok: true,
    message: `"${product.title}" was removed from the rental app. Your Shopify product was not changed.`,
  };
}

export async function getRentalProductForConfigure(
  shop: string,
  rentalProductId: string,
) {
  return prisma.rentalProduct.findFirst({
    where: { id: rentalProductId, shop, removedAt: null },
    include: {
      variants: {
        orderBy: { title: "asc" },
      },
    },
  });
}

export async function saveRentalProductConfiguration(
  shop: string,
  rentalProductId: string,
  input: { rentalEnabled: boolean; markConfigured: boolean },
): Promise<{ ok: boolean; message: string }> {
  const product = await prisma.rentalProduct.findFirst({
    where: { id: rentalProductId, shop, removedAt: null },
  });

  if (!product) {
    return { ok: false, message: "Product not found for this store." };
  }

  await prisma.rentalProduct.update({
    where: { id: product.id },
    data: {
      rentalEnabled: input.rentalEnabled,
      isConfigured: input.markConfigured ? true : product.isConfigured,
    },
  });

  return { ok: true, message: "Rental configuration saved." };
}

export async function assertRentalProductOwnership(
  shop: string,
  rentalProductId: string,
): Promise<boolean> {
  const count = await prisma.rentalProduct.count({
    where: { id: rentalProductId, shop },
  });
  return count > 0;
}

export async function getProductRentalWidgetStatus(
  shop: string,
  shopifyProductId: string,
): Promise<{ imported: boolean; rentalEnabled: boolean }> {
  const normalizedId = extractNumericId(shopifyProductId);

  const product = await prisma.rentalProduct.findFirst({
    where: {
      shop,
      shopifyProductId: normalizedId,
      removedAt: null,
    },
    select: {
      rentalEnabled: true,
    },
  });

  return {
    imported: Boolean(product),
    rentalEnabled: product?.rentalEnabled ?? false,
  };
}

export { toProductGid };
