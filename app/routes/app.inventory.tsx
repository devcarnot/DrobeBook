import { useMemo } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useOutlet, useSearchParams } from "react-router";

import { ResponsiveGrid } from "../components/ResponsiveGrid";
import {
  getInventorySummary,
  listGarmentsForShop,
  type GarmentListSort,
} from "../lib/garment/garment.server";
import { syncRecentOrderBookings } from "../lib/order-booking.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const INVENTORY_PAGE_SIZE = 10;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q");
  const sortParam = url.searchParams.get("sort");
  const filter = url.searchParams.get("filter");
  const sort: GarmentListSort =
    sortParam === "timesRented" ||
    sortParam === "revenue" ||
    sortParam === "profit"
      ? sortParam
      : "name";

  let syncSummary: Awaited<ReturnType<typeof syncRecentOrderBookings>> | null =
    null;
  try {
    syncSummary = await syncRecentOrderBookings(admin, session.shop);
  } catch (error) {
    console.warn("[inventory] order sync failed", error);
    syncSummary = {
      ordersChecked: 0,
      bookingsConfirmed: 0,
      errorMessage:
        error instanceof Error ? error.message : "Order sync failed",
    };
  }

  let garments = await listGarmentsForShop(admin, session.shop, {
    search,
    sort,
  });

  if (filter === "hold") {
    garments = garments.filter((garment) => garment.activeHold);
  } else if (filter === "rented") {
    garments = garments.filter((garment) => garment.timesRented > 0);
  }

  const summary = await getInventorySummary(session.shop, garments);

  const total = garments.length;
  const totalPages = Math.max(1, Math.ceil(total / INVENTORY_PAGE_SIZE));
  const requestedPage = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  const page = Math.min(requestedPage, totalPages);
  const pageStart = total === 0 ? 0 : (page - 1) * INVENTORY_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * INVENTORY_PAGE_SIZE, total);
  const paginatedGarments = garments.slice(
    (page - 1) * INVENTORY_PAGE_SIZE,
    page * INVENTORY_PAGE_SIZE,
  );

  return {
    garments: paginatedGarments,
    summary,
    syncSummary,
    search: search ?? "",
    sort,
    filter: filter ?? "",
    total,
    page,
    pageSize: INVENTORY_PAGE_SIZE,
    totalPages,
    pageStart,
    pageEnd,
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
        ? "Order sync needs Protected customer data in Partner Dashboard. Confirmed bookings appear after checkout."
        : `Synced ${summary.bookingsConfirmed} booking(s) from ${summary.ordersChecked} recent order(s).`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not sync orders",
    };
  }
};

function formatDisplayDate(iso: string | null) {
  if (!iso) {
    return "—";
  }
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <s-box padding="base" border="base" borderRadius="large" background="base">
      <s-stack direction="block" gap="small-200">
        <s-text tone="neutral" color="subdued">
          {label}
        </s-text>
        <s-text type="strong">{String(value)}</s-text>
      </s-stack>
    </s-box>
  );
}

export default function InventoryRoute() {
  const outlet = useOutlet();
  if (outlet) {
    return outlet;
  }

  return <InventoryListPage />;
}

function InventoryListPage() {
  const {
    garments,
    summary,
    syncSummary,
    search,
    sort,
    filter,
    total,
    page,
    totalPages,
    pageStart,
    pageEnd,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const isSyncing = navigation.state === "submitting";

  const pageLinks = useMemo(() => {
    const makeUrl = (nextPage: number) => {
      const next = new URLSearchParams(searchParams);
      next.set("page", String(nextPage));
      return `/app/inventory?${next.toString()}`;
    };
    return {
      prev: page > 1 ? makeUrl(page - 1) : null,
      next: page < totalPages ? makeUrl(page + 1) : null,
    };
  }, [page, totalPages, searchParams]);

  return (
    <s-page heading="Inventory & Bookings" inlineSize="large">
      <s-stack direction="block" gap="large">
        <p className="gk-page-guide">
          Open a garment to view its calendar, booking history, and try-on holds.
          Online hires sync here automatically; manual holds block those dates on
          the storefront.
        </p>

        {actionData?.message ? (
          <s-banner tone={actionData.ok ? "success" : "critical"}>
            {actionData.message}
          </s-banner>
        ) : syncSummary?.requiresProtectedCustomerData ? (
          <s-banner tone="warning">
            Shopify order sync needs Protected customer data in Partner Dashboard.
            Confirmed bookings appear after customers complete checkout.
          </s-banner>
        ) : syncSummary?.bookingsConfirmed ? (
          <s-banner tone="success">
            Imported {syncSummary.bookingsConfirmed} confirmed booking(s) from
            recent orders.
          </s-banner>
        ) : null}

        <div className="gk-inventory-metrics">
          <MetricCard label="Garments" value={summary.variantCount} />
          <MetricCard label="Times rented" value={summary.totalTimesRented} />
          <MetricCard label="Try-on holds" value={summary.activeHolds} />
          <MetricCard label="Revenue" value={summary.totalRevenueLabel} />
          <MetricCard label="Profit" value={summary.totalProfitLabel} />
        </div>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="base">
            <div className="gk-inventory-toolbar">
              <span className="gk-inventory-toolbar__count">
                {total === 0
                  ? "No garments in this view"
                  : totalPages > 1
                    ? `Showing ${pageStart}–${pageEnd} of ${total} garments`
                    : `${total} garment${total === 1 ? "" : "s"} in this view`}
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
                <s-text-field
                  label="Search"
                  name="q"
                  value={search}
                  placeholder="Product name or size"
                />
                <s-select label="Sort by" name="sort" value={sort}>
                  <s-option value="name">Name</s-option>
                  <s-option value="timesRented">Times rented</s-option>
                  <s-option value="revenue">Revenue</s-option>
                  <s-option value="profit">Profit</s-option>
                </s-select>
                <s-select label="Filter" name="filter" value={filter}>
                  <s-option value="">All garments</s-option>
                  <s-option value="rented">Has been rented</s-option>
                  <s-option value="hold">Active try-on hold</s-option>
                </s-select>
                <s-box paddingBlockStart="large-300">
                  <s-button type="submit" variant="primary">
                    Apply
                  </s-button>
                </s-box>
              </ResponsiveGrid>
            </Form>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          {total === 0 ? (
            <s-box padding="large" background="subdued" borderRadius="base">
              <s-text tone="neutral" color="subdued">
                No garments match your search or filter.
              </s-text>
            </s-box>
          ) : (
            <s-stack direction="block" gap="base">
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Garment</s-table-header>
                  <s-table-header listSlot="labeled">Size</s-table-header>
                  <s-table-header listSlot="labeled">Times rented</s-table-header>
                  <s-table-header listSlot="labeled">Revenue</s-table-header>
                  <s-table-header listSlot="labeled">Profit</s-table-header>
                  <s-table-header listSlot="labeled">Status</s-table-header>
                  <s-table-header listSlot="secondary">Next available</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {garments.map((garment) => (
                    <s-table-row key={`${garment.productId}-${garment.variantId}`}>
                      <s-table-cell>
                        <Link
                          to={`/app/inventory/detail?productId=${garment.productId}&variantId=${garment.variantId}&${searchParams.toString()}`}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <s-stack direction="inline" gap="base" alignItems="center">
                            {garment.imageUrl ? (
                              <img
                                src={garment.imageUrl}
                                alt=""
                                width={44}
                                height={44}
                                style={{
                                  objectFit: "cover",
                                  borderRadius: "4px",
                                }}
                              />
                            ) : (
                              <s-box
                                padding="small"
                                background="subdued"
                                borderRadius="base"
                              >
                                <s-text tone="neutral">—</s-text>
                              </s-box>
                            )}
                            <s-stack direction="block" gap="small">
                              <s-text type="strong">{garment.productTitle}</s-text>
                              <s-text tone="neutral" color="subdued">
                                {garment.variantTitle}
                              </s-text>
                            </s-stack>
                          </s-stack>
                        </Link>
                      </s-table-cell>
                      <s-table-cell>{garment.sizeLabel}</s-table-cell>
                      <s-table-cell>{garment.timesRented}</s-table-cell>
                      <s-table-cell>{garment.revenueLabel}</s-table-cell>
                      <s-table-cell>{garment.profitLabel}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small">
                          {garment.activeHold ? (
                            <s-badge tone="warning">Try-on hold</s-badge>
                          ) : (
                            <s-text tone="neutral" color="subdued">
                              —
                            </s-text>
                          )}
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>
                        {formatDisplayDate(garment.nextAvailableDate)}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>

              {totalPages > 1 ? (
                <s-stack direction="inline" gap="base" alignItems="center">
                  {pageLinks.prev ? (
                    <Link to={pageLinks.prev}>
                      <s-button>Previous</s-button>
                    </Link>
                  ) : (
                    <s-button disabled>Previous</s-button>
                  )}
                  <s-text tone="neutral" color="subdued">
                    Page {page} of {totalPages}
                  </s-text>
                  {pageLinks.next ? (
                    <Link to={pageLinks.next}>
                      <s-button>Next</s-button>
                    </Link>
                  ) : (
                    <s-button disabled>Next</s-button>
                  )}
                </s-stack>
              ) : null}
            </s-stack>
          )}
        </s-box>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
