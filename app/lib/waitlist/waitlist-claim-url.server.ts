import type { WaitlistEntry } from "@prisma/client";

import prisma from "../../db.server";
import { addDays, formatDateIso, toDateOnly } from "../booking/availability";
import { extractNumericId } from "../shopify-ids";
import { getShopConfig } from "../shop-settings.server";

function storefrontProductClaimUrl(
  shop: string,
  productHandle: string,
  claimToken: string,
  options?: { tryOnDate?: string | null },
) {
  const params = new URLSearchParams();
  params.set("gk_claim", claimToken);
  if (options?.tryOnDate) {
    params.set("gk_tryon_date", options.tryOnDate);
  }
  return `https://${shop}/products/${productHandle}?${params.toString()}`;
}

const PRODUCT_HANDLE_QUERY = `#graphql
  query WaitlistProductHandle($id: ID!) {
    product(id: $id) {
      handle
    }
  }
`;

export async function resolveProductHandleForWaitlist(
  shop: string,
  productId: string,
): Promise<string | null> {
  const numericId = extractNumericId(productId);

  const cached = await prisma.rentalProduct.findFirst({
    where: { shop, shopifyProductId: numericId },
    select: { handle: true },
  });
  if (cached?.handle?.trim()) {
    return cached.handle.trim();
  }

  try {
    const { unauthenticated } = await import("../../shopify.server");
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(PRODUCT_HANDLE_QUERY, {
      variables: { id: `gid://shopify/Product/${numericId}` },
    });
    const json = (await response.json()) as {
      data?: { product?: { handle?: string | null } | null };
    };
    const handle = json.data?.product?.handle?.trim();
    return handle || null;
  } catch {
    return null;
  }
}

export async function buildClaimStorefrontUrl(
  shop: string,
  entry: WaitlistEntry,
  claimToken: string,
): Promise<string> {
  if (entry.kind === "try_on") {
    const shopConfig = await getShopConfig(shop);
    const tryOnVariantId = shopConfig.appointment.tryOnVariantId ?? "";

    let handle: string | null = null;
    if (tryOnVariantId) {
      const variant = await prisma.rentalProductVariant.findFirst({
        where: { shop, shopifyVariantId: extractNumericId(tryOnVariantId) },
        select: { rentalProduct: { select: { handle: true } } },
      });
      handle = variant?.rentalProduct?.handle?.trim() ?? null;
    }

    const preferredDate = entry.preferredDate
      ? formatDateIso(toDateOnly(entry.preferredDate))
      : null;

    if (handle) {
      return storefrontProductClaimUrl(shop, handle, claimToken, {
        tryOnDate: preferredDate,
      });
    }

    return `https://${shop}`;
  }

  const handle = await resolveProductHandleForWaitlist(shop, entry.productId);
  if (handle) {
    return storefrontProductClaimUrl(shop, handle, claimToken);
  }

  return `https://${shop}`;
}

export function deliveryDateFromWaitlistEvent(eventDate: Date): string {
  return formatDateIso(addDays(toDateOnly(eventDate), -1));
}