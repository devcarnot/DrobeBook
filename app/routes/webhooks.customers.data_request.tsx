import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

/** Mandatory compliance webhook — acknowledge data request (merchant handles export). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.info(`[compliance] ${topic} for ${shop}`);

  return new Response();
};
