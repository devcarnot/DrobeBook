import type { LoaderFunctionArgs } from "react-router";

import { computeReturnDate } from "../lib/booking/availability";
import {
  parseDeliveryMethod,
  parseHireDuration,
  parseIsoDate,
} from "../lib/booking/availability.server";
import { clutchCollectionConfigured } from "../lib/cart/clutch-upsell-config";
import { searchAvailableClutches } from "../lib/cart/clutch-upsell.server";
import { getShopConfig } from "../lib/shop-settings.server";
import { parseDisplayDate } from "../lib/order-booking.server";
import { authenticate, unauthenticated } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopConfig = await getShopConfig(session.shop);
  const upsell = shopConfig.clutchUpsell;

  if (!upsell.enabled || !clutchCollectionConfigured(upsell)) {
    return Response.json({
      enabled: false,
      config: upsell,
      products: [],
    });
  }

  const url = new URL(request.url);
  const deliveryDateRaw = url.searchParams.get("deliveryDate");
  const durationParam = url.searchParams.get("durationDays");
  const deliveryMethod = parseDeliveryMethod(url.searchParams.get("deliveryMethod"));
  const excludeRaw = url.searchParams.get("excludeProductIds") ?? "";

  const deliveryDate =
    parseIsoDate(deliveryDateRaw) ?? parseDisplayDate(deliveryDateRaw);
  const durationDays = parseHireDuration(durationParam);

  if (!deliveryDate || !durationDays) {
    return Response.json(
      {
        error: "Missing or invalid deliveryDate and durationDays",
      },
      { status: 400 },
    );
  }

  const excludeProductIds = excludeRaw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const products = await searchAvailableClutches(admin, {
      shop: session.shop,
      deliveryDate,
      durationDays,
      deliveryMethod,
      collectionHandle: upsell.collectionHandle,
      excludeProductIds,
      config: upsell,
    });

    const returnDate = computeReturnDate(deliveryDate, durationDays);

    return Response.json({
      enabled: true,
      config: upsell,
      deliveryDate: deliveryDate.toISOString().slice(0, 10),
      returnDate: returnDate.toISOString().slice(0, 10),
      durationDays,
      products,
    });
  } catch (error) {
    console.error("[cart-clutches]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not load clutches",
      },
      { status: 500 },
    );
  }
};