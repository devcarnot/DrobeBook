import type { ActionFunctionArgs } from "react-router";

import { processBackupDressOrderWebhook } from "../lib/booking/backup-dress-order-process.server";
import type { OrderWebhookPayload } from "../lib/order-booking.server";
import { authenticate, unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const orderPayload = payload as OrderWebhookPayload;
  const orderId = orderPayload.id ? String(orderPayload.id) : null;

  if (!orderId) {
    return new Response();
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const result = await processBackupDressOrderWebhook({
      shop,
      topic,
      orderId,
      orderName: orderPayload.name ?? null,
      lineItems: orderPayload.line_items ?? [],
      admin,
    });
    console.log(
      `Processed ${topic} webhook for ${shop} order ${orderId}: ${result.violations} backup violation(s)`,
    );
  } catch (error) {
    console.warn(`[backup-order-verify] paid ${shop} order ${orderId}:`, error);
  }

  return new Response();
};