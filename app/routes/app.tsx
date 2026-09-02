import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { ClientOnly } from "../components/ClientOnly";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <ClientOnly
        fallback={
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "#616161",
              fontSize: "14px",
            }}
          >
            Loading DrobeBook…
          </div>
        }
      >
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/settings">Gown Hire</s-link>
          <s-link href="/app/settings/try-on">Try-on</s-link>
          <s-link href="/app/settings/search">Search</s-link>
          <s-link href="/app/buffer-settings">Buffer settings</s-link>
          <s-link href="/app/blocked-dates">Blocked dates</s-link>
          <s-link href="/app/inventory">Inventory & Bookings</s-link>
          <s-link href="/app/bookings">Rental calendar</s-link>
        </s-app-nav>
        <Outlet />
      </ClientOnly>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
