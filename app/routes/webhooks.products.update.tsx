import type { ActionFunctionArgs } from "react-router";

import { ensureBackupVariantsForRentalProduct } from "../lib/booking/backup-dress-variant.server";
import prisma from "../db.server";
import { extractNumericId } from "../lib/shopify-ids";
import { authenticate, unauthenticated } from "../shopify.server";
import { claimWebhookEvent } from "../lib/webhook-idempotency.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const productId = payload?.id ? extractNumericId(String(payload.id)) : null;
  if (!productId) {
    return new Response();
  }

  const externalId = `${topic}:${productId}:${payload?.updated_at ?? ""}`;
  const claimed = await claimWebhookEvent(shop, topic, externalId);
  if (!claimed) {
    return new Response();
  }

  const rental = await prisma.rentalProduct.findUnique({
    where: { shop_shopifyProductId: { shop, shopifyProductId: productId } },
    select: { id: true, rentalEnabled: true },
  });

  if (!rental?.rentalEnabled) {
    return new Response();
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    await ensureBackupVariantsForRentalProduct(admin, shop, rental.id);
  } catch (error) {
    console.warn(`[products/update] backup sync ${shop} product ${productId}:`, error);
  }

  return new Response();
};