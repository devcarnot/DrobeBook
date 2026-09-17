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

const PAGE_SIZE = 20;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDayUtc(iso: string): Date {
  return toDateOnly(new Date(`${iso}T12:00:00.000Z`));
}

function endOfDayUtc(iso: string): Date {
  const date = startOfDayUtc(iso);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function resolveDatePresetRange(
  preset: RentalDatePreset,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const today = toDateOnly(now);

  if (preset === "custom" && customFrom && customTo) {
    return {
      from: startOfDayUtc(customFrom),
      to: endOfDayUtc(customTo),
      label: `${customFrom} – ${customTo}`,
    };
  }

  switch (preset) {
    case "today":
      return { from: startOfDayUtc(isoDate(today)), to: endOfDayUtc(isoDate(today)), label: "Today" };
    case "yesterday": {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      const iso = isoDate(y);
      return { from: startOfDayUtc(iso), to: endOfDayUtc(iso), label: "Yesterday" };
    }
    case "last7": {
      const from = new Date(today);
      from.setUTCDate(from.getUTCDate() - 6);
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "Last 7 days",
      };
    }
    case "thisMonth": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "This month to date",
      };
    }
    case "lastMonth": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(to)),
        label: "Last month",
      };
    }
    case "last6Months": {
      const from = new Date(today);
      from.setUTCMonth(from.getUTCMonth() - 6);
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "Last 6 months",
      };
    }
    case "last3Months":
    default: {
      const from = new Date(today);
      from.setUTCMonth(from.getUTCMonth() - 3);
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "Last 3 months",
      };
    }
  }
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

  const dateField = filters.dateField ?? "dateCreated";
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
