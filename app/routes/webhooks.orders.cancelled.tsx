import type { ActionFunctionArgs } from "react-router";

import { cancelAppointmentsForOrder } from "../lib/appointment/appointment-order.server";
import { voidTryOnCreditsForOrder } from "../lib/appointment/try-on-credit.server";
import { cancelBookingsForOrder } from "../lib/order-booking-cancel.server";
import type { OrderWebhookPayload } from "../lib/order-booking.server";
import { authenticate, unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const payload = (await request.json()) as OrderWebhookPayload;
  const orderId = payload.id ? String(payload.id) : null;

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
      `[try-on-credit] Voided credits in DB only for ${shop} order ${orderId}:`,
      error instanceof Error ? error.message : error,
    );
  }

  const cancelledBookings = await cancelBookingsForOrder(shop, orderId);
  const cancelledAppointments = await cancelAppointmentsForOrder(shop, orderId);
  console.log(
    `Processed ${topic} webhook for ${shop}: voided ${voidedCredits} try-on credit(s), cancelled ${cancelledBookings} rental booking(s) and ${cancelledAppointments} appointment(s) for order ${orderId}`,
  );

  return new Response();
};
