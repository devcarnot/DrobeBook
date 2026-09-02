export type BufferDayUnit = "calendar" | "business";
export type DeliveryMethod = "post" | "pickup";

export type DeliveryBufferDefaults = {
  blockedDaysFromToday: number;
  blockedDaysUnit: BufferDayUnit;
  cutOffTime: string;
  bufferBeforeRental: number;
  bufferBeforeUnit: BufferDayUnit;
  bufferAfterRental: number;
  bufferAfterUnit: BufferDayUnit;
};

export type BufferConfig = {
  post: DeliveryBufferDefaults;
  pickup: DeliveryBufferDefaults;
};

/** Matches previous LEAD_TIME_DAYS=4 behaviour for post by default. */
export const DEFAULT_POST_BUFFER: DeliveryBufferDefaults = {
  blockedDaysFromToday: 4,
  blockedDaysUnit: "calendar",
  cutOffTime: "13:00",
  bufferBeforeRental: 0,
  bufferBeforeUnit: "calendar",
  bufferAfterRental: 2,
  bufferAfterUnit: "calendar",
};

export const DEFAULT_PICKUP_BUFFER: DeliveryBufferDefaults = {
  blockedDaysFromToday: 2,
  blockedDaysUnit: "calendar",
  cutOffTime: "17:00",
  bufferBeforeRental: 0,
  bufferBeforeUnit: "calendar",
  bufferAfterRental: 1,
  bufferAfterUnit: "calendar",
};

export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  post: { ...DEFAULT_POST_BUFFER },
  pickup: { ...DEFAULT_PICKUP_BUFFER },
};

function parseUnit(value: unknown, fallback: BufferDayUnit): BufferDayUnit {
  return value === "business" ? "business" : fallback;
}

function parseCount(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
}

function parseCutOff(value: unknown, fallback: string): string {
  const raw = String(value ?? fallback).trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function parseDeliveryDefaults(
  raw: Partial<DeliveryBufferDefaults> | undefined,
  fallback: DeliveryBufferDefaults,
): DeliveryBufferDefaults {
  return {
    blockedDaysFromToday: parseCount(
      raw?.blockedDaysFromToday,
      fallback.blockedDaysFromToday,
    ),
    blockedDaysUnit: parseUnit(raw?.blockedDaysUnit, fallback.blockedDaysUnit),
    cutOffTime: parseCutOff(raw?.cutOffTime, fallback.cutOffTime),
    bufferBeforeRental: parseCount(
      raw?.bufferBeforeRental,
      fallback.bufferBeforeRental,
    ),
    bufferBeforeUnit: parseUnit(raw?.bufferBeforeUnit, fallback.bufferBeforeUnit),
    bufferAfterRental: parseCount(
      raw?.bufferAfterRental,
      fallback.bufferAfterRental,
    ),
    bufferAfterUnit: parseUnit(raw?.bufferAfterUnit, fallback.bufferAfterUnit),
  };
}

export function parseBufferConfig(raw: Partial<BufferConfig> | null | undefined): BufferConfig {
  return {
    post: parseDeliveryDefaults(raw?.post, DEFAULT_POST_BUFFER),
    pickup: parseDeliveryDefaults(raw?.pickup, DEFAULT_PICKUP_BUFFER),
  };
}

export function bufferConfigFromFormData(formData: FormData): BufferConfig {
  const read = (method: DeliveryMethod, field: keyof DeliveryBufferDefaults) =>
    formData.get(`${method}_${field}`);

  const build = (method: DeliveryMethod, fallback: DeliveryBufferDefaults) =>
    parseDeliveryDefaults(
      {
        blockedDaysFromToday: read(method, "blockedDaysFromToday"),
        blockedDaysUnit: read(method, "blockedDaysUnit"),
        cutOffTime: read(method, "cutOffTime"),
        bufferBeforeRental: read(method, "bufferBeforeRental"),
        bufferBeforeUnit: read(method, "bufferBeforeUnit"),
        bufferAfterRental: read(method, "bufferAfterRental"),
        bufferAfterUnit: read(method, "bufferAfterUnit"),
      },
      fallback,
    );

  return {
    post: build("post", DEFAULT_POST_BUFFER),
    pickup: build("pickup", DEFAULT_PICKUP_BUFFER),
  };
}

export function parseDeliveryMethod(
  value: string | null | undefined,
): DeliveryMethod {
  return value === "pickup" ? "pickup" : "post";
}

export function getBufferDefaultsForMethod(
  config: BufferConfig,
  deliveryMethod: DeliveryMethod,
): DeliveryBufferDefaults {
  return deliveryMethod === "pickup" ? config.pickup : config.post;
}

export type BookingBufferOverride = {
  bufferBeforeDays: number | null;
  bufferBeforeUnit: BufferDayUnit | null;
  bufferAfterDays: number | null;
  bufferAfterUnit: BufferDayUnit | null;
};

export function resolveBookingBuffers(
  deliveryMethod: DeliveryMethod,
  config: BufferConfig,
  override?: Partial<BookingBufferOverride> | null,
): {
  bufferBeforeDays: number;
  bufferBeforeUnit: BufferDayUnit;
  bufferAfterDays: number;
  bufferAfterUnit: BufferDayUnit;
} {
  const defaults = getBufferDefaultsForMethod(config, deliveryMethod);
  return {
    bufferBeforeDays:
      override?.bufferBeforeDays ?? defaults.bufferBeforeRental,
    bufferBeforeUnit:
      override?.bufferBeforeUnit ?? defaults.bufferBeforeUnit,
    bufferAfterDays: override?.bufferAfterDays ?? defaults.bufferAfterRental,
    bufferAfterUnit: override?.bufferAfterUnit ?? defaults.bufferAfterUnit,
  };
}
