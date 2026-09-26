import type { ActionFunctionArgs } from "react-router";

import { purgeShopData } from "../lib/shop-data.server";
import { authenticate } from "../shopify.server";

/** Mandatory compliance webhook — delete all shop data after uninstall grace period. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.info(`[compliance] ${topic} for ${shop}`);

  await purgeShopData(shop);

  return new Response();
};
