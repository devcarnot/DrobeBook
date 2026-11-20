import type { Prisma } from "@prisma/client";
import { Prisma as PrismaClient } from "@prisma/client";

import prisma from "../../db.server";
import { toDateOnly } from "../booking/availability";
import {
  recordGarmentHire,
  reverseGarmentHire,
} from "../garment/garment-stats.server";
import {
  bookingToNotificationContext,
  sendRentalNotification,
} from "../notifications/notification.server";
import { notifyNextWaitlistForGarment } from "../waitlist/waitlist-notify.server";
import {
  createShopifyOrderForRental,
  resolveShopifyCustomer,
  validateShopifyOrderRequirements,
} from "./rental-shopify.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
import type {
  DeliveryAddress,
  RentalDateField,
  RentalDatePreset,
  RentalListFilters,
  RentalListItem,
  RentalListSort,
  RentalWorkflowStatus,
  ShopifyOrderMode,
} from "./rental.types";
import { parseTags, serializeTags } from "./rental.types";
import { resolveDatePresetRange, startOfDayUtc } from "./date-range";

export { resolveDatePresetRange };

const PAGE_SIZE = 20;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateFieldColumn(field: RentalDateField): "createdAt" | "startDate" | "endDate" {
  if (field === "rentalStart") {
    return "startDate";
  }
  if (field === "rentalEnd") {
    return "endDate";
  }
  return "createdAt";
}

function sortOrderBy(sort: RentalListSort): Prisma.BookingOrderByWithRelationInput {
  switch (sort) {
    case "dateCreated_asc":
      return { createdAt: "asc" };
    case "rentalStart_desc":
      return { startDate: "desc" };
    case "rentalStart_asc":
      return { startDate: "asc" };
    case "rentalEnd_desc":
      return { endDate: "desc" };
    case "rentalEnd_asc":
      return { endDate: "asc" };
    case "dateCreated_desc":
    default:
      return { createdAt: "desc" };
  }
}

function mapBooking(booking: {
  id: string;
  status: string;
  workflowStatus: string;
  customerName: string | null;
  customerEmail: string | null;
  productTitle: string | null;
  productId: string;
  variantId: string;
  size: string;
  deliveryMethod: string;
  startDate: Date;
  endDate: Date;
  eventDate: Date;
  orderId: string | null;
  pricePaid: Prisma.Decimal | null;
  bufferBeforeDays: number | null;
  bufferAfterDays: number | null;
  createdAt: Date;
  tags: string | null;
}): RentalListItem {
  return {
    id: booking.id,
    workflowStatus: booking.workflowStatus as RentalWorkflowStatus,
    status: booking.status,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    productTitle: booking.productTitle,
    productId: booking.productId,
    variantId: booking.variantId,
    size: booking.size,
    deliveryMethod: booking.deliveryMethod,
    rentalStart: isoDate(booking.startDate),
    rentalEnd: isoDate(booking.endDate),
    eventDate: isoDate(booking.eventDate),
    orderId: booking.orderId,
    pricePaid: booking.pricePaid?.toString() ?? null,
    bufferBeforeDays: booking.bufferBeforeDays,
    bufferAfterDays: booking.bufferAfterDays,
    createdAt: booking.createdAt.toISOString(),
    tags: parseTags(booking.tags),
  };
}

function buildWhere(shop: string, filters: RentalListFilters): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = { shop };

  if (filters.workflowStatus && filters.workflowStatus !== "all") {
    where.workflowStatus = filters.workflowStatus;
  }

  if (filters.deliveryMethod) {
    where.deliveryMethod = filters.deliveryMethod;
  }

  if (filters.productId) {
    where.productId = filters.productId;
  }

  if (filters.customerEmail) {
    where.customerEmail = { contains: filters.customerEmail };
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { id: { contains: search } },
      { customerName: { contains: search } },
      { customerEmail: { contains: search } },
      { productTitle: { contains: search } },
      { orderId: { contains: search } },
      { size: { contains: search } },
    ];
  }

  const dateField = filters.dateField ?? "dateCreated";
  const preset = filters.datePreset ?? "last3Months";
  const range = resolveDatePresetRange(preset, filters.dateFrom, filters.dateTo);
  const column = dateFieldColumn(dateField);

  where[column] = {
    gte: range.from,
    lte: range.to,
  };

  return where;
}

export async function listRentals(shop: string, filters: RentalListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const sort = filters.sort ?? "dateCreated_desc";
  const where = buildWhere(shop, filters);

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: sortOrderBy(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const preset = filters.datePreset ?? "last3Months";
  const dateRange = resolveDatePresetRange(
    preset,
    filters.dateFrom,
    filters.dateTo,
  );

  return {
    rentals: bookings.map(mapBooking),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    dateRangeLabel: dateRange.label,
    dateRangeFrom: isoDate(dateRange.from),
    dateRangeTo: isoDate(dateRange.to),
  };
}

export async function getRentalFilterOptions(shop: string) {
  const bookings = await prisma.booking.findMany({
    where: { shop },
    select: {
      productId: true,
      productTitle: true,
      customerEmail: true,
      customerName: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const productMap = new Map<string, string>();
  for (const booking of bookings) {
    if (!productMap.has(booking.productId)) {
      productMap.set(booking.productId, booking.productTitle ?? booking.productId);
    }
  }

  const customerMap = new Map<string, string | null>();
  for (const booking of bookings) {
    if (booking.customerEmail && !customerMap.has(booking.customerEmail)) {
      customerMap.set(booking.customerEmail, booking.customerName);
    }
  }

  return {
    products: [...productMap.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    customers: [...customerMap.entries()]
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}

export type CreateRentalInput = {
  shopifyOrderMode: ShopifyOrderMode;
  shopifyCustomerId?: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerName: string;
  customerEmail: string;
  productId: string;
  variantId: string;
  productTitle: string;
  size: string;
  deliveryMethod: string;
  rentalStart: string;
  rentalEnd: string;
  eventDate: string;
  bufferBeforeDays: number;
  bufferBeforeUnit: string;
  bufferAfterDays: number;
  bufferAfterUnit: string;
  workflowStatus: RentalWorkflowStatus;
  rentalNotes: string;
  fulfillmentTrackingNumber: string;
  fulfillmentTrackingLink: string;
  returnTrackingNumber: string;
  returnTrackingLink: string;
  tags: string[];
  deliveryAddress: DeliveryAddress;
  pricePaid?: string;
};

export async function createRental(
  shop: string,
  input: CreateRentalInput,
  admin?: AdminGraphqlClient,
) {
  validateShopifyOrderRequirements(input);

  const availabilityStatus =
    input.workflowStatus === "cancelled" ? "cancelled" : "confirmed";

  let pricePaid = input.pricePaid
    ? new PrismaClient.Decimal(input.pricePaid)
    : null;

  const booking = await prisma.booking.create({
    data: {
      shop,
      productId: input.productId,
      variantId: input.variantId,
      productTitle: input.productTitle,
      size: input.size,
      startDate: startOfDayUtc(input.rentalStart),
      endDate: startOfDayUtc(input.rentalEnd),
      eventDate: startOfDayUtc(input.eventDate || input.rentalEnd),
      deliveryMethod: input.deliveryMethod,
      status: availabilityStatus,
      workflowStatus: input.workflowStatus,
      customerName: input.customerName || null,
      customerEmail: input.customerEmail || null,
      rentalNotes: input.rentalNotes || null,
      fulfillmentTrackingNumber: input.fulfillmentTrackingNumber || null,
      fulfillmentTrackingLink: input.fulfillmentTrackingLink || null,
      returnTrackingNumber: input.returnTrackingNumber || null,
      returnTrackingLink: input.returnTrackingLink || null,
      tags: serializeTags(input.tags),
      shopifyOrderMode: input.shopifyOrderMode,
      deliveryAddressJson: JSON.stringify(input.deliveryAddress),
      bufferBeforeDays: input.bufferBeforeDays,
      bufferBeforeUnit: input.bufferBeforeUnit,
      bufferAfterDays: input.bufferAfterDays,
      bufferAfterUnit: input.bufferAfterUnit,
      pricePaid,
    },
  });

  if (admin && (input.customerEmail?.trim() || input.shopifyCustomerId)) {
    const customer = await resolveShopifyCustomer(admin, {
      shopifyCustomerId: input.shopifyCustomerId,
      email: input.customerEmail,
      name: input.customerName,
      firstName: input.customerFirstName,
      lastName: input.customerLastName,
    });

    if (input.shopifyOrderMode !== "none") {
      const orderResult = await createShopifyOrderForRental(
        admin,
        shop,
        booking.id,
        input,
        customer,
      );

      pricePaid = orderResult.pricePaid ?? pricePaid;

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          orderId: orderResult.orderId,
          pricePaid,
        },
      });
    }
  }

  if (availabilityStatus === "confirmed") {
    await recordGarmentHire(
      shop,
      input.productId,
      input.variantId,
      pricePaid,
    );
  }

  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
  });

  void sendRentalNotification(shop, bookingToNotificationContext(updated), {
    trigger: "on_create",
  }).catch(() => undefined);

  return mapBooking(updated);
}

export async function updateRentalWorkflowStatus(
  shop: string,
  rentalId: string,
  workflowStatus: RentalWorkflowStatus,
) {
  const existing = await prisma.booking.findFirst({
    where: { id: rentalId, shop },
  });

  if (!existing) {
    throw new Error("Rental not found");
  }

  const status =
    workflowStatus === "cancelled" ? "cancelled" : "confirmed";

  const booking = await prisma.booking.update({
    where: { id: rentalId },
    data: { workflowStatus, status },
  });

  void sendRentalNotification(shop, bookingToNotificationContext(booking), {
    trigger: "on_status_change",
    workflowStatus,
  }).catch(() => undefined);

  if (
    workflowStatus === "cancelled" &&
    existing.status === "confirmed"
  ) {
    await reverseGarmentHire(
      shop,
      existing.productId,
      existing.variantId,
      existing.pricePaid,
    );
    await notifyNextWaitlistForGarment(
      shop,
      existing.productId,
      existing.variantId,
    );
  }

  return mapBooking(booking);
}

export function rentalsToCsv(rentals: RentalListItem[]): string {
  const headers = [
    "ID",
    "Status",
    "Customer name",
    "Customer email",
    "Product",
    "Size",
    "Delivery",
    "Rental start",
    "Rental end",
    "Event date",
    "Order ID",
    "Price paid",
    "Created",
  ];

  const rows = rentals.map((rental) => [
    rental.id,
    rental.workflowStatus,
    rental.customerName ?? "",
    rental.customerEmail ?? "",
    rental.productTitle ?? rental.productId,
    rental.size,
    rental.deliveryMethod,
    rental.rentalStart,
    rental.rentalEnd,
    rental.eventDate,
    rental.orderId ?? "",
    rental.pricePaid ?? "",
    rental.createdAt,
  ]);

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  return [headers, ...rows]
    .map((row) => row.map((cell) => escape(String(cell))).join(","))
    .join("\n");
}

export async function exportRentalsCsv(shop: string, filters: RentalListFilters) {
  const where = buildWhere(shop, filters);
  const bookings = await prisma.booking.findMany({
    where,
    orderBy: sortOrderBy(filters.sort ?? "dateCreated_desc"),
    take: 5000,
  });

  return rentalsToCsv(bookings.map(mapBooking));
}

export async function updateRentalPickupCollectionWindow(
  shop: string,
  rentalId: string,
  pickupCollectionWindow: string,
) {
  const existing = await prisma.booking.findFirst({
    where: { id: rentalId, shop },
  });

  if (!existing) {
    return { ok: false as const, error: "Rental not found" };
  }

  if (existing.deliveryMethod !== "pickup" && existing.deliveryMethod !== "local") {
    return {
      ok: false as const,
      error: "Collection window applies to studio pickup hires only.",
    };
  }

  const value = pickupCollectionWindow.trim();
  await prisma.booking.update({
    where: { id: rentalId },
    data: { pickupCollectionWindow: value || null },
  });

  return { ok: true as const };
}

export async function getRentalById(shop: string, rentalId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: rentalId, shop },
  });

  if (!booking) {
    return null;
  }

  return {
    ...mapBooking(booking),
    rentalNotes: booking.rentalNotes,
    fulfillmentTrackingNumber: booking.fulfillmentTrackingNumber,
    fulfillmentTrackingLink: booking.fulfillmentTrackingLink,
    returnTrackingNumber: booking.returnTrackingNumber,
    returnTrackingLink: booking.returnTrackingLink,
    shopifyOrderMode: booking.shopifyOrderMode as ShopifyOrderMode,
    deliveryAddress: booking.deliveryAddressJson
      ? (JSON.parse(booking.deliveryAddressJson) as DeliveryAddress)
      : null,
    bufferBeforeUnit: booking.bufferBeforeUnit,
    bufferAfterUnit: booking.bufferAfterUnit,
    pickupCollectionWindow: booking.pickupCollectionWindow,
  };
}

export async function listImportedProductsForRental(shop: string) {
  return prisma.rentalProduct.findMany({
    where: { shop, removedAt: null },
    include: { variants: true },
    orderBy: { title: "asc" },
    take: 200,
  });
}
