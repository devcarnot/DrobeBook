import type { LoaderFunctionArgs } from "react-router";

import { withAppProxyLoader } from "../lib/app-proxy.server";
import { getProductRentalWidgetStatus } from "../lib/rental-product/rental-product.server";
import { extractNumericId } from "../lib/shopify-ids";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return Response.json(
      { error: "Missing required query param: productId" },
      { status: 400 },
    );
  }

  return withAppProxyLoader(request, (shop) =>
    getProductRentalWidgetStatus(shop, extractNumericId(productId)),
  );
};
