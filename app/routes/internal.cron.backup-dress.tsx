import type { LoaderFunctionArgs } from "react-router";

import { runBackupDressReconcileForAllShops } from "../lib/cron/run-backup-dress-reconcile.server";

function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("Authorization");
  if (auth === `Bearer ${secret}`) {
    return true;
  }

  return request.headers.get("X-Cron-Secret") === secret;
}

/** Railway cron: GET /internal/cron/backup-dress with CRON_SECRET */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!authorizeCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBackupDressReconcileForAllShops();

  return Response.json(
    {
      ok: true,
      ...result,
      ranAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};

export const action = loader;