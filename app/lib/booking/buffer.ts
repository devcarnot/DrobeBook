import {
  addDays,
  DEFAULT_TIMEZONE,
  formatDateIso,
  toDateOnly,
  type DateRange,
} from "./availability";
import type {
  BookingBufferOverride,
  BufferConfig,
  BufferDayUnit,
  DeliveryBufferDefaults,
  DeliveryMethod,
} from "./buffer-config";
import {
  getBufferDefaultsForMethod,
  resolveBookingBuffers,
} from "./buffer-config";

export type { BufferDayUnit, DeliveryMethod };

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isHoliday(date: Date, holidays: ReadonlySet<string>): boolean {
  return holidays.has(formatDateIso(date));
}

export function isBusinessDay(date: Date, holidays: ReadonlySet<string>): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/**
 * Move forward/backward by N calendar or business days.
 * Business days skip weekends and supplied holiday ISO dates.
 */
export function addDaysByUnit(
  date: Date,
  days: number,
  unit: BufferDayUnit,
  holidays: ReadonlySet<string>,
): Date {
  if (days === 0) {
    return toDateOnly(date);
  }

  if (unit === "calendar") {
    return addDays(date, days);
  }

  let result = toDateOnly(date);
  let remaining = Math.abs(days);
  const step = days > 0 ? 1 : -1;

  while (remaining > 0) {
    result = addDays(result, step);
    if (isBusinessDay(result, holidays)) {
      remaining -= 1;
    }
  }

  return result;
}

function parseCutOffMinutes(cutOffTime: string): number {
  const [hour, minute] = cutOffTime.split(":").map((part) => Number.parseInt(part, 10));
  return hour * 60 + minute;
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function toDateOnlyFromParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Earliest selectable delivery date for a delivery method, honouring cut-off time
 * and "blocked days from current date".
 */
export function getEarliestDeliveryDate(
  settings: DeliveryBufferDefaults,
  now: Date = new Date(),
  holidays: ReadonlySet<string> = new Set(),
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const parts = getZonedParts(now, timeZone);
  let anchor = toDateOnlyFromParts(parts.year, parts.month, parts.day);
  const nowMinutes = parts.hour * 60 + parts.minute;

  if (nowMinutes >= parseCutOffMinutes(settings.cutOffTime)) {
    anchor = addDays(anchor, 1);
  }

  if (settings.blockedDaysFromToday === 0) {
    return anchor;
  }

  return addDaysByUnit(
    anchor,
    settings.blockedDaysFromToday,
    settings.blockedDaysUnit,
    holidays,
  );
}

export function meetsDeliveryLeadTime(
  deliveryDate: Date,
  deliveryMethod: DeliveryMethod,
  bufferConfig: BufferConfig,
  now: Date = new Date(),
  holidays: ReadonlySet<string> = new Set(),
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const settings = getBufferDefaultsForMethod(bufferConfig, deliveryMethod);
  const earliest = getEarliestDeliveryDate(settings, now, holidays, timeZone);
  return toDateOnly(deliveryDate).getTime() >= earliest.getTime();
}

export function computeEffectiveBlockRange(
  rentalStart: Date,
  rentalEnd: Date,
  bufferBeforeDays: number,
  bufferBeforeUnit: BufferDayUnit,
  bufferAfterDays: number,
  bufferAfterUnit: BufferDayUnit,
  holidays: ReadonlySet<string>,
): DateRange {
  return {
    start:
      bufferBeforeDays > 0
        ? addDaysByUnit(rentalStart, -bufferBeforeDays, bufferBeforeUnit, holidays)
        : toDateOnly(rentalStart),
    end:
      bufferAfterDays > 0
        ? addDaysByUnit(rentalEnd, bufferAfterDays, bufferAfterUnit, holidays)
        : toDateOnly(rentalEnd),
  };
}

export type BufferedBookingInput = {
  startDate: Date;
  endDate: Date;
  deliveryMethod?: string | null;
} & Partial<BookingBufferOverride>;

export function effectiveRangeForBooking(
  booking: BufferedBookingInput,
  bufferConfig: BufferConfig,
  holidays: ReadonlySet<string>,
): DateRange {
  const method: DeliveryMethod =
    booking.deliveryMethod === "pickup" ? "pickup" : "post";
  const buffers = resolveBookingBuffers(method, bufferConfig, booking);

  return computeEffectiveBlockRange(
    booking.startDate,
    booking.endDate,
    buffers.bufferBeforeDays,
    buffers.bufferBeforeUnit,
    buffers.bufferAfterDays,
    buffers.bufferAfterUnit,
    holidays,
  );
}

export function effectiveRangeForRequest(
  deliveryDate: Date,
  returnDate: Date,
  deliveryMethod: DeliveryMethod,
  bufferConfig: BufferConfig,
  holidays: ReadonlySet<string>,
): DateRange {
  const buffers = resolveBookingBuffers(deliveryMethod, bufferConfig);
  return computeEffectiveBlockRange(
    deliveryDate,
    returnDate,
    buffers.bufferBeforeDays,
    buffers.bufferBeforeUnit,
    buffers.bufferAfterDays,
    buffers.bufferAfterUnit,
    holidays,
  );
}

export function formatDisplayDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function previewBufferDates(input: {
  rentalStart: string;
  rentalEnd: string;
  deliveryMethod: DeliveryMethod;
  bufferConfig: BufferConfig;
  holidays: ReadonlySet<string>;
  override?: Partial<BookingBufferOverride> | null;
}): {
  startBufferDate: string;
  endBufferDate: string;
} {
  const method = input.deliveryMethod;
  const buffers = resolveBookingBuffers(method, input.bufferConfig, input.override);
  const rentalStart = toDateOnly(new Date(`${input.rentalStart}T12:00:00.000Z`));
  const rentalEnd = toDateOnly(new Date(`${input.rentalEnd}T12:00:00.000Z`));
  const range = computeEffectiveBlockRange(
    rentalStart,
    rentalEnd,
    buffers.bufferBeforeDays,
    buffers.bufferBeforeUnit,
    buffers.bufferAfterDays,
    buffers.bufferAfterUnit,
    input.holidays,
  );

  return {
    startBufferDate: formatDateIso(range.start),
    endBufferDate: formatDateIso(range.end),
  };
}
