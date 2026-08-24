import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

const widgetScript = readFileSync(
  join(process.cwd(), "app/assets/booking-widget.js"),
  "utf8",
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return new Response("// Unauthorized", { status: 401 });
  }

  return new Response(widgetScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
