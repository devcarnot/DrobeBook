export type ClutchUpsellConfig = {
  enabled: boolean;
  modalTitle: string;
  modalSubtitle: string;
  collectionHandle: string;
  discountPercent: number;
  skipButtonLabel: string;
  continueCheckoutLabel: string;
  addToCartLabel: string;
  loadingLabel: string;
  emptyLabel: string;
};

export const DEFAULT_CLUTCH_UPSELL_CONFIG: ClutchUpsellConfig = {
  enabled: false,
  modalTitle: "Add a clutch to your hire",
  modalSubtitle: "Complete your look — discounted hire rates for these dates.",
  collectionHandle: "",
  discountPercent: 15,
  skipButtonLabel: "Skip & checkout",
  continueCheckoutLabel: "Continue to checkout",
  addToCartLabel: "Add to cart",
  loadingLabel: "Loading clutches…",
  emptyLabel: "No clutches are available for your hire dates.",
};

function parsePercent(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CLUTCH_UPSELL_CONFIG.discountPercent;
  }
  return Math.min(90, Math.max(0, parsed));
}

export function normalizeClutchUpsellConfig(
  value: Partial<ClutchUpsellConfig> | null | undefined,
): ClutchUpsellConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CLUTCH_UPSELL_CONFIG };
  }

  return {
    enabled: Boolean(value.enabled),
    modalTitle: String(value.modalTitle ?? DEFAULT_CLUTCH_UPSELL_CONFIG.modalTitle).trim(),
    modalSubtitle: String(
      value.modalSubtitle ?? DEFAULT_CLUTCH_UPSELL_CONFIG.modalSubtitle,
    ).trim(),
    collectionHandle: String(value.collectionHandle ?? "").trim(),
    discountPercent: parsePercent(value.discountPercent),
    skipButtonLabel: String(
      value.skipButtonLabel ?? DEFAULT_CLUTCH_UPSELL_CONFIG.skipButtonLabel,
    ).trim(),
    continueCheckoutLabel: String(
      value.continueCheckoutLabel ?? DEFAULT_CLUTCH_UPSELL_CONFIG.continueCheckoutLabel,
    ).trim(),
    addToCartLabel: String(
      value.addToCartLabel ?? DEFAULT_CLUTCH_UPSELL_CONFIG.addToCartLabel,
    ).trim(),
    loadingLabel: String(
      value.loadingLabel ?? DEFAULT_CLUTCH_UPSELL_CONFIG.loadingLabel,
    ).trim(),
    emptyLabel: String(value.emptyLabel ?? DEFAULT_CLUTCH_UPSELL_CONFIG.emptyLabel).trim(),
  };
}

export function clutchUpsellConfigFromFormData(formData: FormData): ClutchUpsellConfig {
  return normalizeClutchUpsellConfig({
    enabled: formData.get("clutchUpsellEnabled") === "true",
    modalTitle: formData.get("modalTitle"),
    modalSubtitle: formData.get("modalSubtitle"),
    collectionHandle: formData.get("collectionHandle"),
    discountPercent: formData.get("discountPercent"),
    skipButtonLabel: formData.get("skipButtonLabel"),
    continueCheckoutLabel: formData.get("continueCheckoutLabel"),
    addToCartLabel: formData.get("addToCartLabel"),
    loadingLabel: formData.get("loadingLabel"),
    emptyLabel: formData.get("emptyLabel"),
  });
}