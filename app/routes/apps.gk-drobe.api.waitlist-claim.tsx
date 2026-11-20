import type { LoaderFunctionArgs } from "react-router";

import { withAppProxyLoader } from "../lib/app-proxy.server";
import { validateWaitlistClaim } from "../lib/waitlist/waitlist-notify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return withAppProxyLoader(request, async (shop) => {
    const url = new URL(request.url);
    const claimToken = url.searchParams.get("token")?.trim();

    if (!claimToken) {
      throw new Error("Missing claim token.");
    }

    const entry = await validateWaitlistClaim(shop, claimToken);
    if (!entry) {
      return {
        valid: false,
        error: "This priority access link has expired or is invalid.",
      };
    }

    return {
      valid: true,
      email: entry.email,
      kind: entry.kind,
      productId: entry.productId,
      variantId: entry.variantId,
      size: entry.size,
      preferredDate: entry.preferredDate?.toISOString().slice(0, 10) ?? null,
      preferredTime: entry.preferredTime,
      durationMinutes: entry.durationMinutes,
      expiresAt: entry.claimExpiresAt?.toISOString() ?? null,
    };
  });
};
