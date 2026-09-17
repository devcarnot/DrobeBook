import type { BufferDayUnit } from "./buffer-config";
import type { BufferConfig, DeliveryMethod } from "./buffer-config";
import {
  effectiveRangeForBooking,
  effectiveRangeForRequest,
  meetsDeliveryLeadTime,
} from "./buffer";

export const LEAD_TIME_DAYS = 4;

export const HIRE_DURATIONS = [4, 8] as const;
export type HireDurationDays = number;

/** Bookings that still occupy inventory on the storefront calendar. */
export const AVAILABILITY_BLOCKING_STATUSES = ["confirmed"] as const;
export type AvailabilityBlockingStatus =
  (typeof AVAILABILITY_BLOCKING_STATUSES)[number];

/** Bookings shown in admin lists/calendars. */
export const ACTIVE_BOOKING_STATUSES = ["confirmed"] as const;
export type ActiveBookingStatus = (typeof ACTIVE_BOOKING_STATUSES)[number];

export const DEFAULT_TIMEZONE = "Australia/Brisbane";

export type DateRange = {
  start: Date;
  end: Date;
};

export type BookingRecord = {
  startDate: Date;
  endDate: Date;
  status: string;
  deliveryMethod?: string | null;
  bufferBeforeDays?: number | null;
  bufferBeforeUnit?: BufferDayUnit | null;
  bufferAfterDays?: number | null;
  bufferAfterUnit?: BufferDayUnit | null;
};

export type BlockedDateRecord = {
  startDate: Date;
  endDate: Date;
  productId?: string | null;
  variantId?: string | null;
  reason?: string | null;
};

export type AvailabilityInput = {
  productId: string;
  variantId: string;
  deliveryDate: Date;
  durationDays: HireDurationDays;
  deliveryMethod?: DeliveryMethod;
  today?: Date;
  now?: Date;
  bufferConfig?: BufferConfig;
  holidays?: ReadonlySet<string>;
  bookings: BookingRecord[];
  blockedDates: BlockedDateRecord[];
  /** Shopify inventory for this variant; defaults to 1 when unknown. */
  inventoryQuantity?: number;
};

export type AvailabilityResult = {
  available: boolean;
  deliveryDate: Date;
  returnDate: Date;
  reason?: string;
};

/**
 * Normalize to UTC midnight so comparisons ignore time-of-day.
 */
export function toDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addDays(date: Date, days: number): Date {
  const result = toDateOnly(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function computeReturnDate(
  deliveryDate: Date,
  durationDays: HireDurationDays,
): Date {
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 90) {
    throw new Error(`Unsupported hire duration: ${durationDays}`);
  }

  return addDays(deliveryDate, durationDays - 1);
}

export function meetsLeadTime(
  deliveryDate: Date,
  today: Date = new Date(),
): boolean {
  const earliestDelivery = addDays(toDateOnly(today), LEAD_TIME_DAYS);
  return toDateOnly(deliveryDate).getTime() >= earliestDelivery.getTime();
}

/**
 * Inclusive overlap check on date-only ranges.
 */
export function dateRangesOverlap(
  rangeA: DateRange,
  rangeB: DateRange,
): boolean {
  const aStart = toDateOnly(rangeA.start).getTime();
  const aEnd = toDateOnly(rangeA.end).getTime();
  const bStart = toDateOnly(rangeB.start).getTime();
  const bEnd = toDateOnly(rangeB.end).getTime();

  return aStart <= bEnd && bStart <= aEnd;
}

export function blocksAvailability(status: string): boolean {
  return AVAILABILITY_BLOCKING_STATUSES.includes(
    status as AvailabilityBlockingStatus,
  );
}

function blockedDateAppliesToVariant(
  blocked: BlockedDateRecord,
  productId: string,
  variantId: string,
): boolean {
  const productMatches =
    blocked.productId == null || blocked.productId === productId;
  const variantMatches =
    blocked.variantId == null || blocked.variantId === variantId;

  return productMatches && variantMatches;
}

function countOverlappingBookings(
  bookings: BookingRecord[],
  requestedRange: DateRange,
  bufferConfig: BufferConfig | undefined,
  holidays: ReadonlySet<string>,
): number {
  let count = 0;

  for (const booking of bookings) {
    if (!blocksAvailability(booking.status)) {
      continue;
    }

    const bookingRange =
      bufferConfig != null
        ? effectiveRangeForBooking(booking, bufferConfig, holidays)
        : {
            start: toDateOnly(booking.startDate),
            end: toDateOnly(booking.endDate),
          };

    if (dateRangesOverlap(requestedRange, bookingRange)) {
      count += 1;
    }
  }

  return count;
}

export function isProductVariantAvailable(input: AvailabilityInput): AvailabilityResult {
  const deliveryDate = toDateOnly(input.deliveryDate);
  const returnDate = computeReturnDate(deliveryDate, input.durationDays);
  const holidays = input.holidays ?? new Set<string>();
  const now = input.now ?? input.today ?? new Date();
  const deliveryMethod: DeliveryMethod =
    input.deliveryMethod === "pickup" ? "pickup" : "post";

  const requestedRange =
    input.bufferConfig != null
      ? effectiveRangeForRequest(
          deliveryDate,
          returnDate,
          deliveryMethod,
          input.bufferConfig,
          holidays,
        )
      : { start: deliveryDate, end: returnDate };

  const meetsLead =
    input.bufferConfig != null
      ? meetsDeliveryLeadTime(
          deliveryDate,
          deliveryMethod,
          input.bufferConfig,
          now,
          holidays,
        )
      : meetsLeadTime(deliveryDate, input.today);

  if (!meetsLead) {
    return {
      available: false,
      deliveryDate,
      returnDate,
      reason:
        input.bufferConfig != null
          ? "Delivery is too soon for the selected delivery method"
          : `Delivery must be at least ${LEAD_TIME_DAYS} days from today`,
    };
  }

  const inventoryCapacity = Math.max(1, input.inventoryQuantity ?? 1);
  const overlappingBookings = countOverlappingBookings(
    input.bookings,
    requestedRange,
    input.bufferConfig,
    holidays,
  );

  if (overlappingBookings >= inventoryCapacity) {
    return {
      available: false,
      deliveryDate,
      returnDate,
      reason:
        inventoryCapacity === 1
          ? "This hire option is already booked for overlapping dates"
          : "All available units are booked for overlapping dates",
    };
  }

  for (const blocked of input.blockedDates) {
    if (
      !blockedDateAppliesToVariant(
        blocked,
        input.productId,
        input.variantId,
      )
    ) {
      continue;
    }

    const blockedRange: DateRange = {
      start: blocked.startDate,
      end: blocked.endDate,
    };

    if (dateRangesOverlap(requestedRange, blockedRange)) {
      return {
        available: false,
        deliveryDate,
        returnDate,
        reason: blocked.reason ?? "This size is unavailable on blocked dates",
      };
    }
  }

  return {
    available: true,
    deliveryDate,
    returnDate,
  };
}

export function formatDateIso(date: Date): string {
  return toDateOnly(date).toISOString().slice(0, 10);
}
