/**
 * Shared booking business rules for GK.Drobe.
 * Pure date/range logic lives here so storefront, app proxy, admin, and webhooks
 * all enforce the same rules.
 */

export const LEAD_TIME_DAYS = 4;

export const HIRE_DURATIONS = [4, 8] as const;
export type HireDurationDays = (typeof HIRE_DURATIONS)[number];

export const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"] as const;
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
};

export type BlockedDateRecord = {
  date: Date;
  productId?: string | null;
  variantId?: string | null;
  reason?: string | null;
};

export type AvailabilityInput = {
  productId: string;
  variantId: string;
  deliveryDate: Date;
  durationDays: HireDurationDays;
  today?: Date;
  bookings: BookingRecord[];
  blockedDates: BlockedDateRecord[];
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
  if (!HIRE_DURATIONS.includes(durationDays)) {
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

export function isActiveBooking(status: string): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status as ActiveBookingStatus);
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

/**
 * ASSUMPTION: one physical garment per product+size (binary availability).
 * To support multiple units of the same size, replace this with a count-based
 * overlap check against inventory quantity instead of any-overlap => unavailable.
 */
export function isProductVariantAvailable(input: AvailabilityInput): AvailabilityResult {
  const deliveryDate = toDateOnly(input.deliveryDate);
  const returnDate = computeReturnDate(deliveryDate, input.durationDays);
  const requestedRange: DateRange = { start: deliveryDate, end: returnDate };

  if (!meetsLeadTime(deliveryDate, input.today)) {
    return {
      available: false,
      deliveryDate,
      returnDate,
      reason: `Delivery must be at least ${LEAD_TIME_DAYS} days from today`,
    };
  }

  for (const booking of input.bookings) {
    if (!isActiveBooking(booking.status)) {
      continue;
    }

    const bookingRange: DateRange = {
      start: booking.startDate,
      end: booking.endDate,
    };

    if (dateRangesOverlap(requestedRange, bookingRange)) {
      return {
        available: false,
        deliveryDate,
        returnDate,
        reason: "This size is already booked for overlapping dates",
      };
    }
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

    const blockedDay = toDateOnly(blocked.date);
    if (
      blockedDay.getTime() >= requestedRange.start.getTime() &&
      blockedDay.getTime() <= requestedRange.end.getTime()
    ) {
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
