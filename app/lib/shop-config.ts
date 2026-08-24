import {
  DEFAULT_WIDGET_CONFIG,
  parseWidgetConfig,
  serializeWidgetConfig,
  type WidgetConfig,
} from "./shop-settings";

export type AppointmentConfig = {
  timezoneLabel: string;
  weekdayStart: string;
  weekdayEnd: string;
  saturdayStart: string;
  saturdayEnd: string;
  sundayStart: string;
  sundayEnd: string;
  capacity50: number;
  capacity20: number;
  changeRoomCount: number;
  selectTimeLabel: string;
  bookCheckoutLabel: string;
  availabilityNote: string;
  specificItemsLabel: string;
  eventDateLabel: string;
  availabilityCheckboxLabel: string;
};

export type SearchConfig = {
  pageTitle: string;
  formButtonLabel: string;
  defaultDurationDays: number;
  collectionHandle: string;
};

export type ShopConfig = {
  widget: WidgetConfig;
  appointment: AppointmentConfig;
  search: SearchConfig;
};

export const DEFAULT_APPOINTMENT_CONFIG: AppointmentConfig = {
  timezoneLabel: "Brisbane",
  weekdayStart: "10:00",
  weekdayEnd: "17:00",
  saturdayStart: "10:00",
  saturdayEnd: "14:00",
  sundayStart: "10:00",
  sundayEnd: "13:00",
  capacity50: 4,
  capacity20: 2,
  changeRoomCount: 3,
  selectTimeLabel: "Select a Time",
  bookCheckoutLabel: "Book & Checkout",
  availabilityNote: "Our styles book out, it is important to check availability:",
  specificItemsLabel: "Please list any specific items you would like to try on:",
  eventDateLabel: "Your Event Date:",
  availabilityCheckboxLabel:
    "I have/will check outfit availability for my event date",
};

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  pageTitle: "Search By Date",
  formButtonLabel: "Find your dream 'Fit",
  defaultDurationDays: 4,
  collectionHandle: "all",
};

export const DEFAULT_SHOP_CONFIG: ShopConfig = {
  widget: DEFAULT_WIDGET_CONFIG,
  appointment: DEFAULT_APPOINTMENT_CONFIG,
  search: DEFAULT_SEARCH_CONFIG,
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
        },
        appointment: {
          ...DEFAULT_APPOINTMENT_CONFIG,
          ...(parsed.appointment ?? {}),
        },
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          ...(parsed.search ?? {}),
        },
      };
    }

    return {
      widget: parseWidgetConfig(raw),
      appointment: { ...DEFAULT_APPOINTMENT_CONFIG },
      search: { ...DEFAULT_SEARCH_CONFIG },
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
  };
}

export { serializeWidgetConfig, parseWidgetConfig };
