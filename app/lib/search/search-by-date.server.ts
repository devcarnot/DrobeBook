import {
  addDays,
  computeReturnDate,
  formatDateIso,
  type HireDurationDays,
  meetsLeadTime,
  toDateOnly,
} from "../booking/availability";
import {
  evaluateProductAvailability,
  loadShopAvailabilityData,
  parseIsoDate,
} from "../booking/availability.server";
import type { SearchConfig } from "../shop-config";

export type SearchByDateParams = {
  shop: string;
  eventDate: string;
  /** Preferred size from the landing form — used to pre-select the sidebar filter. */
  size?: string | null;
  durationDays: HireDurationDays;
  deliveryMethod?: "post" | "pickup";
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
  /** Primary size (preferred match, else first available). */
  availableSize: string;
  /** All sizes available for this event date. */
  availableSizes: string[];
  colour: string | null;
};

export type SearchByDateResult = {
  eventDate: string;
  deliveryDate: string;
  returnDate: string;
  durationDays: number;
  size: string;
  /** Unique sizes across all matching products (for sidebar). */
  availableSizes: string[];
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

type ShopifyVariantNode = ShopifyProductNode["variants"]["nodes"][number];

function deliveryDateFromEventDate(eventDate: Date): Date {
  return addDays(toDateOnly(eventDate), -1);
}

function normalizeSize(value: string): string {
  return value.trim().toLowerCase();
}

function extractVariantSize(
  variant: ShopifyProductNode["variants"]["nodes"][number],
): string | null {
  const option = variant.selectedOptions.find((entry) => /size/i.test(entry.name));
  const value = option?.value?.trim();
  return value || null;
}

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function isColourOptionName(name: string): boolean {
  return /^colou?rs?$/i.test(name.trim());
}

/** Prefer the matched variant's Color/Colour option; fall back to product option values. */
export function extractProductColour(
  product: Pick<ShopifyProductNode, "options">,
  variant: Pick<ShopifyVariantNode, "selectedOptions">,
): string | null {
  const fromVariant = variant.selectedOptions.find((option) =>
    isColourOptionName(option.name),
  );
  if (fromVariant?.value?.trim()) {
    return fromVariant.value.trim();
  }

  const colourOption = product.options.find((option) =>
    isColourOptionName(option.name),
  );
  const values = (colourOption?.values ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 1) {
    return values[0];
  }

  return null;
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
      size: params.size?.trim() || "",
      availableSizes: [],
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

  const availabilityData = await loadShopAvailabilityData(params.shop);
  const results: SearchProductResult[] = [];
  const preferredSize = params.size?.trim() || "";

  for (const product of products) {
    const productId = extractNumericId(product.id);
    const availableBySize = new Map<
      string,
      { variant: ShopifyVariantNode; variantId: string }
    >();

    for (const variant of product.variants.nodes) {
      if (!variant.availableForSale) {
        continue;
      }

      const sizeValue = extractVariantSize(variant);
      if (!sizeValue) {
        continue;
      }

      const variantId = extractNumericId(variant.id);
      const availability = evaluateProductAvailability(
        {
          shop: params.shop,
          productId,
          variantId,
          deliveryDate,
          durationDays: params.durationDays,
          deliveryMethod: params.deliveryMethod ?? "post",
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

      if (!availableBySize.has(sizeValue)) {
        availableBySize.set(sizeValue, { variant, variantId });
      }
    }

    if (availableBySize.size === 0) {
      continue;
    }

    const availableSizes = sortSizes([...availableBySize.keys()]);

    // Prefer the landing-form size when available; otherwise lowest priced available size.
    let chosen: { variant: ShopifyVariantNode; variantId: string } | undefined;
    if (preferredSize) {
      for (const [size, entry] of availableBySize) {
        if (normalizeSize(size) === normalizeSize(preferredSize)) {
          chosen = entry;
          break;
        }
      }
    }
    if (!chosen) {
      chosen = [...availableBySize.values()].sort(
        (a, b) =>
          Number.parseFloat(a.variant.price) - Number.parseFloat(b.variant.price),
      )[0];
    }

    if (!chosen) {
      continue;
    }

    const chosenSize =
      extractVariantSize(chosen.variant) ?? availableSizes[0] ?? preferredSize;

    results.push({
      id: productId,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      imageUrl: product.featuredImage?.url ?? null,
      priceFrom: formatMoney(chosen.variant.price),
      availableVariantId: chosen.variantId,
      availableSize: chosenSize,
      availableSizes,
      colour: extractProductColour(product, chosen.variant),
    });
  }

  const availableSizes = sortSizes([
    ...new Set(results.flatMap((product) => product.availableSizes)),
  ]);

  return {
    eventDate: formatDateIso(eventDate),
    deliveryDate: formatDateIso(deliveryDate),
    returnDate: formatDateIso(returnDate),
    durationDays: params.durationDays,
    size: preferredSize,
    availableSizes,
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
