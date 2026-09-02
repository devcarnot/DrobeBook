import type { ActionFunctionArgs } from "react-router";

import {
  confirmBookingFromOrder,
  isBookingLineItem,
  type OrderWebhookPayload,
} from "../lib/order-booking.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  const payload = (await request.json()) as OrderWebhookPayload;
  const orderId = payload.id ? String(payload.id) : null;

  if (!orderId) {
    console.warn(`Received ${topic} webhook for ${shop} without order id`);
    return new Response();
  }

  const lineItems = payload.line_items ?? [];
  let confirmedCount = 0;

  for (const lineItem of lineItems) {
    if (!isBookingLineItem(lineItem)) {
      continue;
    }

    const result = await confirmBookingFromOrder(shop, orderId, lineItem);
    if (result) {
      confirmedCount += 1;
      console.log(
        `Confirmed booking ${result.bookingId} from order ${orderId} for ${shop}`,
      );
    }
  }

  console.log(
    `Processed ${topic} webhook for ${shop}: ${confirmedCount} booking line(s) confirmed`,
  );

  return new Response();
};
