import prisma from "../../db.server";
import {
  type AvailabilityResult,
  type HireDurationDays,
  HIRE_DURATIONS,
  isProductVariantAvailable,
  toDateOnly,
} from "./availability";
import { parseDeliveryMethod, type DeliveryMethod } from "./buffer-config";
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

export async function checkProductAvailability(
  params: CheckAvailabilityParams,
): Promise<AvailabilityResult> {
  const deliveryMethod = params.deliveryMethod ?? "post";

  const [bookings, blockedDates, bufferConfig, holidays] = await Promise.all([
    prisma.booking.findMany({
      where: {
        shop: params.shop,
        productId: params.productId,
        variantId: params.variantId,
        status: { in: ["pending", "confirmed"] },
      },
      select: {
        startDate: true,
        endDate: true,
        status: true,
        deliveryMethod: true,
        bufferBeforeDays: true,
        bufferBeforeUnit: true,
        bufferAfterDays: true,
        bufferAfterUnit: true,
      },
    }),
    prisma.blockedDate.findMany({
      where: {
        shop: params.shop,
        OR: [
          { productId: null, variantId: null },
          { productId: params.productId, variantId: null },
          { productId: params.productId, variantId: params.variantId },
        ],
      },
      select: {
        startDate: true,
        endDate: true,
        productId: true,
        variantId: true,
        reason: true,
      },
    }),
    getShopBufferConfig(params.shop),
    getHolidayDates(params.shop),
  ]);

  return isProductVariantAvailable({
    productId: params.productId,
    variantId: params.variantId,
    deliveryDate: params.deliveryDate,
    durationDays: params.durationDays,
    deliveryMethod,
    today: params.today,
    now: params.now,
    bufferConfig,
    holidays,
    bookings,
    blockedDates,
  });
}

export function parseHireDuration(value: string | null): HireDurationDays | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!HIRE_DURATIONS.includes(parsed as HireDurationDays)) {
    return null;
  }

  return parsed as HireDurationDays;
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

export { parseDeliveryMethod };
