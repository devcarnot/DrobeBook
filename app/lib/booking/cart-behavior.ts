export const BOOKING_ID_KEY = "_gk_booking_id";
export const LINKED_BOOKING_ID_KEY = "_gk_linked_booking_id";

export type CartLineItem = {
  key: string;
  product_title: string;
  properties?: Record<string, string>;
};

export type CartSnapshot = {
  items: CartLineItem[];
};

export function getBookingSize(
  properties?: Record<string, string>,
): string | null {
  return properties?._Size ?? properties?.Size ?? null;
}

export function getBookingDuration(
  properties?: Record<string, string>,
): string | null {
  return properties?._Duration ?? properties?.Duration ?? null;
}

export function isBookingItem(item: CartLineItem): boolean {
  return Boolean(
    getBookingSize(item.properties) && getBookingDuration(item.properties),
  );
}

export function normalizeDescriptor(value: string): string {
  return value
    .replace(/\(\d+\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildMainDescriptor(item: CartLineItem): string | null {
  if (!isBookingItem(item)) {
    return null;
  }

  const parts = [
    getBookingSize(item.properties)!,
    getBookingDuration(item.properties)!,
  ];
  if (item.properties?.Color) {
    parts.push(item.properties.Color);
  }

  return `${item.product_title} [${parts.join(" / ")}]`;
}

export function findOrphanedProtectionKeys(cart: CartSnapshot): string[] {
  const bookingIds = new Set(
    cart.items
      .map((item) => item.properties?.[BOOKING_ID_KEY])
      .filter((value): value is string => Boolean(value)),
  );

  const mainDescriptors = new Set(
    cart.items
      .map((item) => buildMainDescriptor(item))
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeDescriptor(value)),
  );

  return cart.items
    .filter((item) => {
      const forItem = item.properties?.["For item"];
      if (!forItem) {
        return false;
      }

      const linkedId = item.properties?.[LINKED_BOOKING_ID_KEY];
      if (linkedId) {
        return !bookingIds.has(linkedId);
      }

      return !mainDescriptors.has(normalizeDescriptor(forItem));
    })
    .map((item) => item.key);
}

export function looksLikeVariantSummary(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return (
    /^\d/.test(normalized) &&
    (/,/.test(normalized) || /\//.test(normalized) || /day/i.test(normalized))
  );
}
