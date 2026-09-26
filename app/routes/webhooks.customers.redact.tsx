import type { ActionFunctionArgs } from "react-router";

import { redactCustomerData } from "../lib/shop-data.server";
import { authenticate } from "../shopify.server";

type CustomerRedactPayload = {
  customer?: { email?: string | null };
  shop_domain?: string;
};

/** Mandatory compliance webhook — redact customer PII stored by the app. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const body = payload as CustomerRedactPayload;
  const email = body.customer?.email;

  console.info(`[compliance] ${topic} for ${shop}`);

  if (email) {
    await redactCustomerData(shop, email);
  }

  return new Response();
};
