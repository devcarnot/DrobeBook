import type { LoaderFunctionArgs } from "react-router";

import { getBackupVariantMapForShop } from "../lib/booking/backup-dress-variant.server";
import { authenticate, unauthenticated } from "../shopify.server";

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
    return Response.json({ variants: {} });
  }

  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const map = await getBackupVariantMapForShop(admin, session.shop, variantIds);
    return Response.json(map);
  } catch (error) {
    console.warn("[backup-variant-map]", error);
    return Response.json({ variants: {} });
  }
};