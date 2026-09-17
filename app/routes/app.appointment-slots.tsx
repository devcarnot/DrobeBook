import type { LoaderFunctionArgs } from "react-router";

import { allowedAppointmentDurationMinutes } from "../lib/appointment/appointment-durations";
import {
  getAppointmentSlots,
  parseAppointmentDuration,
} from "../lib/appointment/appointment.server";
import { getShopConfig } from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const shopConfig = await getShopConfig(session.shop);
  const allowedDurations = allowedAppointmentDurationMinutes(
    shopConfig.appointment.appointmentDurations,
  );
  const durationMinutes = parseAppointmentDuration(
    url.searchParams.get("durationMinutes"),
    allowedDurations,
  );

  if (!date || !durationMinutes) {
    return Response.json(
      { error: "Missing required query params: date, durationMinutes" },
      { status: 400 },
    );
  }

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
