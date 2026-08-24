import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

const cartBehaviorScript = readFileSync(
  join(process.cwd(), "extensions/gk-drobe-booking/assets/cart-behavior.js"),
  "utf8",
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  return new Response(cartBehaviorScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
