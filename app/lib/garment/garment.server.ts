import { Prisma } from "@prisma/client";

import prisma from "../../db.server";
import {
  addDays,
  formatDateIso,
  type HireDurationDays,
  toDateOnly,
} from "../booking/availability";
import { checkProductAvailability } from "../booking/availability.server";
import {
  computeGarmentProfit,
  fetchVariantUnitCost,
  formatRevenue,
  type VariantUnitCost,
} from "./garment-cost.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type GarmentListSort = "timesRented" | "revenue" | "profit" | "name";

export type GarmentListItem = {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sizeLabel: string;
  imageUrl: string | null;
  timesRented: number;
  totalRevenue: number;
  revenueLabel: string;
  profit: number | null;
  profitLabel: string;
  nextAvailableDate: string | null;
  unitCost: VariantUnitCost;
};

export type GarmentHistoryBooking = {
  id: string;
  startDate: string;
  endDate: string;
  source: "online";
  status: string;
  orderId: string | null;
  pricePaid: number | null;
};

export type GarmentHistoryBlock = {
  id: string;
  startDate: string;
  endDate: string;
  source: "manual";
  reason: string | null;
  createdBy: string | null;
};

export type GarmentDetail = {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sizeLabel: string;
  imageUrl: string | null;
  timesRented: number;
  totalRevenue: number;
  revenueLabel: string;
  profit: number | null;
  profitLabel: string;
  unitCost: VariantUnitCost;
  nextAvailableDate: string | null;
  bookings: GarmentHistoryBooking[];
  blockedDates: GarmentHistoryBlock[];
};

const PRODUCTS_QUERY = `#graphql
  query InventoryProducts($query: String, $first: Int!, $after: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        featuredImage {
          url
        }
        variants(first: 100) {
          nodes {
            id
            title
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

const VARIANT_COSTS_QUERY = `#graphql
  query VariantUnitCosts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryItem {
          unitCost {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

const PRODUCT_VARIANT_QUERY = `#graphql
  query GarmentProductVariant($productId: ID!, $variantId: ID!) {
    product(id: $productId) {
      id
      title
      featuredImage {
        url
      }
    }
    productVariant(id: $variantId) {
      id
      title
      selectedOptions {
        name
        value
      }
    }
  }
`;

function extractNumericId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

function toProductGid(productId: string): string {
  return productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;
}

function toVariantGid(variantId: string): string {
  return variantId.startsWith("gid://")
    ? variantId
    : `gid://shopify/ProductVariant/${variantId}`;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  return Number.parseFloat(value.toString()) || 0;
}

function variantSizeLabel(
  selectedOptions: Array<{ name: string; value: string }>,
  variantTitle: string,
): string {
  const sizeOption = selectedOptions.find((option) => /size/i.test(option.name));
  return sizeOption?.value ?? variantTitle;
}

async function fetchVariantUnitCostsBatch(
  admin: AdminGraphqlClient,
  variantIds: string[],
): Promise<Map<string, VariantUnitCost>> {
  const costs = new Map<string, VariantUnitCost>();
  if (variantIds.length === 0) {
    return costs;
  }

  const uniqueIds = [...new Set(variantIds)];
  const chunkSize = 50;

  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const chunk = uniqueIds.slice(index, index + chunkSize);
    try {
      const response = await admin.graphql(VARIANT_COSTS_QUERY, {
        variables: { ids: chunk.map((id) => toVariantGid(id)) },
      });
      const json = (await response.json()) as {
        data?: {
          nodes?: Array<{
            id?: string;
            inventoryItem?: {
              unitCost?: { amount?: string; currencyCode?: string } | null;
            } | null;
          } | null>;
        };
        errors?: Array<{ message?: string }>;
      };

      if (json.errors?.length) {
        console.warn("Batch unit cost query failed:", json.errors[0]?.message);
        continue;
      }

      for (const node of json.data?.nodes ?? []) {
        if (!node?.id) {
          continue;
        }
        const variantId = extractNumericId(node.id);
        const unitCost = node.inventoryItem?.unitCost;
        if (!unitCost?.amount) {
          costs.set(variantId, {
            amount: null,
            currencyCode: unitCost?.currencyCode ?? null,
            available: true,
          });
          continue;
        }

        const amount = Number.parseFloat(unitCost.amount);
        costs.set(variantId, {
          amount: Number.isNaN(amount) ? null : amount,
          currencyCode: unitCost.currencyCode ?? null,
          available: true,
        });
      }
    } catch (error) {
      console.warn("Unable to fetch batch variant unit costs:", error);
    }
  }

  return costs;
}

async function fetchAllProducts(
  admin: AdminGraphqlClient,
  searchQuery: string | null,
): Promise<
  Array<{
    productId: string;
    productTitle: string;
    imageUrl: string | null;
    variantId: string;
    variantTitle: string;
    sizeLabel: string;
  }>
> {
  const rows: Array<{
    productId: string;
    productTitle: string;
    imageUrl: string | null;
    variantId: string;
    variantTitle: string;
    sizeLabel: string;
  }> = [];

  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: {
        first: 50,
        after,
        query: searchQuery || undefined,
      },
    });
    const json = (await response.json()) as {
      data?: {
        products?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: Array<{
            id: string;
            title: string;
            featuredImage?: { url?: string } | null;
            variants?: {
              nodes?: Array<{
                id: string;
                title: string;
                selectedOptions?: Array<{ name: string; value: string }>;
              }>;
            };
          }>;
        };
      };
    };

    const products = json.data?.products;
    hasNextPage = products?.pageInfo?.hasNextPage ?? false;
    after = products?.pageInfo?.endCursor ?? null;

    for (const product of products?.nodes ?? []) {
      const productId = extractNumericId(product.id);
      for (const variant of product.variants?.nodes ?? []) {
        rows.push({
          productId,
          productTitle: product.title,
          imageUrl: product.featuredImage?.url ?? null,
          variantId: extractNumericId(variant.id),
          variantTitle: variant.title,
          sizeLabel: variantSizeLabel(variant.selectedOptions ?? [], variant.title),
        });
      }
    }

    if (rows.length >= 250) {
      break;
    }
  }

  return rows;
}

export async function findNextAvailableDate(
  shop: string,
  productId: string,
  variantId: string,
  durationDays: HireDurationDays = 4,
  today: Date = new Date(),
  horizonDays = 120,
): Promise<string | null> {
  const start = addDays(toDateOnly(today), 4);

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const deliveryDate = addDays(start, offset);
    const result = await checkProductAvailability({
      shop,
      productId,
      variantId,
      deliveryDate,
      durationDays,
      today,
    });

    if (result.available) {
      return formatDateIso(deliveryDate);
    }
  }

  return null;
}

export async function listGarmentsForShop(
  admin: AdminGraphqlClient,
  shop: string,
  options: {
    search?: string | null;
    sort?: GarmentListSort;
  } = {},
): Promise<GarmentListItem[]> {
  const search = options.search?.trim() || null;
  const sort = options.sort ?? "name";

  const [productRows, garmentRows] = await Promise.all([
    fetchAllProducts(admin, search),
    prisma.garment.findMany({ where: { shop } }),
  ]);

  const garmentByVariant = new Map(
    garmentRows.map((row) => [`${row.productId}:${row.variantId}`, row]),
  );

  const unitCosts = await fetchVariantUnitCostsBatch(
    admin,
    productRows.map((row) => row.variantId),
  );

  const items: GarmentListItem[] = [];

  for (const row of productRows) {
    const garment = garmentByVariant.get(`${row.productId}:${row.variantId}`);
    const totalRevenue = decimalToNumber(garment?.totalRevenue);
    const unitCost =
      unitCosts.get(row.variantId) ??
      ({ amount: null, currencyCode: null, available: false } satisfies VariantUnitCost);
    const { profit, profitLabel } = computeGarmentProfit(totalRevenue, unitCost);
    const nextAvailableDate =
      garment && garment.timesRented > 0
        ? await findNextAvailableDate(
            shop,
            row.productId,
            row.variantId,
            4,
            new Date(),
            45,
          )
        : null;

    items.push({
      productId: row.productId,
      variantId: row.variantId,
      productTitle: row.productTitle,
      variantTitle: row.variantTitle,
      sizeLabel: row.sizeLabel,
      imageUrl: row.imageUrl,
      timesRented: garment?.timesRented ?? 0,
      totalRevenue,
      revenueLabel: formatRevenue(totalRevenue),
      profit,
      profitLabel,
      nextAvailableDate,
      unitCost,
    });
  }

  items.sort((a, b) => {
    switch (sort) {
      case "timesRented":
        return b.timesRented - a.timesRented || a.productTitle.localeCompare(b.productTitle);
      case "revenue":
        return b.totalRevenue - a.totalRevenue || a.productTitle.localeCompare(b.productTitle);
      case "profit":
        return (b.profit ?? -Infinity) - (a.profit ?? -Infinity) ||
          a.productTitle.localeCompare(b.productTitle);
      default:
        return a.productTitle.localeCompare(b.productTitle) ||
          a.sizeLabel.localeCompare(b.sizeLabel);
    }
  });

  return items;
}

export async function getGarmentDetail(
  admin: AdminGraphqlClient,
  shop: string,
  productId: string,
  variantId: string,
): Promise<GarmentDetail | null> {
  const response = await admin.graphql(PRODUCT_VARIANT_QUERY, {
    variables: {
      productId: toProductGid(productId),
      variantId: toVariantGid(variantId),
    },
  });
  const json = (await response.json()) as {
    data?: {
      product?: {
        id: string;
        title: string;
        featuredImage?: { url?: string } | null;
      } | null;
      productVariant?: {
        id: string;
        title: string;
        selectedOptions?: Array<{ name: string; value: string }>;
      } | null;
    };
  };

  const product = json.data?.product;
  const variant = json.data?.productVariant;
  if (!product || !variant) {
    return null;
  }

  const [garment, bookings, blockedDates, unitCost, nextAvailableDate] =
    await Promise.all([
      prisma.garment.findUnique({
        where: {
          shop_productId_variantId: { shop, productId, variantId },
        },
      }),
      prisma.booking.findMany({
        where: {
          shop,
          productId,
          variantId,
          status: "confirmed",
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.blockedDate.findMany({
        where: {
          shop,
          OR: [
            { productId, variantId },
            { productId: null, variantId: null },
          ],
        },
        orderBy: { startDate: "desc" },
      }),
      fetchVariantUnitCost(admin, variantId),
      findNextAvailableDate(shop, productId, variantId),
    ]);

  const totalRevenue = decimalToNumber(garment?.totalRevenue);
  const { profit, profitLabel } = computeGarmentProfit(totalRevenue, unitCost);

  return {
    productId,
    variantId,
    productTitle: product.title,
    variantTitle: variant.title,
    sizeLabel: variantSizeLabel(variant.selectedOptions ?? [], variant.title),
    imageUrl: product.featuredImage?.url ?? null,
    timesRented: garment?.timesRented ?? 0,
    totalRevenue,
    revenueLabel: formatRevenue(totalRevenue),
    profit,
    profitLabel,
    unitCost,
    nextAvailableDate,
    bookings: bookings.map((booking) => ({
      id: booking.id,
      startDate: formatDateIso(booking.startDate),
      endDate: formatDateIso(booking.endDate),
      source: "online" as const,
      status: booking.status,
      orderId: booking.orderId,
      pricePaid: booking.pricePaid
        ? decimalToNumber(booking.pricePaid)
        : null,
    })),
    blockedDates: blockedDates.map((block) => ({
      id: block.id,
      startDate: formatDateIso(block.startDate),
      endDate: formatDateIso(block.endDate),
      source: "manual" as const,
      reason: block.reason,
      createdBy: block.createdBy,
    })),
  };
}

export type GarmentCalendarDay = {
  iso: string;
  bookings: number;
  blocks: number;
};

export function buildGarmentCalendarDays(
  year: number,
  month: number,
  bookings: GarmentHistoryBooking[],
  blockedDates: GarmentHistoryBlock[],
): GarmentCalendarDay[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: GarmentCalendarDay[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const current = toDateOnly(new Date(`${iso}T12:00:00.000Z`));

    const bookingCount = bookings.filter((booking) => {
      const start = toDateOnly(new Date(`${booking.startDate}T12:00:00.000Z`));
      const end = toDateOnly(new Date(`${booking.endDate}T12:00:00.000Z`));
      return current >= start && current <= end;
    }).length;

    const blockCount = blockedDates.filter((block) => {
      const start = toDateOnly(new Date(`${block.startDate}T12:00:00.000Z`));
      const end = toDateOnly(new Date(`${block.endDate}T12:00:00.000Z`));
      return current >= start && current <= end;
    }).length;

    days.push({ iso, bookings: bookingCount, blocks: blockCount });
  }

  return days;
}

export function currentCalendarMonth(): { year: number; month: number } {
  const today = new Date();
  return {
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  };
}
