import type { LoaderFunctionArgs } from "react-router";

import {
  getUnavailableDatesForMonth,
  parseCalendarMonth,
  parseHireDuration,
} from "../lib/booking/availability-calendar.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const variantId = url.searchParams.get("variantId");
  const durationParam = url.searchParams.get("durationDays");
  const monthParams = parseCalendarMonth(
    url.searchParams.get("year"),
    url.searchParams.get("month"),
  );

  if (!productId || !variantId || !durationParam || !monthParams) {
    return Response.json(
      {
        error:
          "Missing required query params: productId, variantId, durationDays, year, month",
      },
      { status: 400 },
    );
  }

  const durationDays = parseHireDuration(durationParam);

  if (!durationDays) {
    return Response.json(
      { error: "durationDays must be 4 or 8" },
      { status: 400 },
    );
  }

  const result = await getUnavailableDatesForMonth({
    shop: session.shop,
    productId,
    variantId,
    durationDays,
    year: monthParams.year,
    month: monthParams.month,
  });

  return Response.json(result);
};
