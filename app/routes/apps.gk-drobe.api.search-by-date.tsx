import type { LoaderFunctionArgs } from "react-router";

import { parseDeliveryMethod } from "../lib/booking";
import { parseHireDuration } from "../lib/booking/availability.server";
import type { HireDurationDays } from "../lib/booking/availability";
import {
  searchConfigWithOverrides,
  searchProductsByDate,
} from "../lib/search/search-by-date.server";
import { getShopConfig } from "../lib/shop-settings.server";
import { authenticate, unauthenticated } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const eventDate = url.searchParams.get("eventDate");
  const size = url.searchParams.get("size");
  const durationParam = url.searchParams.get("durationDays");
  const deliveryMethod = parseDeliveryMethod(url.searchParams.get("deliveryMethod"));
  const collectionHandle = url.searchParams.get("collection");

  if (!eventDate || !size) {
    return Response.json(
      { error: "Missing required query params: eventDate, size" },
      { status: 400 },
    );
  }

  const shopConfig = await getShopConfig(session.shop);
  const configuredDefault =
    shopConfig.search.defaultDurationDays === 8 ? 8 : 4;
  const durationDays: HireDurationDays =
    parseHireDuration(durationParam) ?? configuredDefault;

  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const result = await searchProductsByDate(admin, {
      shop: session.shop,
      eventDate,
      size,
      durationDays,
      deliveryMethod,
      collectionHandle:
        searchConfigWithOverrides(shopConfig.search, collectionHandle)
          .collectionHandle,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not search products",
      },
      { status: 500 },
    );
  }
};
