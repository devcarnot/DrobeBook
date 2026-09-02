import { Prisma } from "@prisma/client";

import prisma from "../db.server";
import {
  computeReturnDate,
  type HireDurationDays,
  toDateOnly,
} from "./booking/availability";
import { parseHireDuration, parseIsoDate } from "./booking/availability.server";

export type OrderLineItem = {
  product_id?: number | null;
  variant_id?: number | null;
  price?: string | null;
  properties?: Array<{ name?: string; value?: string }> | null;
};

export type OrderWebhookPayload = {
  id?: number;
  line_items?: OrderLineItem[];
};

const DISPLAY_DATE_PATTERN =
  /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/;

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function getLineProperty(
  properties: OrderLineItem["properties"],
  name: string,
): string | null {
  if (!properties?.length) {
    return null;
  }

  const match = properties.find(
    (property) => property.name?.toLowerCase() === name.toLowerCase(),
  );
  return match?.value?.trim() || null;
}

export function parseDisplayDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const iso = parseIsoDate(value);
  if (iso) {
    return iso;
  }

  const match = DISPLAY_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number.parseInt(match[3], 10);

  if (month == null || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }

  return toDateOnly(new Date(Date.UTC(year, month, day)));
}

function parseDurationDays(value: string | null): HireDurationDays | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)/);
  if (!match) {
    return parseHireDuration(value);
  }

  return parseHireDuration(match[1]);
}

function parseDeliveryMethod(value: string | null): "post" | "pickup" {
  if (!value) {
    return "post";
  }

  return /pickup/i.test(value) ? "pickup" : "post";
}

function parsePricePaid(value: string | null | undefined): Prisma.Decimal | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) {
    return null;
  }

  return new Prisma.Decimal(amount);
}

export function isBookingLineItem(lineItem: OrderLineItem): boolean {
  const properties = lineItem.properties ?? [];
  return properties.some((property) => property.name === "_gk_booking_id");
}

export type ParsedBookingLine = {
  bookingId: string;
  productId: string;
  variantId: string;
  size: string;
  deliveryDate: Date;
  returnDate: Date;
  durationDays: HireDurationDays;
  eventDate: Date;
  deliveryMethod: "post" | "pickup";
  pricePaid: Prisma.Decimal | null;
};

export function parseBookingLineItem(
  lineItem: OrderLineItem,
): ParsedBookingLine | null {
  const properties = lineItem.properties ?? [];
  const bookingId = getLineProperty(properties, "_gk_booking_id");
  const size = getLineProperty(properties, "Size");
  const deliveryDateRaw = getLineProperty(properties, "Delivery Date");
  const returnDateRaw = getLineProperty(properties, "Return Date");
  const eventDateRaw = getLineProperty(properties, "Event Date");
  const durationRaw = getLineProperty(properties, "Duration");
  const deliveryMethodRaw = getLineProperty(properties, "Delivery Method");

  if (!bookingId || !size || !lineItem.product_id || !lineItem.variant_id) {
    return null;
  }

  const deliveryDate = parseDisplayDate(deliveryDateRaw);
  const eventDate = parseDisplayDate(eventDateRaw);
  const durationDays = parseDurationDays(durationRaw);

  if (!deliveryDate || !eventDate || !durationDays) {
    return null;
  }

  const returnDate =
    parseDisplayDate(returnDateRaw) ??
    computeReturnDate(deliveryDate, durationDays);

  return {
    bookingId,
    productId: String(lineItem.product_id),
    variantId: String(lineItem.variant_id),
    size,
    deliveryDate,
    returnDate,
    durationDays,
    eventDate,
    deliveryMethod: parseDeliveryMethod(deliveryMethodRaw),
    pricePaid: parsePricePaid(lineItem.price),
  };
}

export async function confirmBookingFromOrder(
  shop: string,
  orderId: string,
  lineItem: OrderLineItem,
): Promise<{ created: boolean; bookingId: string } | null> {
  const parsed = parseBookingLineItem(lineItem);
  if (!parsed) {
    return null;
  }

  const existing = await prisma.booking.findUnique({
    where: { id: parsed.bookingId },
    select: { id: true, status: true },
  });

  if (existing?.status === "confirmed") {
    return { created: false, bookingId: existing.id };
  }

  const shouldIncrementGarment = existing?.status !== "confirmed";
  const pricePaid = parsed.pricePaid ?? new Prisma.Decimal(0);

  await prisma.$transaction(async (tx) => {
    await tx.booking.upsert({
      where: { id: parsed.bookingId },
      create: {
        id: parsed.bookingId,
        shop,
        productId: parsed.productId,
        variantId: parsed.variantId,
        size: parsed.size,
        startDate: parsed.deliveryDate,
        endDate: parsed.returnDate,
        deliveryMethod: parsed.deliveryMethod,
        eventDate: parsed.eventDate,
        orderId,
        status: "confirmed",
        pricePaid,
      },
      update: {
        orderId,
        status: "confirmed",
        pricePaid,
      },
    });

    if (shouldIncrementGarment) {
      await tx.garment.upsert({
        where: {
          shop_productId_variantId: {
            shop,
            productId: parsed.productId,
            variantId: parsed.variantId,
          },
        },
        create: {
          shop,
          productId: parsed.productId,
          variantId: parsed.variantId,
          timesRented: 1,
          totalRevenue: pricePaid,
        },
        update: {
          timesRented: { increment: 1 },
          totalRevenue: { increment: pricePaid },
        },
      });
    }
  });

  return { created: !existing, bookingId: parsed.bookingId };
}
