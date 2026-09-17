import { authenticate } from "../shopify.server";

export async function requireAppProxyShop(request: Request) {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return {
      shop: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  return { shop: session.shop, response: null } as const;
}

export function appProxyJson<T>(data: T, init?: ResponseInit) {
  return Response.json(data, init);
}

export function appProxyError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function withAppProxyLoader<T>(
  request: Request,
  handler: (shop: string) => Promise<T>,
  options?: {
    onError?: (error: unknown) => Response;
  },
): Promise<Response> {
  const auth = await requireAppProxyShop(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const data = await handler(auth.shop);
    return appProxyJson(data);
  } catch (error) {
    if (options?.onError) {
      return options.onError(error);
    }

    return appProxyError(
      error instanceof Error ? error.message : "Request failed",
    );
  }
}

export async function withAppProxyAction(
  request: Request,
  handler: (shop: string, formData: FormData) => Promise<Response>,
): Promise<Response> {
  const auth = await requireAppProxyShop(request);
  if (auth.response) {
    return auth.response;
  }

  const formData = await request.formData();
  return handler(auth.shop, formData);
}
