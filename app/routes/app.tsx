import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import responsiveStyles from "../styles/responsive.css?url";

export const links = () => [{ rel: "stylesheet", href: responsiveStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/rentals">Rentals</s-link>
        <s-link href="/app/settings">Store Front widget</s-link>
        <s-link href="/app/buffer-settings">Buffer settings</s-link>
        <s-link href="/app/blocked-dates">Blocked dates</s-link>
        <s-link href="/app/inventory">Inventory & Bookings</s-link>
        <s-link href="/app/bookings">Rental calendar</s-link>
        <s-link href="/app/waitlist">Waitlist</s-link>
        <s-link href="/app/settings/notifications">Notifications</s-link>
      </s-app-nav>
      <Outlet />
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
