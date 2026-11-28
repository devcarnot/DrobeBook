import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useOutlet } from "react-router";
import { useMemo } from "react";

import { ResponsiveGrid } from "../components/ResponsiveGrid";
import { RentalCalendar } from "../components/RentalCalendar";
import rentalCalendarStyles from "../styles/rental-calendar.css?url";
import { currentCalendarMonth } from "../lib/garment/garment.server";
import { getRentalCalendar } from "../lib/booking/rental-calendar.server";
import { syncRecentOrderBookings } from "../lib/order-booking.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const links = () => [{ rel: "stylesheet", href: rentalCalendarStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  let syncSummary: Awaited<ReturnType<typeof syncRecentOrderBookings>> | null =
    null;
  try {
    syncSummary = await syncRecentOrderBookings(admin, session.shop);
  } catch (error) {
    console.warn("[bookings] order sync failed", error);
    syncSummary = {
      ordersChecked: 0,
      bookingsConfirmed: 0,
      errorMessage:
        error instanceof Error ? error.message : "Order sync failed",
    };
  }

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
    syncSummary,
    filters: {
      status: status ?? "",
      deliveryMethod: deliveryMethod ?? "",
      search: search ?? "",
    },
    filtersQuery: filterParams.toString(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return { ok: false, message: "Unsupported method" };
  }

  try {
    const summary = await syncRecentOrderBookings(admin, session.shop, {
      limit: 100,
    });
    return {
      ok: true,
      message: summary.requiresProtectedCustomerData
        ? "Order sync needs Protected customer data access in Partner Dashboard. Bookings from cart still appear as pending."
        : `Synced ${summary.bookingsConfirmed} booking(s) from ${summary.ordersChecked} recent order(s).`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not sync orders from Shopify",
    };
  }
};

function CalendarMetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "confirmed" | "blackout";
}) {
  return (
    <article className={`gk-calendar-metric gk-calendar-metric--${tone}`}>
      <span className="gk-calendar-metric__label">{label}</span>
      <span className="gk-calendar-metric__value">{value}</span>
      <span className={`gk-calendar-metric__icon gk-calendar-metric__icon--${tone}`} aria-hidden />
    </article>
  );
}

export default function BookingsRoute() {
  const outlet = useOutlet();
  if (outlet) {
    return outlet;
  }

  return <BookingsCalendarPage />;
}

function BookingsCalendarPage() {
  const { calendar, shop, filters, filtersQuery, syncSummary } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSyncing = navigation.state === "submitting";

  const stats = useMemo(() => {
    const bookings = calendar.events.filter((event) => event.type === "booking");
    return {
      confirmed: bookings.filter((event) => event.status === "confirmed").length,
      blackouts: calendar.events.filter((event) => event.type === "block").length,
    };
  }, [calendar.events]);

  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.deliveryMethod,
  );

  return (
    <s-page heading="Rental calendar" inlineSize="large">
      <div className="gk-calendar-page">
        <p className="gk-calendar-guide">
          Color-coded rentals and blackouts for this month. Click any bar for
          details, buffers, or the garment page.
        </p>

        {actionData?.message ? (
          <s-banner tone={actionData.ok ? "success" : "critical"}>
            {actionData.message}
          </s-banner>
        ) : syncSummary?.bookingsConfirmed ? (
          <s-banner tone="success">
            Imported {syncSummary.bookingsConfirmed} booking(s) from recent
            Shopify orders.
          </s-banner>
        ) : syncSummary?.requiresProtectedCustomerData ? (
          <s-banner tone="warning">
            Shopify order sync needs Protected customer data in Partner Dashboard.
          </s-banner>
        ) : null}

        <div className="gk-calendar-metrics">
          <CalendarMetricCard
            label="Confirmed hires"
            value={stats.confirmed}
            tone="confirmed"
          />
          <CalendarMetricCard
            label="Blackout periods"
            value={stats.blackouts}
            tone="blackout"
          />
        </div>

        <section className="gk-calendar-panel" aria-label="Calendar filters">
          <div className="gk-calendar-panel__toolbar">
            <span className="gk-calendar-panel__toolbar-meta">
              {hasActiveFilters ? "Filters active" : "Showing all rentals this month"}
            </span>
            <Form method="post">
              <s-button
                type="submit"
                variant="secondary"
                {...(isSyncing ? { loading: true } : {})}
              >
                Sync orders
              </s-button>
            </Form>
          </div>

          <Form method="get">
            <ResponsiveGrid layout="filter-row" alignItems="end" gap="base">
              <input type="hidden" name="year" value={calendar.year} />
              <input type="hidden" name="month" value={calendar.month} />
              <s-text-field
                label="Search"
                name="q"
                value={filters.search}
                placeholder="Product, size, order…"
              />
              <s-select label="Status" name="status" value={filters.status}>
                <s-option value="">All statuses</s-option>
                <s-option value="confirmed">Confirmed</s-option>
                <s-option value="cancelled">Cancelled</s-option>
              </s-select>
              <s-select
                label="Delivery method"
                name="deliveryMethod"
                value={filters.deliveryMethod}
              >
                <s-option value="">All methods</s-option>
                <s-option value="post">Post</s-option>
                <s-option value="pickup">Pickup</s-option>
              </s-select>
              <s-box paddingBlockStart="large-300">
                <s-button type="submit" variant="primary">
                  Apply
                </s-button>
              </s-box>
            </ResponsiveGrid>
          </Form>
        </section>

        <section
          className="gk-calendar-panel gk-calendar-panel--flush"
          aria-label="Month calendar"
        >
          <RentalCalendar
            calendar={calendar}
            shop={shop}
            filtersQuery={filtersQuery}
          />
        </section>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
