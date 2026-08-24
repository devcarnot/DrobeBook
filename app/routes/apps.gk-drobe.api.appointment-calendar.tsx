import type { LoaderFunctionArgs } from "react-router";

import {
  getUnavailableAppointmentDates,
  parseAppointmentDuration,
  parseDayType,
} from "../lib/appointment/appointment.server";
import { parseCalendarMonth } from "../lib/booking/availability-calendar.server";
import { getShopConfig } from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const monthParams = parseCalendarMonth(
    url.searchParams.get("year"),
    url.searchParams.get("month"),
  );
  const dayType = parseDayType(url.searchParams.get("dayType"));
  const durationMinutes = parseAppointmentDuration(
    url.searchParams.get("durationMinutes"),
  );

  if (!monthParams || !dayType || !durationMinutes) {
    return Response.json(
      {
        error:
          "Missing required query params: year, month, dayType, durationMinutes",
      },
      { status: 400 },
    );
  }

  const shopConfig = await getShopConfig(session.shop);
  const unavailableDates = await getUnavailableAppointmentDates({
    shop: session.shop,
    year: monthParams.year,
    month: monthParams.month,
    dayType,
    durationMinutes,
    config: shopConfig.appointment,
  });

  return Response.json({
    year: monthParams.year,
    month: monthParams.month,
    dayType,
    durationMinutes,
    unavailableDates,
  });
};
