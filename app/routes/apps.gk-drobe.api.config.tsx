import type { LoaderFunctionArgs } from "react-router";

import { getShopWidgetConfig } from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getShopWidgetConfig(session.shop);
  return Response.json(config);
};
