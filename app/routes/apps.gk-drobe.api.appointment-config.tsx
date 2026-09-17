import type { LoaderFunctionArgs } from "react-router";

import { withAppProxyLoader } from "../lib/app-proxy.server";
import { getShopConfig } from "../lib/shop-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) =>
  withAppProxyLoader(request, async (shop) => {
    const config = await getShopConfig(shop);
    return config.appointment;
  });
