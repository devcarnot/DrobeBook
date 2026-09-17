import prisma from "../../db.server";
import { extractNumericId } from "../shopify-ids";
import {
  type AvailabilityResult,
  type BlockedDateRecord,
  type BookingRecord,
  type HireDurationDays,
  isProductVariantAvailable,
  toDateOnly,
} from "./availability";
import {
  parseDeliveryMethod,
  type BufferDayUnit,
  type DeliveryMethod,
} from "./buffer-config";
import { getHolidayDates, getShopBufferConfig } from "./buffer.server";

export type CheckAvailabilityParams = {
  shop: string;
  productId: string;
  variantId: string;
  deliveryDate: Date;
  durationDays: HireDurationDays;
  deliveryMethod?: DeliveryMethod;
  today?: Date;
  now?: Date;
};

export type AvailabilityData = {
  bufferConfig: Awaited<ReturnType<typeof getShopBufferConfig>>;
  holidays: ReadonlySet<string>;
  bookings: BookingRecord[];
  blockedDates: BlockedDateRecord[];
  inventoryQuantity: number;
};

export function normalizeShopifyResourceId(value: string): string {
  return extractNumericId(String(value ?? "").trim());
}

export type ShopAvailabilityData = AvailabilityData & {
  bookingsByVariant: Map<string, BookingRecord[]>;
};

const BOOKING_SELECT = {
  productId: true,
  variantId: true,
  startDate: true,
  endDate: true,
  status: true,
  deliveryMethod: true,
  bufferBeforeDays: true,
  bufferBeforeUnit: true,
  bufferAfterDays: true,
  bufferAfterUnit: true,
} as const;

const BLOCKED_DATE_SELECT = {
  startDate: true,
  endDate: true,
  productId: true,
  variantId: true,
  reason: true,
} as const;

function parseBufferDayUnit(value: unknown): BufferDayUnit | null {
  if (value === "business" || value === "calendar") {
    return value;
  }
  return null;
}

function mapBookingRecord(
  booking: {
    startDate: Date;
    endDate: Date;
    status: string;
    deliveryMethod: string;
    bufferBeforeDays: number | null;
    bufferBeforeUnit: string | null;
    bufferAfterDays: number | null;
    bufferAfterUnit: string | null;
  },
): BookingRecord {
  return {
    startDate: booking.startDate,
    endDate: booking.endDate,
    status: booking.status,
    deliveryMethod: booking.deliveryMethod,
    bufferBeforeDays: booking.bufferBeforeDays,
    bufferBeforeUnit: parseBufferDayUnit(booking.bufferBeforeUnit),
    bufferAfterDays: booking.bufferAfterDays,
    bufferAfterUnit: parseBufferDayUnit(booking.bufferAfterUnit),
  };
}

function blockedDatesForVariant(
  blockedDates: BlockedDateRecord[],
  productId: string,
  variantId: string,
): BlockedDateRecord[] {
  return blockedDates.filter((blocked) => {
    const productMatches =
      blocked.productId == null || blocked.productId === productId;
    const variantMatches =
      blocked.variantId == null || blocked.variantId === variantId;
    return productMatches && variantMatches;
  });
}

export function evaluateProductAvailability(
  params: CheckAvailabilityParams,
  data: AvailabilityData,
): AvailabilityResult {
  const deliveryMethod = params.deliveryMethod ?? "post";

  return isProductVariantAvailable({
    productId: params.productId,
    variantId: params.variantId,
    deliveryDate: params.deliveryDate,
    durationDays: params.durationDays,
    deliveryMethod,
    today: params.today,
    now: params.now,
    bufferConfig: data.bufferConfig,
    holidays: data.holidays,
    bookings: data.bookings,
    blockedDates: blockedDatesForVariant(
      data.blockedDates,
      params.productId,
      params.variantId,
    ),
    inventoryQuantity: data.inventoryQuantity,
  });
}

async function getVariantInventoryQuantity(
  shop: string,
  productId: string,
  variantId: string,
): Promise<number> {
  const row = await prisma.rentalProductVariant.findFirst({
    where: {
      shop,
      shopifyVariantId: variantId,
      rentalProduct: {
        shopifyProductId: productId,
      },
    },
    select: { inventoryQuantity: true },
  });

  const quantity = row?.inventoryQuantity;
  return quantity != null && quantity > 0 ? quantity : 1;
}

export async function loadVariantAvailabilityData(
  shop: string,
  productId: string,
  variantId: string,
): Promise<AvailabilityData> {
  const normalizedProductId = normalizeShopifyResourceId(productId);
  const normalizedVariantId = normalizeShopifyResourceId(variantId);

  const [bookings, blockedDates, bufferConfig, holidays, inventoryQuantity] =
    await Promise.all([
    prisma.booking.findMany({
      where: {
        shop,
        productId: normalizedProductId,
        variantId: normalizedVariantId,
        status: "confirmed",
      },
      select: BOOKING_SELECT,
    }),
    prisma.blockedDate.findMany({
      where: {
        shop,
        OR: [
          { productId: null, variantId: null },
          { productId: normalizedProductId, variantId: null },
          { productId: normalizedProductId, variantId: normalizedVariantId },
        ],
      },
      select: BLOCKED_DATE_SELECT,
    }),
    getShopBufferConfig(shop),
    getHolidayDates(shop),
    getVariantInventoryQuantity(shop, normalizedProductId, normalizedVariantId),
  ]);

  return {
    bufferConfig,
    holidays,
    bookings: bookings.map(mapBookingRecord),
    blockedDates,
    inventoryQuantity,
  };
}

export async function loadShopAvailabilityData(
  shop: string,
): Promise<ShopAvailabilityData> {
  const [bookings, blockedDates, bufferConfig, holidays] = await Promise.all([
    prisma.booking.findMany({
      where: {
        shop,
        status: "confirmed",
      },
      select: BOOKING_SELECT,
    }),
    prisma.blockedDate.findMany({
      where: { shop },
      select: BLOCKED_DATE_SELECT,
    }),
    getShopBufferConfig(shop),
    getHolidayDates(shop),
  ]);

  const bookingsByVariant = new Map<string, BookingRecord[]>();
  for (const booking of bookings) {
    const key = `${booking.productId}:${booking.variantId}`;
    const record = mapBookingRecord(booking);
    const existing = bookingsByVariant.get(key);
    if (existing) {
      existing.push(record);
    } else {
      bookingsByVariant.set(key, [record]);
    }
  }

  return {
    bufferConfig,
    holidays,
    bookings: bookings.map(mapBookingRecord),
    blockedDates,
    bookingsByVariant,
  };
}

export async function checkProductAvailability(
  params: CheckAvailabilityParams,
): Promise<AvailabilityResult> {
  const productId = normalizeShopifyResourceId(params.productId);
  const variantId = normalizeShopifyResourceId(params.variantId);
  const data = await loadVariantAvailabilityData(
    params.shop,
    productId,
    variantId,
  );
  return evaluateProductAvailability(
    {
      ...params,
      productId,
      variantId,
    },
    data,
  );
}

export function parseHireDuration(
  value: string | null,
  allowedDays?: number[],
): HireDurationDays | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (allowedDays?.length) {
    return allowedDays.includes(parsed) ? parsed : null;
  }

  return parsed >= 1 && parsed <= 90 ? parsed : null;
}

export function parseIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return toDateOnly(date);
}

export { mapBookingRecord, parseBufferDayUnit, parseDeliveryMethod };
