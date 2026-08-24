export type WidgetConfig = {
  deliveryInstructions: string;
  postageNote: string;
  pickupLabel: string;
  postLabel: string;
  damageProtectionPrice: string;
  damageProtectionVariantId: string;
  damageProtectionProductTitle: string;
  damageProtectionMoreInfoUrl: string;
  damageProtectionLabel: string;
  moreInfoLabel: string;
  buttonLabelPending: string;
  buttonLabelReady: string;
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  deliveryInstructions:
    "Select a delivery date 1-2 days prior to your event date. It will be sent so it arrives to you on or before your selected date. 8 day bookings recommended for all regional & rural locations.",
  postageNote:
    "Nationwide postage is $12.50-18.5 and will be added at checkout. Please ensure you also select Postage as your delivery method when you get to the checkout.",
  pickupLabel: "Local Pickup (Gold Coast, QLD)",
  postLabel: "Post",
  damageProtectionPrice: "19.95",
  damageProtectionVariantId: "",
  damageProtectionProductTitle: "",
  damageProtectionMoreInfoUrl: "",
  damageProtectionLabel: "Add Damage Protection",
  moreInfoLabel: "More Info",
  buttonLabelPending: "Select dates first",
  buttonLabelReady: "Add hire to cart",
};

export function normalizeVariantId(value: string): string {
  const trimmed = value.trim();
  const gidMatch = trimmed.match(/ProductVariant\/(\d+)/i);
  if (gidMatch) {
    return gidMatch[1];
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return "";
}

export function widgetConfigFromFormData(formData: FormData): WidgetConfig {
  return {
    deliveryInstructions: String(
      formData.get("deliveryInstructions") ??
        DEFAULT_WIDGET_CONFIG.deliveryInstructions,
    ),
    postageNote: String(
      formData.get("postageNote") ?? DEFAULT_WIDGET_CONFIG.postageNote,
    ),
    pickupLabel: String(
      formData.get("pickupLabel") ?? DEFAULT_WIDGET_CONFIG.pickupLabel,
    ),
    postLabel: String(
      formData.get("postLabel") ?? DEFAULT_WIDGET_CONFIG.postLabel,
    ),
    damageProtectionPrice: String(
      formData.get("damageProtectionPrice") ??
        DEFAULT_WIDGET_CONFIG.damageProtectionPrice,
    ),
    damageProtectionVariantId: normalizeVariantId(
      String(formData.get("damageProtectionVariantId") ?? ""),
    ),
    damageProtectionProductTitle: String(
      formData.get("damageProtectionProductTitle") ?? "",
    ),
    damageProtectionMoreInfoUrl: String(
      formData.get("damageProtectionMoreInfoUrl") ?? "",
    ),
    damageProtectionLabel: String(
      formData.get("damageProtectionLabel") ??
        DEFAULT_WIDGET_CONFIG.damageProtectionLabel,
    ),
    moreInfoLabel: String(
      formData.get("moreInfoLabel") ?? DEFAULT_WIDGET_CONFIG.moreInfoLabel,
    ),
    buttonLabelPending: String(
      formData.get("buttonLabelPending") ??
        DEFAULT_WIDGET_CONFIG.buttonLabelPending,
    ),
    buttonLabelReady: String(
      formData.get("buttonLabelReady") ??
        DEFAULT_WIDGET_CONFIG.buttonLabelReady,
    ),
  };
}

export function parseWidgetConfig(raw: string | null | undefined): WidgetConfig {
  if (!raw) {
    return { ...DEFAULT_WIDGET_CONFIG };
  }

  try {
    const parsed = { ...DEFAULT_WIDGET_CONFIG, ...JSON.parse(raw) };
    parsed.damageProtectionVariantId = normalizeVariantId(
      parsed.damageProtectionVariantId,
    );
    return parsed;
  } catch {
    return { ...DEFAULT_WIDGET_CONFIG };
  }
}

export function serializeWidgetConfig(config: WidgetConfig): string {
  return JSON.stringify(config);
}
