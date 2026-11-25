import prisma from "../../db.server";
import { getShopBackupDressDiscountConfig } from "../shop-settings.server";
import { toOrderGid } from "../shopify-ids";
import { claimWebhookEvent } from "../webhook-idempotency.server";
import { notifyBackupDressViolation } from "./backup-dress-alert.server";
import {
  buildVariantCatalogMaps,
  recordBackupOrderViolations,
  tagOrderBackupViolation,
  verifyBackupDressOrderLines,
  type OrderLineSnapshot,
} from "./backup-dress-order-verify.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ShopifyOrderLine = {
  variant_id?: number | string | null;
  quantity?: number | null;
  price?: string | null;
  properties?: Array<{ name: string; value: string }> | null;
};

export async function processBackupDressOrderWebhook(params: {
  shop: string;
  topic: string;
  orderId: string;
  orderName: string | null;
  lineItems: ShopifyOrderLine[];
  admin: AdminGraphql | null;
}): Promise<{ violations: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const externalId =
    params.topic === "reconcile/orders"
      ? `${params.topic}:${params.orderId}:${day}`
      : `${params.topic}:${params.orderId}`;
  const claimed = await claimWebhookEvent(params.shop, params.topic, externalId);
  if (!claimed) {
    return { violations: 0 };
  }

  const discountConfig = await getShopBackupDressDiscountConfig(params.shop);
  if (!discountConfig.enabled) {
    return { violations: 0 };
  }

  const { mainById, backupToMain } = await buildVariantCatalogMaps(params.shop);

  const lines: OrderLineSnapshot[] = (params.lineItems ?? [])
    .filter((row) => row?.variant_id)
    .map((row) => ({
      variantId: String(row.variant_id),
      quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
      priceCents: Math.round(Number.parseFloat(String(row.price ?? "0")) * 100),
      properties: Object.fromEntries(
        (row.properties ?? []).map((p) => [String(p.name), String(p.value ?? "")]),
      ),
    }));

  const violations = verifyBackupDressOrderLines({
    lines,
    mainById,
    backupToMain,
    discountEnabled: true,
  });

  if (!violations.length) {
    return { violations: 0 };
  }

  await recordBackupOrderViolations(
    params.shop,
    params.orderId,
    params.orderName,
    violations,
  );

  const note = violations
    .map(
      (v) =>
        `Variant ${v.variantId}: expected ${v.expectedTier} @ ${(v.expectedPriceCents / 100).toFixed(2)}, got ${v.actualTier} @ ${(v.actualPriceCents / 100).toFixed(2)} — ${v.reason}`,
    )
    .join("\n");

  if (params.admin) {
    await tagOrderBackupViolation(params.admin, toOrderGid(params.orderId), note);
  }

  await notifyBackupDressViolation({
    shop: params.shop,
    orderId: params.orderId,
    orderName: params.orderName,
    violations,
  });

  return { violations: violations.length };
}