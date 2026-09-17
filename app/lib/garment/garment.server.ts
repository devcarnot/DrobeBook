import { Prisma } from "@prisma/client";

import prisma from "../../db.server";
import {
  addDays,
  formatDateIso,
  type HireDurationDays,
  toDateOnly,
} from "../booking/availability";
import {
  evaluateProductAvailability,
  loadShopAvailabilityData,
  loadVariantAvailabilityData,
  type AvailabilityData,
  type ShopAvailabilityData,
} from "../booking/availability.server";
import {
  computeGarmentProfit,
  fetchVariantUnitCost,
  formatRevenue,
  type VariantUnitCost,
} from "./garment-cost.server";
import { getWaitlistForGarment } from "../waitlist/waitlist-notify.server";

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
  pendingBookings: number;
  activeHold: boolean;
};

export type InventorySummary = {
  variantCount: number;
  totalTimesRented: number;
  totalRevenue: number;
  totalRevenueLabel: string;
  totalProfit: number | null;
  totalProfitLabel: string;
  confirmedBookings: number;
  pendingBookings: number;
  activeHolds: number;
};

export type GarmentHistoryBooking = {
  id: string;
  startDate: string;
  endDate: string;
  source: "online" | "manual";
  status: string;
  orderId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  pricePaid: number | null;
};

export type GarmentHistoryBlock = {
  id: string;
  startDate: string;
  endDate: string;
  source: "manual" | "shop";
  reason: string | null;
  createdBy: string | null;
};

export type GarmentTryOnAppointment = {
  id: string;
  date: string;
  time: string;
  durationMinutes: number;
  source: "online" | "admin";
  customerName: string | null;
  customerEmail: string | null;
  itemsToTryOn: string | null;
  orderId: string | null;
};

export type GarmentWaitlistEntry = {
  id: string;
  email: string;
  name: string | null;
  size: string | null;
  eventDate: string | null;
  status: string;
  notifiedAt: string | null;
  claimExpiresAt: string | null;
  createdAt: string;
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
  purchaseCostOverride: number | null;
  cleaningCostPerHire: number | null;
  unitCost: VariantUnitCost;
  nextAvailableDate: string | null;
  bookings: GarmentHistoryBooking[];
  blockedDates: GarmentHistoryBlock[];
  shopWideBlocks: GarmentHistoryBlock[];
  waitlistEntries: GarmentWaitlistEntry[];
  waitlistWaitingCount: number;
  tryOnAppointments: GarmentTryOnAppointment[];
  isTryOnServiceProduct: boolean;
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

export function findNextAvailableDateFromData(
  data: AvailabilityData,
  params: {
    productId: string;
    variantId: string;
    durationDays?: HireDurationDays;
    today?: Date;
    horizonDays?: number;
  },
): string | null {
  const durationDays = params.durationDays ?? 4;
  const today = params.today ?? new Date();
  const horizonDays = params.horizonDays ?? 120;
  const start = addDays(toDateOnly(today), 4);

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const deliveryDate = addDays(start, offset);
    const result = evaluateProductAvailability(
      {
        shop: "",
        productId: params.productId,
        variantId: params.variantId,
        deliveryDate,
        durationDays,
        today,
      },
      data,
    );

    if (result.available) {
      return formatDateIso(deliveryDate);
    }
  }

  return null;
}

function variantAvailabilityData(
  shopData: ShopAvailabilityData,
  productId: string,
  variantId: string,
): AvailabilityData {
  return {
    bufferConfig: shopData.bufferConfig,
    holidays: shopData.holidays,
    blockedDates: shopData.blockedDates,
    bookings:
      shopData.bookingsByVariant.get(`${productId}:${variantId}`) ?? [],
    inventoryQuantity: 1,
  };
}

export async function findNextAvailableDate(
  shop: string,
  productId: string,
  variantId: string,
  durationDays: HireDurationDays = 4,
  today: Date = new Date(),
  horizonDays = 120,
): Promise<string | null> {
  const data = await loadVariantAvailabilityData(shop, productId, variantId);
  return findNextAvailableDateFromData(data, {
    productId,
    variantId,
    durationDays,
    today,
    horizonDays,
  });
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

  const rentedRows = productRows.filter((row) => {
    const garment = garmentByVariant.get(`${row.productId}:${row.variantId}`);
    return Boolean(garment && garment.timesRented > 0);
  });

  const today = toDateOnly(new Date());
  const [shopAvailabilityData, pendingRows, activeHoldRows] = await Promise.all([
    rentedRows.length > 0 ? loadShopAvailabilityData(shop) : Promise.resolve(null),
    prisma.booking.groupBy({
      by: ["productId", "variantId"],
      where: { shop, status: "pending" },
      _count: { _all: true },
    }),
    prisma.blockedDate.findMany({
      where: {
        shop,
        productId: { not: null },
        variantId: { not: null },
        endDate: { gte: today },
      },
      select: { productId: true, variantId: true },
    }),
  ]);

  const pendingByVariant = new Map(
    pendingRows.map((row) => [
      `${row.productId}:${row.variantId}`,
      row._count._all,
    ]),
  );
  const holdByVariant = new Set(
    activeHoldRows.map((row) => `${row.productId}:${row.variantId}`),
  );

  const items: GarmentListItem[] = [];

  for (const row of productRows) {
    const garment = garmentByVariant.get(`${row.productId}:${row.variantId}`);
    const totalRevenue = decimalToNumber(garment?.totalRevenue);
    const timesRented = garment?.timesRented ?? 0;
    const unitCost =
      unitCosts.get(row.variantId) ??
      ({ amount: null, currencyCode: null, available: false } satisfies VariantUnitCost);
    const { profit, profitLabel } = computeGarmentProfit(
      totalRevenue,
      timesRented,
      unitCost,
      {
        purchaseCostOverride: decimalToNumber(garment?.purchaseCostOverride) || null,
        cleaningCostPerHire: decimalToNumber(garment?.cleaningCostPerHire) || null,
      },
    );
    const nextAvailableDate =
      garment && garment.timesRented > 0 && shopAvailabilityData
        ? findNextAvailableDateFromData(
            variantAvailabilityData(
              shopAvailabilityData,
              row.productId,
              row.variantId,
            ),
            {
              productId: row.productId,
              variantId: row.variantId,
              durationDays: 4,
              today,
              horizonDays: 45,
            },
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
      pendingBookings:
        pendingByVariant.get(`${row.productId}:${row.variantId}`) ?? 0,
      activeHold: holdByVariant.has(`${row.productId}:${row.variantId}`),
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
  options: {
    tryOnVariantId?: string | null;
    tryOnProductTitle?: string | null;
  } = {},
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

  const normalizedProductId = extractNumericId(productId);
  const normalizedVariantId = extractNumericId(variantId);
  const isTryOnServiceProduct =
    Boolean(
      options.tryOnVariantId &&
        extractNumericId(options.tryOnVariantId) === normalizedVariantId,
    ) ||
    Boolean(
      options.tryOnProductTitle &&
        product.title.trim().toLowerCase() ===
          options.tryOnProductTitle.trim().toLowerCase(),
    );

  const [garment, bookings, blockedDates, unitCost, nextAvailableDate, waitlistEntries, tryOnAppointments] =
    await Promise.all([
      prisma.garment.findUnique({
        where: {
          shop_productId_variantId: {
            shop,
            productId: normalizedProductId,
            variantId: normalizedVariantId,
          },
        },
      }),
      prisma.booking.findMany({
        where: {
          shop,
          productId: normalizedProductId,
          variantId: normalizedVariantId,
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.blockedDate.findMany({
        where: {
          shop,
          OR: [
            { productId: normalizedProductId, variantId: normalizedVariantId },
            { productId: null, variantId: null },
          ],
        },
        orderBy: { startDate: "desc" },
      }),
      fetchVariantUnitCost(admin, variantId),
      findNextAvailableDate(shop, normalizedProductId, normalizedVariantId),
      getWaitlistForGarment(shop, normalizedProductId, normalizedVariantId),
      prisma.appointmentBooking.findMany({
        where: isTryOnServiceProduct
          ? { shop }
          : {
              shop,
              gownProductId: normalizedProductId,
              gownVariantId: normalizedVariantId,
            },
        orderBy: [{ date: "desc" }, { time: "desc" }],
      }),
    ]);

  const timesRented = garment?.timesRented ?? 0;
  const totalRevenue = decimalToNumber(garment?.totalRevenue);
  const purchaseCostOverride = garment?.purchaseCostOverride
    ? decimalToNumber(garment.purchaseCostOverride)
    : null;
  const cleaningCostPerHire = garment?.cleaningCostPerHire
    ? decimalToNumber(garment.cleaningCostPerHire)
    : null;
  const { profit, profitLabel } = computeGarmentProfit(
    totalRevenue,
    timesRented,
    unitCost,
    { purchaseCostOverride, cleaningCostPerHire },
  );

  const waitlistWaitingCount = waitlistEntries.filter(
    (entry) => entry.status === "waiting",
  ).length;

  return {
    productId: normalizedProductId,
    variantId: normalizedVariantId,
    productTitle: product.title,
    variantTitle: variant.title,
    sizeLabel: variantSizeLabel(variant.selectedOptions ?? [], variant.title),
    imageUrl: product.featuredImage?.url ?? null,
    timesRented,
    totalRevenue,
    revenueLabel: formatRevenue(totalRevenue),
    profit,
    profitLabel,
    purchaseCostOverride,
    cleaningCostPerHire,
    unitCost,
    nextAvailableDate,
    waitlistWaitingCount,
    waitlistEntries: waitlistEntries.map((entry) => ({
      id: entry.id,
      email: entry.email,
      name: entry.name,
      size: entry.size,
      eventDate: entry.eventDate ? formatDateIso(entry.eventDate) : null,
      status: entry.status,
      notifiedAt: entry.notifiedAt?.toISOString() ?? null,
      claimExpiresAt: entry.claimExpiresAt?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
    })),
    bookings: bookings.map((booking) => ({
      id: booking.id,
      startDate: formatDateIso(booking.startDate),
      endDate: formatDateIso(booking.endDate),
      source: booking.orderId ? ("online" as const) : ("manual" as const),
      status: booking.status,
      orderId: booking.orderId,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      pricePaid: booking.pricePaid
        ? decimalToNumber(booking.pricePaid)
        : null,
    })),
    blockedDates: blockedDates
      .filter((block) => block.productId && block.variantId)
      .map((block) => ({
        id: block.id,
        startDate: formatDateIso(block.startDate),
        endDate: formatDateIso(block.endDate),
        source: "manual" as const,
        reason: block.reason,
        createdBy: block.createdBy,
      })),
    shopWideBlocks: blockedDates
      .filter((block) => !block.productId && !block.variantId)
      .map((block) => ({
        id: block.id,
        startDate: formatDateIso(block.startDate),
        endDate: formatDateIso(block.endDate),
        source: "shop" as const,
        reason: block.reason,
        createdBy: block.createdBy,
      })),
    tryOnAppointments: tryOnAppointments.map((appointment) => ({
      id: appointment.id,
      date: formatDateIso(appointment.date),
      time: appointment.time,
      durationMinutes: appointment.durationMinutes,
      source: appointment.source === "admin" ? ("admin" as const) : ("online" as const),
      customerName: appointment.customerName,
      customerEmail: appointment.customerEmail,
      itemsToTryOn: appointment.itemsToTryOn,
      orderId: appointment.orderId.startsWith("admin-")
        ? null
        : appointment.orderId,
    })),
    isTryOnServiceProduct,
  };
}

export async function getInventorySummary(
  shop: string,
  garments: GarmentListItem[],
): Promise<InventorySummary> {
  const today = toDateOnly(new Date());
  const [bookingCounts, activeHolds] = await Promise.all([
    prisma.booking.groupBy({
      by: ["status"],
      where: { shop, status: { in: ["pending", "confirmed"] } },
      _count: { _all: true },
    }),
    prisma.blockedDate.count({
      where: {
        shop,
        productId: { not: null },
        endDate: { gte: today },
      },
    }),
  ]);

  const countByStatus = new Map(
    bookingCounts.map((row) => [row.status, row._count._all]),
  );
  const totalRevenue = garments.reduce((sum, item) => sum + item.totalRevenue, 0);
  const totalTimesRented = garments.reduce(
    (sum, item) => sum + item.timesRented,
    0,
  );
  const profitValues = garments
    .map((item) => item.profit)
    .filter((value): value is number => value != null);
  const totalProfit =
    profitValues.length > 0
      ? profitValues.reduce((sum, value) => sum + value, 0)
      : null;

  return {
    variantCount: garments.length,
    totalTimesRented,
    totalRevenue,
    totalRevenueLabel: formatRevenue(totalRevenue),
    totalProfit,
    totalProfitLabel:
      totalProfit == null ? "—" : formatRevenue(totalProfit),
    confirmedBookings: countByStatus.get("confirmed") ?? 0,
    pendingBookings: countByStatus.get("pending") ?? 0,
    activeHolds,
  };
}

export type GarmentCalendarDay = {
  iso: string;
  confirmedBookings: number;
  pendingBookings: number;
  garmentBlocks: number;
  shopBlocks: number;
  tryOnAppointments: number;
};

export function buildGarmentCalendarDays(
  year: number,
  month: number,
  bookings: GarmentHistoryBooking[],
  garmentBlocks: GarmentHistoryBlock[],
  shopWideBlocks: GarmentHistoryBlock[] = [],
  tryOnAppointments: GarmentTryOnAppointment[] = [],
): GarmentCalendarDay[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: GarmentCalendarDay[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const current = toDateOnly(new Date(`${iso}T12:00:00.000Z`));

    const inRange = (startDate: string, endDate: string) => {
      const start = toDateOnly(new Date(`${startDate}T12:00:00.000Z`));
      const end = toDateOnly(new Date(`${endDate}T12:00:00.000Z`));
      return current >= start && current <= end;
    };

    const confirmedBookings = bookings.filter(
      (booking) =>
        booking.status === "confirmed" &&
        inRange(booking.startDate, booking.endDate),
    ).length;
    const pendingBookings = bookings.filter(
      (booking) =>
        booking.status === "pending" &&
        inRange(booking.startDate, booking.endDate),
    ).length;
    const garmentBlockCount = garmentBlocks.filter((block) =>
      inRange(block.startDate, block.endDate),
    ).length;
    const shopBlockCount = shopWideBlocks.filter((block) =>
      inRange(block.startDate, block.endDate),
    ).length;
    const tryOnAppointmentCount = tryOnAppointments.filter(
      (appointment) => appointment.date === iso,
    ).length;

    days.push({
      iso,
      confirmedBookings,
      pendingBookings,
      garmentBlocks: garmentBlockCount,
      shopBlocks: shopBlockCount,
      tryOnAppointments: tryOnAppointmentCount,
    });
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
