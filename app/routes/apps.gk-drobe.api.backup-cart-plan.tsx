import type { ActionFunctionArgs } from "react-router";

import { buildBackupCartPlan, type CartPlanLineInput } from "../lib/booking/backup-dress-cart-plan.server";
import { authenticate } from "../shopify.server";

type CartPlanRequest = {
  lines?: Array<{
    key: string;
    variantId: string;
    quantity?: number;
    priceCents?: number;
    createdAt?: number | string;
    properties?: Record<string, string>;
  }>;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: CartPlanRequest;
  try {
    body = (await request.json()) as CartPlanRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lines: CartPlanLineInput[] = (body.lines ?? [])
    .filter((line) => line?.key && line?.variantId)
    .map((line) => ({
      key: String(line.key),
      variantId: String(line.variantId),
      quantity: Math.max(1, Math.min(1, Math.floor(line.quantity ?? 1))),
      priceCents: Math.max(0, Math.floor(Number(line.priceCents) || 0)),
      createdAt: line.createdAt,
      properties: line.properties ?? {},
    }));

  try {
    const plan = await buildBackupCartPlan(session.shop, lines);
    return Response.json(plan);
  } catch (error) {
    console.warn("[backup-cart-plan]", error);
    return Response.json({ enabled: false, actions: [] });
  }
};