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

export type RentalCalendarEvent = {
  id: string;
  type: "booking" | "block";
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

function extractNumericId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

function toProductGid(productId: string): string {
  return productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;
}

function statusColor(status: string, type: "booking" | "block"): string {
  if (type === "block") {
    return "#b98900";
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

  const [bookings, blockedDates, bufferConfig, holidays] = await Promise.all([
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
    getShopBufferConfig(shop),
    getHolidayDates(shop),
  ]);

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
        bufferBeforeUnit: booking.bufferBeforeUnit,
        bufferAfterDays: booking.bufferAfterDays,
        bufferAfterUnit: booking.bufferAfterUnit,
      },
      bufferConfig,
      holidays,
    );
    const buffers = resolveBookingBuffers(
      parseDeliveryMethod(booking.deliveryMethod),
      bufferConfig,
      booking,
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
