import type { LoaderFunctionArgs } from "react-router";

import {
  checkProductAvailability,
  formatDateIso,
  parseHireDuration,
  parseIsoDate,
} from "../lib/booking";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const variantId = url.searchParams.get("variantId");
  const deliveryDateParam = url.searchParams.get("deliveryDate");
  const durationParam = url.searchParams.get("durationDays");

  if (!productId || !variantId || !deliveryDateParam || !durationParam) {
    return Response.json(
      {
        error:
          "Missing required query params: productId, variantId, deliveryDate, durationDays",
      },
      { status: 400 },
    );
  }

  const deliveryDate = parseIsoDate(deliveryDateParam);
  const durationDays = parseHireDuration(durationParam);

  if (!deliveryDate) {
    return Response.json(
      { error: "deliveryDate must be an ISO date (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  if (!durationDays) {
    return Response.json(
      { error: "durationDays must be 4 or 8" },
      { status: 400 },
    );
  }

  const result = await checkProductAvailability({
    shop: session.shop,
    productId,
    variantId,
    deliveryDate,
    durationDays,
  });

  return Response.json({
    available: result.available,
    deliveryDate: formatDateIso(result.deliveryDate),
    returnDate: formatDateIso(result.returnDate),
    reason: result.reason ?? null,
  });
};
