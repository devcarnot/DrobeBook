import type { ActionFunctionArgs } from "react-router";

import { cancelAppointmentsForOrder } from "../lib/appointment/appointment-order.server";
import { voidTryOnCreditsForOrder } from "../lib/appointment/try-on-credit.server";
import { cancelBookingsForOrder } from "../lib/order-booking-cancel.server";
import { authenticate, unauthenticated } from "../shopify.server";

type RefundWebhookPayload = {
  order_id?: number | string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const refundPayload = payload as RefundWebhookPayload;
  const orderId = refundPayload.order_id ? String(refundPayload.order_id) : null;

  if (!orderId) {
    return new Response();
  }

  let voidedCredits = 0;
  try {
    const { admin } = await unauthenticated.admin(shop);
    voidedCredits = await voidTryOnCreditsForOrder(shop, orderId, admin);
  } catch (error) {
    voidedCredits = await voidTryOnCreditsForOrder(shop, orderId);
    console.warn(
      `[try-on-credit] Refund void in DB only for ${shop} order ${orderId}:`,
      error instanceof Error ? error.message : error,
    );
  }

  const cancelledBookings = await cancelBookingsForOrder(shop, orderId);
  const cancelledAppointments = await cancelAppointmentsForOrder(shop, orderId);
  console.log(
    `Processed ${topic} webhook for ${shop}: voided ${voidedCredits} try-on credit(s), cancelled ${cancelledBookings} rental booking(s) and ${cancelledAppointments} appointment(s) for refunded order ${orderId}`,
  );

  return new Response();
};
