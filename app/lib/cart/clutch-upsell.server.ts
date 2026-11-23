import {
  formatDateIso,
  type HireDurationDays,
} from "../booking/availability";
import { computeReturnDate } from "../booking/availability";
import {
  evaluateProductAvailability,
  loadShopAvailabilityDataForWindow,
} from "../booking/availability.server";
import type { ClutchUpsellConfig } from "./clutch-upsell-config";

export type ClutchUpsellProduct = {
  productId: string;
  variantId: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  size: string;
  price: string;
  compareAtPrice: string | null;
  displayPrice: string;
  originalDisplayPrice: string;
};

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string } | null;
  options: Array<{ name: string; values: string[] }>;
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      availableForSale: boolean;
      price: string;
      compareAtPrice: string | null;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
  };
};

function extractNumericId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

function extractVariantSize(
  variant: ShopifyProductNode["variants"]["nodes"][number],
): string {
  const option = variant.selectedOptions.find((entry) => /size/i.test(entry.name));
  const value = option?.value?.trim();
  if (value) {
    return value;
  }
  if (variant.title && variant.title !== "Default Title") {
    return variant.title;
  }
  return "One Size";
}

function formatMoney(amount: number | string): string {
  const value = Number.parseFloat(String(amount));
  if (Number.isNaN(value)) {
    return String(amount);
  }
  return `$${value.toFixed(2)}`;
}

function priceWithDiscount(
  price: string,
  compareAtPrice: string | null,
  discountPercent: number,
): { displayPrice: string; originalDisplayPrice: string } {
  const base = Number.parseFloat(price);
  if (Number.isNaN(base)) {
    return {
      displayPrice: formatMoney(price),
      originalDisplayPrice: formatMoney(price),
    };
  }

  const compareAt = compareAtPrice ? Number.parseFloat(compareAtPrice) : null;
  if (compareAt != null && !Number.isNaN(compareAt) && compareAt > base) {
    return {
      displayPrice: formatMoney(base),
      originalDisplayPrice: formatMoney(compareAt),
    };
  }

  if (discountPercent > 0) {
    const discounted = base * (1 - discountPercent / 100);
    return {
      displayPrice: formatMoney(discounted),
      originalDisplayPrice: formatMoney(base),
    };
  }

  return {
    displayPrice: formatMoney(base),
    originalDisplayPrice: formatMoney(base),
  };
}

export type SearchClutchesParams = {
  shop: string;
  deliveryDate: Date;
  durationDays: HireDurationDays;
  deliveryMethod: "post" | "pickup";
  collectionId?: string;
  collectionHandle?: string;
  excludeProductIds?: string[];
  config: ClutchUpsellConfig;
  today?: Date;
};

async function loadCollectionProducts(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  collectionId: string | undefined,
  collectionHandle: string | undefined,
): Promise<ShopifyProductNode[]> {
  const productSelection = `
    products(first: 48) {
      nodes {
        id
        title
        handle
        featuredImage {
          url
        }
        options {
          name
          values
        }
            variants(first: 20) {
          nodes {
            id
            title
            availableForSale
            price
            compareAtPrice
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  `;

  if (collectionId) {
    const response = await admin.graphql(
      `#graphql
      query ClutchUpsellCollectionById($id: ID!) {
        collection(id: $id) {
          ${productSelection}
        }
      }
    `,
      { variables: { id: `gid://shopify/Collection/${collectionId}` } },
    );
    const payload = await response.json();
    return (payload.data?.collection?.products?.nodes ?? []) as ShopifyProductNode[];
  }

  if (collectionHandle && collectionHandle !== "all") {
    const response = await admin.graphql(
      `#graphql
      query ClutchUpsellCollectionByHandle($handle: String!) {
        collection(handle: $handle) {
          ${productSelection}
        }
      }
    `,
      { variables: { handle: collectionHandle } },
    );
    const payload = await response.json();
    return (payload.data?.collection?.products?.nodes ?? []) as ShopifyProductNode[];
  }

  return [];
}

export async function searchAvailableClutches(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  params: SearchClutchesParams,
): Promise<ClutchUpsellProduct[]> {
  const products = await loadCollectionProducts(
    admin,
    params.collectionId || params.config.collectionId,
    params.collectionHandle || params.config.collectionHandle,
  );

  if (!products.length) {
    return [];
  }

  const exclude = new Set((params.excludeProductIds ?? []).map(String));
  const returnDate = computeReturnDate(params.deliveryDate, params.durationDays);
  const availabilityData = await loadShopAvailabilityDataForWindow(
    params.shop,
    params.deliveryDate,
    returnDate,
  );
  const today = params.today ?? new Date();
  const results: ClutchUpsellProduct[] = [];

  for (const product of products) {
    const productId = extractNumericId(product.id);
    if (exclude.has(productId)) {
      continue;
    }

    let best: ClutchUpsellProduct | null = null;

    for (const variant of product.variants.nodes) {
      if (!variant.availableForSale) {
        continue;
      }

      const variantId = extractNumericId(variant.id);
      const availability = evaluateProductAvailability(
        {
          shop: params.shop,
          productId,
          variantId,
          deliveryDate: params.deliveryDate,
          durationDays: params.durationDays,
          deliveryMethod: params.deliveryMethod,
          today,
        },
        {
          bufferConfig: availabilityData.bufferConfig,
          holidays: availabilityData.holidays,
          bookings:
            availabilityData.bookingsByVariant.get(`${productId}:${variantId}`) ??
            [],
          blockedDates: availabilityData.blockedDates,
        },
      );

      if (!availability.available) {
        continue;
      }

      const priced = priceWithDiscount(
        variant.price,
        variant.compareAtPrice,
        params.config.discountPercent,
      );

      const candidate: ClutchUpsellProduct = {
        productId,
        variantId,
        title: product.title,
        handle: product.handle,
        imageUrl: product.featuredImage?.url ?? null,
        size: extractVariantSize(variant),
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        displayPrice: priced.displayPrice,
        originalDisplayPrice: priced.originalDisplayPrice,
      };

      const candidateAmount = Number.parseFloat(variant.price);
      const bestAmount = best ? Number.parseFloat(best.price) : Number.POSITIVE_INFINITY;
      if (!best || candidateAmount < bestAmount) {
        best = candidate;
      }
    }

    if (best) {
      results.push(best);
    }
  }

  results.sort((a, b) => a.title.localeCompare(b.title));

  return results;
}

export function clutchUpsellContextSummary(input: {
  deliveryDate: Date;
  durationDays: HireDurationDays;
}) {
  return {
    deliveryDate: formatDateIso(input.deliveryDate),
  };
}