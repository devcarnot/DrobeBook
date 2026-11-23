import { normalizeVariantId } from "./shop-settings";

export type HireAddOn = {
  id: string;
  productId: string;
  variantId: string;
  title: string;
  imageUrl: string;
  displayPrice: string;
};

export const DEFAULT_HIRE_ADDONS_HEADING = "Need Fashion Tape";
export const MAX_HIRE_ADDONS = 10;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeProductId(value: string): string {
  const trimmed = value.trim();
  const gidMatch = trimmed.match(/Product\/(\d+)/i);
  if (gidMatch) {
    return gidMatch[1];
  }
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

export function normalizeHireAddOns(value: unknown): HireAddOn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const addOns = value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Partial<HireAddOn>;
      const variantId = normalizeVariantId(String(record.variantId ?? ""));
      const title = String(record.title ?? "").trim();
      if (!variantId || !title) {
        return null;
      }

      const productId = normalizeProductId(String(record.productId ?? ""));
      const id = String(record.id ?? "").trim() || slugify(title) || `addon-${index + 1}`;
      const imageUrl = String(record.imageUrl ?? "").trim();
      const displayPrice = String(record.displayPrice ?? "").trim();

      return {
        id,
        productId,
        variantId,
        title,
        imageUrl,
        displayPrice,
      };
    })
    .filter((entry): entry is HireAddOn => entry != null);

  return addOns.slice(0, MAX_HIRE_ADDONS);
}

export function normalizeAddOnsHeading(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || DEFAULT_HIRE_ADDONS_HEADING;
}

export function hireAddOnsFromFormData(formData: FormData): HireAddOn[] {
  const raw = String(formData.get("hireAddOnsJson") ?? "").trim();
  if (!raw) {
    return [];
  }

  try {
    return normalizeHireAddOns(JSON.parse(raw));
  } catch {
    return [];
  }
}