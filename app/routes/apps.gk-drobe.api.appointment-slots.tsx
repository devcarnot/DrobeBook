import type { LoaderFunctionArgs } from "react-router";

import {
  getAppointmentSlots,
  parseAppointmentDuration,
} from "../lib/appointment/appointment.server";
import { getShopConfig } from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const durationMinutes = parseAppointmentDuration(
    url.searchParams.get("durationMinutes"),
  );

  if (!date || !durationMinutes) {
    return Response.json(
      { error: "Missing required query params: date, durationMinutes" },
      { status: 400 },
    );
  }

  const shopConfig = await getShopConfig(session.shop);
  const slots = await getAppointmentSlots({
    shop: session.shop,
    date,
    durationMinutes,
    config: shopConfig.appointment,
  });

  return Response.json({
    date,
    durationMinutes,
    slots,
  });
};
