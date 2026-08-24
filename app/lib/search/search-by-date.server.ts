import {
  addDays,
  computeReturnDate,
  formatDateIso,
  type HireDurationDays,
  meetsLeadTime,
  toDateOnly,
} from "../booking/availability";
import { checkProductAvailability, parseIsoDate } from "../booking/availability.server";
import type { SearchConfig } from "../shop-config";

export type SearchByDateParams = {
  shop: string;
  eventDate: string;
  size: string;
  durationDays: HireDurationDays;
  collectionHandle: string;
  today?: Date;
};

export type SearchProductResult = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  imageUrl: string | null;
  priceFrom: string;
  availableVariantId: string;
  availableSize: string;
};

export type SearchByDateResult = {
  eventDate: string;
  deliveryDate: string;
  returnDate: string;
  durationDays: number;
  size: string;
  products: SearchProductResult[];
  total: number;
};

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  featuredImage: { url: string } | null;
  options: Array<{ name: string; values: string[] }>;
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      availableForSale: boolean;
      price: string;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
  };
};

function deliveryDateFromEventDate(eventDate: Date): Date {
  return addDays(toDateOnly(eventDate), -1);
}

function normalizeSize(value: string): string {
  return value.trim().toLowerCase();
}

function variantMatchesSize(
  variant: ShopifyProductNode["variants"]["nodes"][number],
  size: string,
): boolean {
  const target = normalizeSize(size);
  return variant.selectedOptions.some((option) => {
    if (!/size/i.test(option.name)) {
      return false;
    }
    return normalizeSize(option.value) === target;
  });
}

function formatMoney(amount: string): string {
  const value = Number.parseFloat(amount);
  if (Number.isNaN(value)) {
    return amount;
  }
  return `$${value.toFixed(2)}`;
}

function extractNumericId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

export async function searchProductsByDate(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  params: SearchByDateParams,
): Promise<SearchByDateResult> {
  const eventDate = parseIsoDate(params.eventDate);
  if (!eventDate) {
    throw new Error("Invalid event date");
  }

  const deliveryDate = deliveryDateFromEventDate(eventDate);
  const returnDate = computeReturnDate(deliveryDate, params.durationDays);
  const today = params.today ?? new Date();

  if (!meetsLeadTime(deliveryDate, today)) {
    return {
      eventDate: formatDateIso(eventDate),
      deliveryDate: formatDateIso(deliveryDate),
      returnDate: formatDateIso(returnDate),
      durationDays: params.durationDays,
      size: params.size,
      products: [],
      total: 0,
    };
  }

  const query =
    params.collectionHandle && params.collectionHandle !== "all"
      ? `#graphql
    query SearchCollectionProducts($handle: String!) {
      collection(handle: $handle) {
        products(first: 100) {
          nodes {
            id
            title
            handle
            vendor
            featuredImage {
              url
            }
            options {
              name
              values
            }
            variants(first: 50) {
              nodes {
                id
                title
                availableForSale
                price
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  `
      : `#graphql
    query SearchAllProducts {
      products(first: 100) {
        nodes {
          id
          title
          handle
          vendor
          featuredImage {
            url
          }
          options {
            name
            values
          }
          variants(first: 50) {
            nodes {
              id
              title
              availableForSale
              price
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  `;

  const response =
    params.collectionHandle && params.collectionHandle !== "all"
      ? await admin.graphql(query, {
          variables: { handle: params.collectionHandle },
        })
      : await admin.graphql(query);
  const payload = await response.json();
  const products =
    payload.data?.collection?.products?.nodes ??
    payload.data?.products?.nodes ??
    ([] as ShopifyProductNode[]);

  const results: SearchProductResult[] = [];

  for (const product of products) {
    const matchingVariants = product.variants.nodes.filter(
      (variant) =>
        variant.availableForSale && variantMatchesSize(variant, params.size),
    );

    for (const variant of matchingVariants) {
      const availability = await checkProductAvailability({
        shop: params.shop,
        productId: extractNumericId(product.id),
        variantId: extractNumericId(variant.id),
        deliveryDate,
        durationDays: params.durationDays,
        today,
      });

      if (!availability.available) {
        continue;
      }

      results.push({
        id: extractNumericId(product.id),
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        imageUrl: product.featuredImage?.url ?? null,
        priceFrom: formatMoney(variant.price),
        availableVariantId: extractNumericId(variant.id),
        availableSize: params.size,
      });
      break;
    }
  }

  return {
    eventDate: formatDateIso(eventDate),
    deliveryDate: formatDateIso(deliveryDate),
    returnDate: formatDateIso(returnDate),
    durationDays: params.durationDays,
    size: params.size,
    products: results,
    total: results.length,
  };
}

export function searchConfigWithOverrides(
  config: SearchConfig,
  collectionHandle?: string | null,
): SearchConfig {
  return {
    ...config,
    collectionHandle: collectionHandle?.trim() || config.collectionHandle,
  };
}
