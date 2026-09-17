import type { ActionFunctionArgs } from "react-router";

import { withAppProxyAction } from "../lib/app-proxy.server";
import { createWaitlistEntry } from "../lib/waitlist/waitlist.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  return withAppProxyAction(request, async (shop, formData) => {
    try {
      const entry = await createWaitlistEntry({
        shop,
        productId: String(formData.get("productId") ?? ""),
        productTitle: String(formData.get("productTitle") ?? "") || null,
        variantId: String(formData.get("variantId") ?? "") || null,
        size: String(formData.get("size") ?? "") || null,
        eventDate: String(formData.get("eventDate") ?? "") || null,
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
      });

      return Response.json({
        ok: true,
        id: entry.id,
        message: "You have been added to the waitlist. We will contact you if dates open up.",
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Could not join waitlist",
        },
        { status: 400 },
      );
    }
  });
};
