import { redirect, type LoaderFunctionArgs } from "react-router";

import { requireAppProxyShop } from "../lib/app-proxy.server";
import { buildClaimStorefrontUrl } from "../lib/waitlist/waitlist-claim-url.server";
import { validateWaitlistClaim } from "../lib/waitlist/waitlist-notify.server";

function wantsJsonResponse(request: Request, url: URL) {
  if (url.searchParams.get("format") === "json") {
    return true;
  }
  const accept = request.headers.get("Accept") ?? "";
  if (accept.includes("application/json")) {
    return true;
  }
  const secFetchDest = request.headers.get("Sec-Fetch-Dest");
  return secFetchDest !== "document" && secFetchDest !== "iframe";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireAppProxyShop(request);
  if (auth.response) {
    return auth.response;
  }

  const shop = auth.shop;
  const url = new URL(request.url);
  const claimToken = url.searchParams.get("token")?.trim();

  if (!claimToken) {
    if (wantsJsonResponse(request, url)) {
      return Response.json(
        { valid: false, error: "Missing claim token." },
        { status: 400 },
      );
    }
    return redirect(`https://${shop}`);
  }

  const entry = await validateWaitlistClaim(shop, claimToken);
  if (!entry) {
    if (wantsJsonResponse(request, url)) {
      return Response.json({
        valid: false,
        error: "This priority access link has expired or is invalid.",
      });
    }
    return redirect(`https://${shop}`);
  }

  if (!wantsJsonResponse(request, url)) {
    const target = await buildClaimStorefrontUrl(shop, entry, claimToken);
    return redirect(target);
  }

  return Response.json({
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
  });
};