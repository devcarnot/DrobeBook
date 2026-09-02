import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { useMemo } from "react";

import { RentalCalendar } from "../components/RentalCalendar";
import { currentCalendarMonth } from "../lib/garment/garment.server";
import { getRentalCalendar } from "../lib/booking/rental-calendar.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const defaults = currentCalendarMonth();
  const year = Number.parseInt(
    url.searchParams.get("year") ?? String(defaults.year),
    10,
  );
  const month = Number.parseInt(
    url.searchParams.get("month") ?? String(defaults.month),
    10,
  );
  const status = url.searchParams.get("status");
  const deliveryMethod = url.searchParams.get("deliveryMethod");
  const search = url.searchParams.get("q");

  const calendar = await getRentalCalendar(
    admin,
    session.shop,
    year,
    month,
    { status, deliveryMethod, search },
  );

  const filterParams = new URLSearchParams();
  if (status) filterParams.set("status", status);
  if (deliveryMethod) filterParams.set("deliveryMethod", deliveryMethod);
  if (search) filterParams.set("q", search);

  return {
    calendar,
    shop: session.shop,
    filters: {
      status: status ?? "",
      deliveryMethod: deliveryMethod ?? "",
      search: search ?? "",
    },
    filtersQuery: filterParams.toString(),
  };
};

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <s-box padding="large" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="small">
        <s-text tone="neutral" color="subdued">
          {label}
        </s-text>
        <s-heading>{String(value)}</s-heading>
      </s-stack>
    </s-box>
  );
}

export default function BookingsPage() {
  const { calendar, shop, filters, filtersQuery } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") ?? "calendar";

  const stats = useMemo(() => {
    const bookings = calendar.events.filter((event) => event.type === "booking");
    return {
      confirmed: bookings.filter((event) => event.status === "confirmed").length,
      pending: bookings.filter((event) => event.status === "pending").length,
      blackouts: calendar.events.filter((event) => event.type === "block").length,
    };
  }, [calendar.events]);

  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.deliveryMethod,
  );

  return (
    <s-page heading="Rental calendar" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="calendar" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Gown hire at a glance</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Color-coded rentals and blackout periods. Click any bar to view
                details, edit buffers, or jump to the garment.
              </s-paragraph>
            </s-stack>
          </s-stack>
        </s-box>

        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="large">
          <MetricCard label="Confirmed hires" value={stats.confirmed} />
          <MetricCard label="Pending hires" value={stats.pending} />
          <MetricCard label="Blackout periods" value={stats.blackouts} />
        </s-grid>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack
              direction="inline"
              gap="base"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-text type="strong">Filters</s-text>
              {hasActiveFilters ? (
                <s-badge tone="info">Filters active</s-badge>
              ) : (
                <s-text tone="neutral" color="subdued">
                  Showing all rentals this month
                </s-text>
              )}
            </s-stack>

            <s-divider />

            <Form method="get">
              <s-grid gridTemplateColumns="2fr 1fr 1fr auto" gap="large" alignItems="end">
                <input type="hidden" name="year" value={calendar.year} />
                <input type="hidden" name="month" value={calendar.month} />
                <input type="hidden" name="view" value={view} />
                <s-text-field
                  label="Search"
                  name="q"
                  value={filters.search}
                  placeholder="Product, size, order…"
                />
                <s-select label="Status" name="status" value={filters.status}>
                  <option value="">All statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </s-select>
                <s-select
                  label="Delivery method"
                  name="deliveryMethod"
                  value={filters.deliveryMethod}
                >
                  <option value="">All methods</option>
                  <option value="post">Post</option>
                  <option value="pickup">Pickup</option>
                </s-select>
                <s-box paddingBlockStart="large-300">
                  <s-button type="submit" variant="primary">
                    Apply
                  </s-button>
                </s-box>
              </s-grid>
            </Form>
          </s-stack>
        </s-box>

        <s-box padding="none" border="base" borderRadius="large" background="base">
          <RentalCalendar
            calendar={calendar}
            shop={shop}
            filtersQuery={filtersQuery}
          />
        </s-box>

        <s-grid gridTemplateColumns="1fr 1fr" gap="large">
          <s-box padding="large" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text type="strong">Quick actions</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Block dates, adjust buffers, or inspect garment-level bookings.
              </s-paragraph>
              <s-stack direction="block" gap="small">
                <s-link href="/app/buffer-settings">Buffer settings</s-link>
                <s-link href="/app/blocked-dates">Shop-wide blackouts</s-link>
                <s-link href="/app/inventory">Inventory &amp; bookings</s-link>
              </s-stack>
            </s-stack>
          </s-box>

          <s-box padding="large" border="base" borderRadius="base" background="base">
            <s-stack direction="block" gap="base">
              <s-text type="strong">Legend</s-text>
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="large" alignItems="center">
                  <s-badge tone="success">Confirmed</s-badge>
                  <s-text tone="neutral" color="subdued">
                    Paid or confirmed hire
                  </s-text>
                </s-stack>
                <s-stack direction="inline" gap="large" alignItems="center">
                  <s-badge tone="info">Pending</s-badge>
                  <s-text tone="neutral" color="subdued">
                    Awaiting confirmation
                  </s-text>
                </s-stack>
                <s-stack direction="inline" gap="large" alignItems="center">
                  <s-badge tone="warning">Blackout</s-badge>
                  <s-text tone="neutral" color="subdued">
                    Blocked or try-on hold
                  </s-text>
                </s-stack>
              </s-stack>
            </s-stack>
          </s-box>
        </s-grid>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
