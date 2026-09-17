import type { LoaderFunctionArgs } from "react-router";

import { withAppProxyLoader } from "../lib/app-proxy.server";
import { getShopWidgetConfig } from "../lib/shop-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) =>
  withAppProxyLoader(request, (shop) => getShopWidgetConfig(shop));
