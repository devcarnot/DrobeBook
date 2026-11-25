import type { LoaderFunctionArgs } from "react-router";

import { getBackupVariantMapFromDatabase } from "../lib/booking/backup-dress-variant.server";
import { getShopBackupDressDiscountConfig } from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawIds = url.searchParams.get("variantIds") ?? "";
  const variantIds = rawIds
    .split(",")
    .map((id) => id.trim())
  .filter(Boolean);

  if (!variantIds.length) {
    try {
      const discountConfig = await getShopBackupDressDiscountConfig(session.shop);
      return Response.json({ enabled: discountConfig.enabled, variants: {} });
    } catch {
      return Response.json({ enabled: true, variants: {} });
    }
  }

  try {
    const [map, discountConfig] = await Promise.all([
      getBackupVariantMapFromDatabase(session.shop, variantIds),
      getShopBackupDressDiscountConfig(session.shop),
    ]);
    return Response.json({
      enabled: discountConfig.enabled,
      variants: map.variants,
    });
  } catch (error) {
    console.warn("[backup-variant-map]", error);
    return Response.json({ enabled: true, variants: {} });
  }
};