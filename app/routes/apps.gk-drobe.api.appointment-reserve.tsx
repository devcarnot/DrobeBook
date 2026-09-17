import type { ActionFunctionArgs } from "react-router";

import { reserveAppointmentRoom } from "../lib/appointment/appointment-hold.server";
import { withAppProxyAction } from "../lib/app-proxy.server";
import { getShopConfig } from "../lib/shop-settings.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  return withAppProxyAction(request, async (shop, formData) => {
    try {
      const appointmentId = String(formData.get("appointmentId") ?? "").trim();
      const date = String(formData.get("date") ?? "").trim();
      const time = String(formData.get("time") ?? "").trim();
      const durationMinutes = Number.parseInt(
        String(formData.get("durationMinutes") ?? ""),
        10,
      );

      if (!appointmentId || !date || !time || !Number.isFinite(durationMinutes)) {
        return Response.json(
          { error: "Missing required fields: appointmentId, date, time, durationMinutes" },
          { status: 400 },
        );
      }

      const shopConfig = await getShopConfig(shop);
      const reservation = await reserveAppointmentRoom({
        shop,
        appointmentId,
        date,
        time,
        durationMinutes,
        config: shopConfig.appointment,
      });

      if (!reservation) {
        return Response.json(
          { error: "That time slot is no longer available. Please choose another." },
          { status: 409 },
        );
      }

      return Response.json(reservation);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not reserve that appointment time",
        },
        { status: 500 },
      );
    }
  });
};
