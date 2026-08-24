import type { LoaderFunctionArgs } from "react-router";

import { getShopConfig } from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getShopConfig(session.shop);
  return Response.json(config.appointment);
};
