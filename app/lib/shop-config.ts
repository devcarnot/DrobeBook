import {
  DEFAULT_WIDGET_CONFIG,
  parseWidgetConfig,
  serializeWidgetConfig,
  type WidgetConfig,
} from "./shop-settings";
import { parseWidgetColors } from "./widget-colors";
import {
  DEFAULT_BUFFER_CONFIG,
  parseBufferConfig,
  type BufferConfig,
} from "./booking/buffer-config";
import {
  DEFAULT_SEARCH_COLORS,
  parseSearchColors,
  searchColorsFromFormData,
  type SearchColorScheme,
} from "./search-colors";

export type AppointmentConfig = {
  introText: string;
  timezoneLabel: string;
  dayTypeLabel: string;
  weekdayDayLabel: string;
  weekendDayLabel: string;
  durationTypeLabel: string;
  duration50Label: string;
  duration20Label: string;
  weekdayStart: string;
  weekdayEnd: string;
  saturdayStart: string;
  saturdayEnd: string;
  sundayStart: string;
  sundayEnd: string;
  capacity50: number;
  capacity20: number;
  changeRoomCount: number;
  slotInterval50: number;
  slotInterval20: number;
  timeSlotLabel: string;
  slotPlaceholder: string;
  slotLoadingText: string;
  slotSoldOutText: string;
  slotAvailableSingularText: string;
  slotAvailablePluralText: string;
  loadingCalendarText: string;
  priceLabel: string;
  backLabel: string;
  selectTimeLabel: string;
  bookCheckoutLabel: string;
  confirmTitle: string;
  confirmSubtitle: string;
  additionalInfoTitle: string;
  availabilityNote: string;
  specificItemsLabel: string;
  specificItemsPlaceholder: string;
  eventDateLabel: string;
  availabilityCheckboxLabel: string;
};

export type SearchConfig = {
  pageTitle: string;
  formButtonLabel: string;
  eventDateLabel: string;
  sizeLabel: string;
  sizePlaceholder: string;
  sizeOptions: string;
  refineSearchLabel: string;
  emptyResultsLabel: string;
  loadingLabel: string;
  defaultDurationDays: number;
  collectionHandle: string;
  resultsPageUrl: string;
  colors: SearchColorScheme;
};

export type ShopConfig = {
  widget: WidgetConfig;
  appointment: AppointmentConfig;
  search: SearchConfig;
  buffers: BufferConfig;
};

export const DEFAULT_APPOINTMENT_CONFIG: AppointmentConfig = {
  introText: "Select your appointment time",
  timezoneLabel: "Brisbane",
  dayTypeLabel: "Day",
  weekdayDayLabel: "Monday-Friday",
  weekendDayLabel: "Saturday-Sunday",
  durationTypeLabel: "Duration",
  duration50Label: "50 minute Appointment (recommended)",
  duration20Label: "20 minute (Cocktail wear & re-try only)",
  weekdayStart: "10:00",
  weekdayEnd: "17:00",
  saturdayStart: "10:00",
  saturdayEnd: "14:00",
  sundayStart: "10:00",
  sundayEnd: "13:00",
  capacity50: 4,
  capacity20: 2,
  changeRoomCount: 3,
  slotInterval50: 60,
  slotInterval20: 30,
  timeSlotLabel: "Available times",
  slotPlaceholder: "Select a time",
  slotLoadingText: "Loading times…",
  slotSoldOutText: "Sold out",
  slotAvailableSingularText: "1 Space Available",
  slotAvailablePluralText: "{count} Spaces Available",
  loadingCalendarText: "Loading availability…",
  priceLabel: "Price",
  backLabel: "Back",
  selectTimeLabel: "Select a Time",
  bookCheckoutLabel: "Book & Checkout",
  confirmTitle: "Confirm your appointment",
  confirmSubtitle: "Review your booking details before checkout.",
  additionalInfoTitle: "Additional information",
  availabilityNote: "Our styles book out, it is important to check availability:",
  specificItemsLabel: "Please list any specific items you would like to try on:",
  specificItemsPlaceholder: "(Style & size)",
  eventDateLabel: "Your Event Date:",
  availabilityCheckboxLabel:
    "I have/will check outfit availability for my event date",
};

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  pageTitle: "Search By Date",
  formButtonLabel: "Find your dream 'Fit",
  eventDateLabel: "Your event date",
  sizeLabel: "Size",
  sizePlaceholder: "Select size",
  sizeOptions: "4,6,8,10,12,14",
  refineSearchLabel: "Search",
  emptyResultsLabel: "No gowns found for these dates and size.",
  loadingLabel: "Searching available gowns…",
  defaultDurationDays: 4,
  collectionHandle: "all",
  resultsPageUrl: "/pages/search-by-date",
  colors: { ...DEFAULT_SEARCH_COLORS },
};

function parseIntegerField(
  value: FormDataEntryValue | null,
  fallback: number,
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function appointmentConfigFromFormData(formData: FormData): AppointmentConfig {
  return {
    introText: String(formData.get("introText") ?? DEFAULT_APPOINTMENT_CONFIG.introText),
    timezoneLabel: String(
      formData.get("timezoneLabel") ?? DEFAULT_APPOINTMENT_CONFIG.timezoneLabel,
    ),
    dayTypeLabel: String(
      formData.get("dayTypeLabel") ?? DEFAULT_APPOINTMENT_CONFIG.dayTypeLabel,
    ),
    weekdayDayLabel: String(
      formData.get("weekdayDayLabel") ?? DEFAULT_APPOINTMENT_CONFIG.weekdayDayLabel,
    ),
    weekendDayLabel: String(
      formData.get("weekendDayLabel") ?? DEFAULT_APPOINTMENT_CONFIG.weekendDayLabel,
    ),
    durationTypeLabel: String(
      formData.get("durationTypeLabel") ?? DEFAULT_APPOINTMENT_CONFIG.durationTypeLabel,
    ),
    duration50Label: String(
      formData.get("duration50Label") ?? DEFAULT_APPOINTMENT_CONFIG.duration50Label,
    ),
    duration20Label: String(
      formData.get("duration20Label") ?? DEFAULT_APPOINTMENT_CONFIG.duration20Label,
    ),
    weekdayStart: String(
      formData.get("weekdayStart") ?? DEFAULT_APPOINTMENT_CONFIG.weekdayStart,
    ),
    weekdayEnd: String(
      formData.get("weekdayEnd") ?? DEFAULT_APPOINTMENT_CONFIG.weekdayEnd,
    ),
    saturdayStart: String(
      formData.get("saturdayStart") ?? DEFAULT_APPOINTMENT_CONFIG.saturdayStart,
    ),
    saturdayEnd: String(
      formData.get("saturdayEnd") ?? DEFAULT_APPOINTMENT_CONFIG.saturdayEnd,
    ),
    sundayStart: String(
      formData.get("sundayStart") ?? DEFAULT_APPOINTMENT_CONFIG.sundayStart,
    ),
    sundayEnd: String(formData.get("sundayEnd") ?? DEFAULT_APPOINTMENT_CONFIG.sundayEnd),
    capacity50: parseIntegerField(formData.get("capacity50"), DEFAULT_APPOINTMENT_CONFIG.capacity50),
    capacity20: parseIntegerField(formData.get("capacity20"), DEFAULT_APPOINTMENT_CONFIG.capacity20),
    changeRoomCount: parseIntegerField(
      formData.get("changeRoomCount"),
      DEFAULT_APPOINTMENT_CONFIG.changeRoomCount,
    ),
    slotInterval50: parseIntegerField(
      formData.get("slotInterval50"),
      DEFAULT_APPOINTMENT_CONFIG.slotInterval50,
    ),
    slotInterval20: parseIntegerField(
      formData.get("slotInterval20"),
      DEFAULT_APPOINTMENT_CONFIG.slotInterval20,
    ),
    timeSlotLabel: String(
      formData.get("timeSlotLabel") ?? DEFAULT_APPOINTMENT_CONFIG.timeSlotLabel,
    ),
    slotPlaceholder: String(
      formData.get("slotPlaceholder") ?? DEFAULT_APPOINTMENT_CONFIG.slotPlaceholder,
    ),
    slotLoadingText: String(
      formData.get("slotLoadingText") ?? DEFAULT_APPOINTMENT_CONFIG.slotLoadingText,
    ),
    slotSoldOutText: String(
      formData.get("slotSoldOutText") ?? DEFAULT_APPOINTMENT_CONFIG.slotSoldOutText,
    ),
    slotAvailableSingularText: String(
      formData.get("slotAvailableSingularText") ??
        DEFAULT_APPOINTMENT_CONFIG.slotAvailableSingularText,
    ),
    slotAvailablePluralText: String(
      formData.get("slotAvailablePluralText") ??
        DEFAULT_APPOINTMENT_CONFIG.slotAvailablePluralText,
    ),
    loadingCalendarText: String(
      formData.get("loadingCalendarText") ??
        DEFAULT_APPOINTMENT_CONFIG.loadingCalendarText,
    ),
    priceLabel: String(formData.get("priceLabel") ?? DEFAULT_APPOINTMENT_CONFIG.priceLabel),
    backLabel: String(formData.get("backLabel") ?? DEFAULT_APPOINTMENT_CONFIG.backLabel),
    selectTimeLabel: String(
      formData.get("selectTimeLabel") ?? DEFAULT_APPOINTMENT_CONFIG.selectTimeLabel,
    ),
    bookCheckoutLabel: String(
      formData.get("bookCheckoutLabel") ?? DEFAULT_APPOINTMENT_CONFIG.bookCheckoutLabel,
    ),
    confirmTitle: String(
      formData.get("confirmTitle") ?? DEFAULT_APPOINTMENT_CONFIG.confirmTitle,
    ),
    confirmSubtitle: String(
      formData.get("confirmSubtitle") ?? DEFAULT_APPOINTMENT_CONFIG.confirmSubtitle,
    ),
    additionalInfoTitle: String(
      formData.get("additionalInfoTitle") ?? DEFAULT_APPOINTMENT_CONFIG.additionalInfoTitle,
    ),
    availabilityNote: String(
      formData.get("availabilityNote") ?? DEFAULT_APPOINTMENT_CONFIG.availabilityNote,
    ),
    specificItemsLabel: String(
      formData.get("specificItemsLabel") ?? DEFAULT_APPOINTMENT_CONFIG.specificItemsLabel,
    ),
    specificItemsPlaceholder: String(
      formData.get("specificItemsPlaceholder") ??
        DEFAULT_APPOINTMENT_CONFIG.specificItemsPlaceholder,
    ),
    eventDateLabel: String(
      formData.get("eventDateLabel") ?? DEFAULT_APPOINTMENT_CONFIG.eventDateLabel,
    ),
    availabilityCheckboxLabel: String(
      formData.get("availabilityCheckboxLabel") ??
        DEFAULT_APPOINTMENT_CONFIG.availabilityCheckboxLabel,
    ),
  };
}

export function searchConfigFromFormData(formData: FormData): SearchConfig {
  const durationDays = parseIntegerField(
    formData.get("defaultDurationDays"),
    DEFAULT_SEARCH_CONFIG.defaultDurationDays,
  );

  return {
    pageTitle: String(formData.get("pageTitle") ?? DEFAULT_SEARCH_CONFIG.pageTitle),
    formButtonLabel: String(
      formData.get("formButtonLabel") ?? DEFAULT_SEARCH_CONFIG.formButtonLabel,
    ),
    eventDateLabel: String(
      formData.get("eventDateLabel") ?? DEFAULT_SEARCH_CONFIG.eventDateLabel,
    ),
    sizeLabel: String(formData.get("sizeLabel") ?? DEFAULT_SEARCH_CONFIG.sizeLabel),
    sizePlaceholder: String(
      formData.get("sizePlaceholder") ?? DEFAULT_SEARCH_CONFIG.sizePlaceholder,
    ),
    sizeOptions: String(
      formData.get("sizeOptions") ?? DEFAULT_SEARCH_CONFIG.sizeOptions,
    ).trim() || DEFAULT_SEARCH_CONFIG.sizeOptions,
    refineSearchLabel: String(
      formData.get("refineSearchLabel") ?? DEFAULT_SEARCH_CONFIG.refineSearchLabel,
    ),
    emptyResultsLabel: String(
      formData.get("emptyResultsLabel") ?? DEFAULT_SEARCH_CONFIG.emptyResultsLabel,
    ),
    loadingLabel: String(
      formData.get("loadingLabel") ?? DEFAULT_SEARCH_CONFIG.loadingLabel,
    ),
    defaultDurationDays: durationDays === 8 ? 8 : 4,
    collectionHandle: String(
      formData.get("collectionHandle") ?? DEFAULT_SEARCH_CONFIG.collectionHandle,
    ).trim() || DEFAULT_SEARCH_CONFIG.collectionHandle,
    resultsPageUrl: String(
      formData.get("resultsPageUrl") ?? DEFAULT_SEARCH_CONFIG.resultsPageUrl,
    ).trim() || DEFAULT_SEARCH_CONFIG.resultsPageUrl,
    colors: searchColorsFromFormData(formData),
  };
}

export const DEFAULT_SHOP_CONFIG: ShopConfig = {
  widget: DEFAULT_WIDGET_CONFIG,
  appointment: DEFAULT_APPOINTMENT_CONFIG,
  search: DEFAULT_SEARCH_CONFIG,
  buffers: DEFAULT_BUFFER_CONFIG,
};

export function parseShopConfig(raw: string | null | undefined): ShopConfig {
  if (!raw) {
    return structuredClone(DEFAULT_SHOP_CONFIG);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShopConfig> & Partial<WidgetConfig>;

    if ("widget" in parsed || "appointment" in parsed || "search" in parsed) {
      return {
        widget: {
          ...DEFAULT_WIDGET_CONFIG,
          ...(parsed.widget ?? {}),
          colors: parseWidgetColors(
            (parsed.widget as Partial<WidgetConfig> | undefined)?.colors,
          ),
        },
        appointment: {
          ...DEFAULT_APPOINTMENT_CONFIG,
          ...(parsed.appointment ?? {}),
        },
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          ...(parsed.search ?? {}),
          colors: parseSearchColors(
            (parsed.search as Partial<SearchConfig> | undefined)?.colors,
          ),
        },
        buffers: parseBufferConfig(parsed.buffers),
      };
    }

    return {
      widget: parseWidgetConfig(raw),
      appointment: { ...DEFAULT_APPOINTMENT_CONFIG },
      search: { ...DEFAULT_SEARCH_CONFIG },
      buffers: { ...DEFAULT_BUFFER_CONFIG },
    };
  } catch {
    return structuredClone(DEFAULT_SHOP_CONFIG);
  }
}

export function serializeShopConfig(config: ShopConfig): string {
  return JSON.stringify(config);
}

export function shopConfigFromWidgetForm(
  widget: WidgetConfig,
  existing?: ShopConfig,
): ShopConfig {
  return {
    widget,
    appointment: existing?.appointment ?? { ...DEFAULT_APPOINTMENT_CONFIG },
    search: existing?.search ?? { ...DEFAULT_SEARCH_CONFIG },
    buffers: existing?.buffers ?? { ...DEFAULT_BUFFER_CONFIG },
  };
}

export { serializeWidgetConfig, parseWidgetConfig };
