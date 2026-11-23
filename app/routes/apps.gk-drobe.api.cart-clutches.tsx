import type { LoaderFunctionArgs } from "react-router";

import { computeReturnDate } from "../lib/booking/availability";
import {
  parseDeliveryMethod,
  parseHireDuration,
  parseIsoDate,
} from "../lib/booking/availability.server";
import { clutchCollectionConfigured } from "../lib/cart/clutch-upsell-config";
import {
  clutchResponseCacheKey,
  readClutchResponseCache,
  writeClutchResponseCache,
} from "../lib/cart/clutch-upsell-cache.server";
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

  const cacheKey = clutchResponseCacheKey({
    shop: session.shop,
    delivery: deliveryDate.toISOString().slice(0, 10),
    duration: String(durationDays),
    method: deliveryMethod,
    collectionId: upsell.collectionId || upsell.collectionHandle,
    discount: String(upsell.discountPercent),
  });

  const excludeSet = new Set(excludeProductIds);

  const filterExcluded = (body: string) => {
    if (!excludeSet.size) {
      return body;
    }
    try {
      const parsed = JSON.parse(body) as {
        products?: Array<{ productId: string }>;
      };
      if (!Array.isArray(parsed.products)) {
        return body;
      }
      parsed.products = parsed.products.filter(
        (product) => !excludeSet.has(product.productId),
      );
      return JSON.stringify(parsed);
    } catch {
      return body;
    }
  };

  const cached = readClutchResponseCache(cacheKey);
  if (cached) {
    return new Response(filterExcluded(cached), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const products = await searchAvailableClutches(admin, {
      shop: session.shop,
      deliveryDate,
      durationDays,
      deliveryMethod,
      collectionId: upsell.collectionId,
      collectionHandle: upsell.collectionHandle,
      excludeProductIds,
      config: upsell,
    });

    const returnDate = computeReturnDate(deliveryDate, durationDays);

    const payload = JSON.stringify({
      enabled: true,
      config: upsell,
      deliveryDate: deliveryDate.toISOString().slice(0, 10),
      returnDate: returnDate.toISOString().slice(0, 10),
      durationDays,
      products,
    });

    writeClutchResponseCache(cacheKey, payload);

    return new Response(payload, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
      },
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