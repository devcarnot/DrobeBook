import prisma from "../../db.server";
import {
  effectiveRangeForBooking,
} from "./buffer";
import {
  getHolidayDates,
  getShopBufferConfig,
} from "./buffer.server";
import {
  parseDeliveryMethod,
  resolveBookingBuffers,
} from "./buffer-config";
import { parseBufferDayUnit } from "./availability.server";
import {
  layoutCalendarBars,
  monthLabel,
  shiftMonth,
} from "./rental-calendar";

export type RentalCalendarFilters = {
  status?: string | null;
  deliveryMethod?: string | null;
  search?: string | null;
};

export type RentalCalendarEventType =
  | "booking"
  | "block"
  | "appointment"
  | "appointment_hold";

export type RentalCalendarEvent = {
  id: string;
  type: RentalCalendarEventType;
  label: string;
  sublabel: string;
  startDate: string;
  endDate: string;
  displayStartDate: string;
  displayEndDate: string;
  status: string;
  deliveryMethod: string | null;
  orderId: string | null;
  reason: string | null;
  productId: string | null;
  variantId: string | null;
  size: string | null;
  imageUrl: string | null;
  color: string;
  bufferBeforeDays: number;
  bufferAfterDays: number;
  appointmentTime: string | null;
  durationMinutes: number | null;
  changeRoomId: string | null;
  itemsToTryOn: string | null;
  customerName: string | null;
};

export type RentalCalendarPayload = {
  year: number;
  month: number;
  monthLabel: string;
  prev: { year: number; month: number };
  next: { year: number; month: number };
  events: RentalCalendarEvent[];
  weeks: ReturnType<typeof layoutCalendarBars>["weeks"];
  segments: ReturnType<typeof layoutCalendarBars<RentalCalendarEvent>>["segments"];
  laneCountByWeek: Record<number, number>;
};

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const PRODUCT_TITLES_QUERY = `#graphql
  query RentalCalendarProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredImage {
          url
        }
      }
    }
  }
`;

const ORDER_DETAILS_QUERY = `#graphql
  query RentalCalendarOrders($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        legacyResourceId
        name
        customer {
          displayName
        }
        lineItems(first: 25) {
          nodes {
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

const TRY_ON_APPOINTMENT_COLOR = "#e67700";
const TRY_ON_HOLD_COLOR = "#f4a261";

function extractNumericId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

function toProductGid(productId: string): string {
  return productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;
}

function statusColor(
  status: string,
  type: RentalCalendarEventType,
): string {
  if (type === "block") {
    return "#b98900";
  }
  if (type === "appointment") {
    return TRY_ON_APPOINTMENT_COLOR;
  }
  if (type === "appointment_hold") {
    return TRY_ON_HOLD_COLOR;
  }
  if (status === "confirmed") {
    return "#008060";
  }
  if (status === "pending") {
    return "#449da7";
  }
  if (status === "cancelled") {
    return "#c9cccf";
  }
  return "#8051ff";
}

function formatAppointmentTime(time: string): string {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number.parseInt(hoursRaw ?? "0", 10) || 0;
  const minutes = Number.parseInt(minutesRaw ?? "0", 10) || 0;
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minuteText = minutes ? `:${String(minutes).padStart(2, "0")}` : "";
  return `${hour12}${minuteText} ${period}`;
}

function formatChangeRoomLabel(changeRoomId: string | null): string | null {
  if (!changeRoomId) {
    return null;
  }

  const match = changeRoomId.match(/^room-(\d+)$/i);
  if (match) {
    return `Change room ${match[1]}`;
  }

  return changeRoomId;
}

function toOrderGid(orderId: string): string {
  return orderId.startsWith("gid://")
    ? orderId
    : `gid://shopify/Order/${orderId}`;
}

type OrderCalendarMeta = {
  customerName: string | null;
  itemsToTryOn: string | null;
  orderName: string | null;
};

async function fetchOrderMeta(
  admin: AdminGraphqlClient,
  orderIds: string[],
): Promise<Map<string, OrderCalendarMeta>> {
  const map = new Map<string, OrderCalendarMeta>();
  if (orderIds.length === 0) {
    return map;
  }

  const uniqueIds = [...new Set(orderIds)];
  const response = await admin.graphql(ORDER_DETAILS_QUERY, {
    variables: { ids: uniqueIds.map((id) => toOrderGid(id)) },
  });
  const json = (await response.json()) as {
    data?: {
      nodes?: Array<{
        legacyResourceId?: string;
        name?: string;
        customer?: { displayName?: string | null } | null;
        lineItems?: {
          nodes?: Array<{
            customAttributes?: Array<{ key?: string; value?: string }>;
          }>;
        };
      } | null>;
    };
  };

  for (const node of json.data?.nodes ?? []) {
    if (!node?.legacyResourceId) {
      continue;
    }

    let itemsToTryOn: string | null = null;
    for (const lineItem of node.lineItems?.nodes ?? []) {
      for (const attribute of lineItem.customAttributes ?? []) {
        if (attribute.key?.toLowerCase() === "items to try on") {
          const value = attribute.value?.trim();
          if (value && value !== "—") {
            itemsToTryOn = value;
            break;
          }
        }
      }
      if (itemsToTryOn) {
        break;
      }
    }

    map.set(node.legacyResourceId, {
      customerName: node.customer?.displayName?.trim() || null,
      itemsToTryOn,
      orderName: node.name ?? null,
    });
  }

  return map;
}

async function fetchProductMeta(
  admin: AdminGraphqlClient,
  productIds: string[],
): Promise<Map<string, { title: string; imageUrl: string | null }>> {
  const map = new Map<string, { title: string; imageUrl: string | null }>();
  if (productIds.length === 0) {
    return map;
  }

  const uniqueIds = [...new Set(productIds)];
  const response = await admin.graphql(PRODUCT_TITLES_QUERY, {
    variables: { ids: uniqueIds.map((id) => toProductGid(id)) },
  });
  const json = (await response.json()) as {
    data?: {
      nodes?: Array<{
        id?: string;
        title?: string;
        featuredImage?: { url?: string } | null;
      } | null>;
    };
  };

  for (const node of json.data?.nodes ?? []) {
    if (!node?.id) {
      continue;
    }
    map.set(extractNumericId(node.id), {
      title: node.title ?? "Unknown product",
      imageUrl: node.featuredImage?.url ?? null,
    });
  }

  return map;
}

function matchesSearch(
  event: RentalCalendarEvent,
  search: string | null,
): boolean {
  if (!search) {
    return true;
  }
  const haystack = [
    event.label,
    event.sublabel,
    event.size,
    event.reason,
    event.orderId,
    event.customerName,
    event.itemsToTryOn,
    event.appointmentTime,
    event.changeRoomId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export async function getRentalCalendar(
  admin: AdminGraphqlClient,
  shop: string,
  year: number,
  month: number,
  filters: RentalCalendarFilters = {},
): Promise<RentalCalendarPayload> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const holdsAvailable =
    typeof (prisma as { appointmentHold?: unknown }).appointmentHold !==
    "undefined";

  const [bookings, blockedDates, appointments, appointmentHolds, bufferConfig, holidays] =
    await Promise.all([
      prisma.booking.findMany({
        where: {
          shop,
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.deliveryMethod
            ? { deliveryMethod: filters.deliveryMethod }
            : {}),
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        orderBy: { startDate: "asc" },
      }),
      prisma.blockedDate.findMany({
        where: {
          shop,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        orderBy: { startDate: "asc" },
      }),
      prisma.appointmentBooking.findMany({
        where: {
          shop,
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      }),
      holdsAvailable
        ? prisma.appointmentHold.findMany({
            where: {
              shop,
              date: {
                gte: monthStart,
                lte: monthEnd,
              },
              expiresAt: { gt: new Date() },
            },
            orderBy: [{ date: "asc" }, { time: "asc" }],
          })
        : Promise.resolve([]),
      getShopBufferConfig(shop),
      getHolidayDates(shop),
    ]);

  const confirmedAppointmentIds = new Set(appointments.map((entry) => entry.id));
  const activeHolds = appointmentHolds.filter(
    (hold) => !confirmedAppointmentIds.has(hold.id),
  );

  const orderMeta = await fetchOrderMeta(
    admin,
    appointments
      .filter((appointment) => !appointment.orderId.startsWith("admin-"))
      .map((appointment) => appointment.orderId),
  );

  const productMeta = await fetchProductMeta(admin, [
    ...bookings.map((booking) => booking.productId),
    ...blockedDates
      .map((block) => block.productId)
      .filter((id): id is string => Boolean(id)),
  ]);

  const events: RentalCalendarEvent[] = [];

  for (const booking of bookings) {
    const startDate = booking.startDate.toISOString().slice(0, 10);
    const endDate = booking.endDate.toISOString().slice(0, 10);
    const effective = effectiveRangeForBooking(
      {
        startDate: booking.startDate,
        endDate: booking.endDate,
        deliveryMethod: booking.deliveryMethod,
        bufferBeforeDays: booking.bufferBeforeDays,
        bufferBeforeUnit: parseBufferDayUnit(booking.bufferBeforeUnit),
        bufferAfterDays: booking.bufferAfterDays,
        bufferAfterUnit: parseBufferDayUnit(booking.bufferAfterUnit),
      },
      bufferConfig,
      holidays,
    );
    const buffers = resolveBookingBuffers(
      parseDeliveryMethod(booking.deliveryMethod),
      bufferConfig,
      {
        bufferBeforeDays: booking.bufferBeforeDays,
        bufferBeforeUnit: parseBufferDayUnit(booking.bufferBeforeUnit),
        bufferAfterDays: booking.bufferAfterDays,
        bufferAfterUnit: parseBufferDayUnit(booking.bufferAfterUnit),
      },
    );
    const meta = productMeta.get(booking.productId);
    const label = meta?.title ?? `Product ${booking.productId}`;
    const sublabel = `Size ${booking.size}`;

    events.push({
      id: booking.id,
      type: "booking",
      label,
      sublabel,
      startDate,
      endDate,
      displayStartDate: effective.start.toISOString().slice(0, 10),
      displayEndDate: effective.end.toISOString().slice(0, 10),
      status: booking.status,
      deliveryMethod: booking.deliveryMethod,
      orderId: booking.orderId,
      reason: null,
      productId: booking.productId,
      variantId: booking.variantId,
      size: booking.size,
      imageUrl: meta?.imageUrl ?? null,
      color: statusColor(booking.status, "booking"),
      bufferBeforeDays: buffers.bufferBeforeDays,
      bufferAfterDays: buffers.bufferAfterDays,
      appointmentTime: null,
      durationMinutes: null,
      changeRoomId: null,
      itemsToTryOn: null,
      customerName: null,
    });
  }

  for (const appointment of appointments) {
    const dateIso = appointment.date.toISOString().slice(0, 10);
    const timeLabel = formatAppointmentTime(appointment.time);
    const order = appointment.orderId.startsWith("admin-")
      ? null
      : orderMeta.get(appointment.orderId);
    const customerName =
      appointment.customerName ?? order?.customerName ?? null;
    const itemsToTryOn =
      appointment.itemsToTryOn ?? order?.itemsToTryOn ?? null;
    const roomLabel = formatChangeRoomLabel(appointment.changeRoomId);
    const label = customerName ?? "Try-on appointment";
    const sublabelParts = [timeLabel, `${appointment.durationMinutes} min`];
    if (roomLabel) {
      sublabelParts.push(roomLabel);
    }
    if (itemsToTryOn) {
      sublabelParts.push(itemsToTryOn);
    }

    events.push({
      id: appointment.id,
      type: "appointment",
      label,
      sublabel: sublabelParts.join(" · "),
      startDate: dateIso,
      endDate: dateIso,
      displayStartDate: dateIso,
      displayEndDate: dateIso,
      status: "confirmed",
      deliveryMethod: null,
      orderId: appointment.orderId,
      reason: null,
      productId: null,
      variantId: null,
      size: null,
      imageUrl: null,
      color: statusColor("confirmed", "appointment"),
      bufferBeforeDays: 0,
      bufferAfterDays: 0,
      appointmentTime: appointment.time,
      durationMinutes: appointment.durationMinutes,
      changeRoomId: appointment.changeRoomId,
      itemsToTryOn,
      customerName,
    });
  }

  for (const hold of activeHolds) {
    const dateIso = hold.date.toISOString().slice(0, 10);
    const timeLabel = formatAppointmentTime(hold.time);
    const roomLabel = formatChangeRoomLabel(hold.changeRoomId);

    events.push({
      id: `hold-${hold.id}`,
      type: "appointment_hold",
      label: "Try-on hold",
      sublabel: [timeLabel, `${hold.durationMinutes} min`, roomLabel]
        .filter(Boolean)
        .join(" · "),
      startDate: dateIso,
      endDate: dateIso,
      displayStartDate: dateIso,
      displayEndDate: dateIso,
      status: "pending",
      deliveryMethod: null,
      orderId: null,
      reason: "Customer is checking out — hold expires in 15 minutes.",
      productId: null,
      variantId: null,
      size: null,
      imageUrl: null,
      color: statusColor("pending", "appointment_hold"),
      bufferBeforeDays: 0,
      bufferAfterDays: 0,
      appointmentTime: hold.time,
      durationMinutes: hold.durationMinutes,
      changeRoomId: hold.changeRoomId,
      itemsToTryOn: null,
      customerName: null,
    });
  }

  for (const block of blockedDates) {
    const startDate = block.startDate.toISOString().slice(0, 10);
    const endDate = block.endDate.toISOString().slice(0, 10);
    const isGarmentSpecific = Boolean(block.productId && block.variantId);
    const meta =
      block.productId != null ? productMeta.get(block.productId) : null;

    events.push({
      id: block.id,
      type: "block",
      label: isGarmentSpecific
        ? meta?.title ?? "Garment blocked"
        : "Shop-wide blackout",
      sublabel: block.reason ?? "Blocked dates",
      startDate,
      endDate,
      displayStartDate: startDate,
      displayEndDate: endDate,
      status: "blocked",
      deliveryMethod: null,
      orderId: null,
      reason: block.reason,
      productId: block.productId,
      variantId: block.variantId,
      size: null,
      imageUrl: meta?.imageUrl ?? null,
      color: statusColor("blocked", "block"),
      bufferBeforeDays: 0,
      bufferAfterDays: 0,
      appointmentTime: null,
      durationMinutes: null,
      changeRoomId: null,
      itemsToTryOn: null,
      customerName: null,
    });
  }

  const filtered = events.filter((event) => matchesSearch(event, filters.search ?? null));

  const { weeks, segments } = layoutCalendarBars(filtered, year, month);
  const laneCountByWeek: Record<number, number> = {};
  for (const segment of segments) {
    laneCountByWeek[segment.weekIndex] = Math.max(
      laneCountByWeek[segment.weekIndex] ?? 1,
      segment.lane + 1,
    );
  }

  return {
    year,
    month,
    monthLabel: monthLabel(year, month),
    prev: shiftMonth(year, month, -1),
    next: shiftMonth(year, month, 1),
    events: filtered,
    weeks,
    segments,
    laneCountByWeek,
  };
}

export { shiftMonth, monthLabel };
