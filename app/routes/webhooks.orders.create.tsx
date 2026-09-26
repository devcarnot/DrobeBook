import type { ActionFunctionArgs } from "react-router";

import { processOrderAppointments } from "../lib/appointment/appointment-order.server";
import { issueTryOnCreditForOrder } from "../lib/appointment/try-on-credit.server";
import {
  processOrderBookings,
  type OrderWebhookPayload,
} from "../lib/order-booking.server";
import { authenticate, unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const orderPayload = payload as OrderWebhookPayload;
  const orderId = orderPayload.id ? String(orderPayload.id) : null;

  if (!orderId) {
    console.warn(`Received ${topic} webhook for ${shop} without order id`);
    return new Response();
  }

  const lineItems = orderPayload.line_items ?? [];
  const bookings = await processOrderBookings(
    shop,
    orderId,
    lineItems,
    orderPayload.email,
  );
  const appointments = await processOrderAppointments(shop, orderId, lineItems, {
    email: orderPayload.email,
  });

  let creditsIssued = 0;
  try {
    const { admin } = await unauthenticated.admin(shop);
    const credits = await issueTryOnCreditForOrder(
      admin,
      shop,
      orderId,
      orderPayload.email,
      orderPayload.financial_status,
      lineItems,
    );
    creditsIssued = credits.issued;
  } catch (error) {
    console.warn(
      `[try-on-credit] Skipped for ${shop} order ${orderId}:`,
      error instanceof Error ? error.message : error,
    );
  }

  console.log(
    `Processed ${topic} webhook for ${shop}: ${bookings.confirmed} booking line(s) confirmed (${bookings.skipped} skipped), ${appointments.confirmed} appointment(s) confirmed (${appointments.skipped} skipped), ${creditsIssued} try-on credit(s) issued`,
  );

  return new Response();
};
