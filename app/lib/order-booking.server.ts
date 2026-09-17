import { Prisma } from "@prisma/client";

import { processOrderAppointments } from "./appointment/appointment-order.server";
import prisma from "../db.server";
import {
  bookingToNotificationContext,
  sendRentalNotification,
} from "./notifications/notification.server";
import { recordGarmentHire } from "./garment/garment-stats.server";
import { fulfillWaitlistForBooking } from "./waitlist/waitlist.server";
import {
  computeReturnDate,
  type HireDurationDays,
  toDateOnly,
} from "./booking/availability";
import { parseHireDuration, parseIsoDate } from "./booking/availability.server";

export type OrderLineItem = {
  product_id?: number | string | null;
  variant_id?: number | string | null;
  price?: string | null;
  properties?: Array<{ name?: string; value?: string }> | null;
};

export type OrderWebhookPayload = {
  id?: number | string;
  email?: string | null;
  financial_status?: string | null;
  line_items?: OrderLineItem[];
};

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const RECENT_ORDERS_QUERY = `#graphql
  query SyncRecentOrderBookings($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        legacyResourceId
        lineItems(first: 50) {
          nodes {
            product {
              legacyResourceId
            }
            variant {
              legacyResourceId
            }
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            customAttributes {
              key
              value
            }
          }
        }
      }
    }
  }
`;

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

function toNumericId(value: number | string | null | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
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
  const size =
    getLineProperty(properties, "_Size") ?? getLineProperty(properties, "Size");
  const deliveryDateRaw = getLineProperty(properties, "Delivery Date");
  const returnDateRaw = getLineProperty(properties, "Return Date");
  const eventDateRaw = getLineProperty(properties, "Event Date");
  const durationRaw =
    getLineProperty(properties, "_Duration") ??
    getLineProperty(properties, "Duration");
  const deliveryMethodRaw = getLineProperty(properties, "Delivery Method");

  const productId = toNumericId(lineItem.product_id);
  const variantId = toNumericId(lineItem.variant_id);

  if (!bookingId || !size || productId == null || variantId == null) {
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
    productId: String(productId),
    variantId: String(variantId),
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
  customerEmail?: string | null,
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
      await recordGarmentHire(
        shop,
        parsed.productId,
        parsed.variantId,
        pricePaid,
      );
    }
  });

  await fulfillWaitlistForBooking(
    shop,
    parsed.productId,
    parsed.variantId,
    customerEmail,
  );

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: parsed.bookingId },
  });

  if (!existing || existing.status !== "confirmed") {
    void sendRentalNotification(shop, bookingToNotificationContext(booking), {
      trigger: "on_create",
    }).catch(() => undefined);
  }

  return { created: !existing, bookingId: parsed.bookingId };
}

export async function processOrderBookings(
  shop: string,
  orderId: string,
  lineItems: OrderLineItem[],
  customerEmail?: string | null,
): Promise<{ confirmed: number; skipped: number }> {
  let confirmed = 0;
  let skipped = 0;

  for (const lineItem of lineItems) {
    if (!isBookingLineItem(lineItem)) {
      continue;
    }

    const result = await confirmBookingFromOrder(
      shop,
      orderId,
      lineItem,
      customerEmail,
    );
    if (result) {
      confirmed += 1;
    } else {
      skipped += 1;
    }
  }

  return { confirmed, skipped };
}

function graphLineItemToOrderLineItem(lineItem: {
  product?: { legacyResourceId?: string | null } | null;
  variant?: { legacyResourceId?: string | null } | null;
  originalUnitPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
  customAttributes?: Array<{ key?: string | null; value?: string | null }> | null;
}): OrderLineItem {
  return {
    product_id: lineItem.product?.legacyResourceId ?? null,
    variant_id: lineItem.variant?.legacyResourceId ?? null,
    price: lineItem.originalUnitPriceSet?.shopMoney?.amount ?? null,
    properties: (lineItem.customAttributes ?? []).map((attribute) => ({
      name: attribute.key ?? undefined,
      value: attribute.value ?? undefined,
    })),
  };
}

export async function syncRecentOrderBookings(
  admin: AdminGraphqlClient,
  shop: string,
  options: { limit?: number } = {},
): Promise<{
  ordersChecked: number;
  bookingsConfirmed: number;
  requiresProtectedCustomerData?: boolean;
  errorMessage?: string;
}> {
  const limit = options.limit ?? 50;
  try {
    const response = await admin.graphql(RECENT_ORDERS_QUERY, {
      variables: { first: limit },
    });
    const json = (await response.json()) as {
      data?: {
        orders?: {
          nodes?: Array<{
            legacyResourceId?: string | null;
            lineItems?: {
              nodes?: Array<Parameters<typeof graphLineItemToOrderLineItem>[0]>;
            } | null;
          }>;
        };
      } | null;
      errors?: Array<{ message?: string }>;
    };

    if (json.errors?.length) {
      const message = json.errors.map((error) => error.message).join("; ");
      if (/protected customer data|not approved to access the order/i.test(message)) {
        return {
          ordersChecked: 0,
          bookingsConfirmed: 0,
          requiresProtectedCustomerData: true,
          errorMessage: message,
        };
      }
      throw new Error(message);
    }

    const orders = json.data?.orders?.nodes ?? [];
    let bookingsConfirmed = 0;

    for (const order of orders) {
      const orderId = order.legacyResourceId;
      if (!orderId) {
        continue;
      }

      const lineItems = (order.lineItems?.nodes ?? []).map(
        graphLineItemToOrderLineItem,
      );
      const result = await processOrderBookings(shop, orderId, lineItems);
      bookingsConfirmed += result.confirmed;
      await processOrderAppointments(shop, orderId, lineItems);
    }

    return {
      ordersChecked: orders.length,
      bookingsConfirmed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/protected customer data|not approved to access the order/i.test(message)) {
      return {
        ordersChecked: 0,
        bookingsConfirmed: 0,
        requiresProtectedCustomerData: true,
        errorMessage: message,
      };
    }
    throw error;
  }
}
