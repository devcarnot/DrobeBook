import type { ActionFunctionArgs } from "react-router";

import { withAppProxyAction } from "../lib/app-proxy.server";
import { createWaitlistEntry } from "../lib/waitlist/waitlist.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  return withAppProxyAction(request, async (shop, formData) => {
    try {
      const kindRaw = String(formData.get("kind") ?? "garment");
      const kind = kindRaw === "try_on" ? "try_on" : "garment";
      const durationRaw = Number.parseInt(
        String(formData.get("durationMinutes") ?? ""),
        10,
      );

      const entry = await createWaitlistEntry({
        shop,
        kind,
        productId: String(formData.get("productId") ?? ""),
        productTitle: String(formData.get("productTitle") ?? "") || null,
        variantId: String(formData.get("variantId") ?? "") || null,
        size: String(formData.get("size") ?? "") || null,
        eventDate: String(formData.get("eventDate") ?? "") || null,
        preferredDate: String(formData.get("preferredDate") ?? "") || null,
        preferredTime: String(formData.get("preferredTime") ?? "") || null,
        durationMinutes: Number.isFinite(durationRaw) ? durationRaw : null,
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? "") || null,
        pronouns: String(formData.get("pronouns") ?? "") || null,
        phone: String(formData.get("phone") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
      });

      return Response.json({
        ok: true,
        id: entry.id,
        message:
          kind === "try_on"
            ? "You have been added to the try-on waitlist. We will email you if a slot opens up."
            : "You have been added to the waitlist. We will contact you if dates open up.",
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
