import type { LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";

function mask(value: string) {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Railway / uptime health check — no auth. Add ?ready=1 for production diagnostics. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ready = new URL(request.url).searchParams.get("ready") === "1";

  if (!ready) {
    return Response.json(
      { ok: true, service: "drobebook" },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  const appUrl = process.env.SHOPIFY_APP_URL ?? "";

  const checks = {
    database: false,
    sessionTable: false,
    apiKeySet: apiKey.length > 0,
    apiKeyMasked: apiKey ? mask(apiKey) : null,
    apiKeyLooksValid: /^[a-f0-9]{32}$/i.test(apiKey),
    apiSecretSet: apiSecret.length > 0,
    apiSecretLooksValid: apiSecret.startsWith("shpss_"),
    appUrlSet: appUrl.length > 0,
    appUrl: appUrl || null,
    expectedApiKey: "5304540515ef529204bacd597f500688",
    apiKeyMatchesProductionApp: apiKey === "5304540515ef529204bacd597f500688",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
    await prisma.session.count();
    checks.sessionTable = true;
  } catch {
    // leave checks false
  }

  const ok =
    checks.database &&
    checks.sessionTable &&
    checks.apiKeyMatchesProductionApp &&
    checks.apiSecretLooksValid &&
    checks.appUrlSet;

  return Response.json(
    { ok, service: "drobebook", checks },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
};
