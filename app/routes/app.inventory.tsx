import { useMemo } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useOutlet,
  useSearchParams,
} from "react-router";

import {
  buildListPagination,
  ListPaginationBar,
} from "../components/ListPaginationBar";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import adminPagesStyles from "../styles/admin-pages.css?url";
import {
  exportInventoryGarmentsCsv,
  getInventorySummary,
  listGarmentsForShop,
  type GarmentListSort,
} from "../lib/garment/garment.server";
import { syncRecentOrderBookings } from "../lib/order-booking.server";
import { InventoryDateRangeCalendar } from "../components/InventoryDateRangeCalendar";
import { resolveDatePresetRange } from "../lib/rental/date-range";
import {
  parseInventoryDateField,
  parseInventoryDatePreset,
  type InventoryDateField,
  type InventoryDatePreset,
  type RentalDatePreset,
} from "../lib/rental/rental.types";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const links = () => [{ rel: "stylesheet", href: adminPagesStyles }];

const INVENTORY_PAGE_SIZE = 10;

const DATE_FIELDS: Array<{ value: InventoryDateField; label: string }> = [
  { value: "overlap", label: "Hire overlaps range" },
  { value: "rentalStart", label: "Delivery / rental start" },
  { value: "rentalEnd", label: "Rental end" },
];

function resolveInventoryDateParams(url: URL): {
  datePreset: InventoryDatePreset;
  dateField: InventoryDateField;
  dateFrom: string;
  dateTo: string;
} {
  const dateField = parseInventoryDateField(url.searchParams.get("dateField"));
  const presetParam = url.searchParams.get("datePreset");
  let dateFrom = url.searchParams.get("dateFrom")?.trim() ?? "";
  let dateTo = url.searchParams.get("dateTo")?.trim() ?? "";

  if (presetParam === "all" && !dateFrom && !dateTo) {
    return { datePreset: "all", dateField, dateFrom: "", dateTo: "" };
  }

  const missingDates = !dateFrom && !dateTo;
  if (missingDates && (!presetParam || presetParam === "all")) {
    const range = resolveDatePresetRange("last7");
    return {
      datePreset: "last7",
      dateField,
      dateFrom: range.from.toISOString().slice(0, 10),
      dateTo: range.to.toISOString().slice(0, 10),
    };
  }

  let datePreset: InventoryDatePreset = parseInventoryDatePreset(presetParam);

  if (missingDates && datePreset !== "all" && datePreset !== "custom") {
    const resolved = resolveDatePresetRange(datePreset as RentalDatePreset);
    dateFrom = resolved.from.toISOString().slice(0, 10);
    dateTo = resolved.to.toISOString().slice(0, 10);
  }

  if (dateFrom && dateTo) {
    if (presetParam && presetParam !== "custom" && presetParam !== "all") {
      datePreset = presetParam as InventoryDatePreset;
    } else if (presetParam === "custom" || !presetParam) {
      datePreset = "custom";
    }
  } else {
    datePreset = "all";
    dateFrom = "";
    dateTo = "";
  }

  return { datePreset, dateField, dateFrom, dateTo };
}

function parseGarmentListSort(value: string | null): GarmentListSort {
  if (value === "timesRented" || value === "revenue" || value === "profit") {
    return value;
  }
  return "name";
}

async function loadFilteredInventoryGarments(
  admin: Parameters<typeof listGarmentsForShop>[0],
  shop: string,
  params: {
    search: string | null;
    sort: GarmentListSort;
    filter: string;
    datePreset: InventoryDatePreset;
    dateField: InventoryDateField;
    dateFrom: string;
    dateTo: string;
  },
) {
  let garments = await listGarmentsForShop(admin, shop, {
    search: params.search,
    sort: params.sort,
    date: {
      datePreset: params.datePreset,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
      dateField: params.dateField,
    },
  });

  if (params.filter === "hold") {
    garments = garments.filter((garment) => garment.activeHold);
  } else if (params.filter === "rented") {
    garments = garments.filter((garment) => garment.timesRented > 0);
  }

  return garments;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q");
  const sortParam = url.searchParams.get("sort");
  const filter = url.searchParams.get("filter");
  const { datePreset, dateField, dateFrom, dateTo } = resolveInventoryDateParams(url);
  const sort = parseGarmentListSort(sortParam);

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

  const dateRange =
    datePreset !== "all"
      ? datePreset === "custom"
        ? resolveDatePresetRange("custom", dateFrom, dateTo)
        : resolveDatePresetRange(datePreset as RentalDatePreset, dateFrom, dateTo)
      : null;

  let garments = await loadFilteredInventoryGarments(admin, session.shop, {
    search,
    sort,
    filter: filter ?? "",
    datePreset,
    dateField,
    dateFrom,
    dateTo,
  });

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
    datePreset,
    dateField,
    dateFrom: dateFrom ?? "",
    dateTo: dateTo ?? "",
    dateRangeLabel: dateRange?.label ?? null,
    dateRangeFrom: dateRange ? dateRange.from.toISOString().slice(0, 10) : null,
    dateRangeTo: dateRange ? dateRange.to.toISOString().slice(0, 10) : null,
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

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "sync");

  if (intent === "export") {
    const search = String(formData.get("q") ?? "").trim() || null;
    const sort = parseGarmentListSort(String(formData.get("sort") ?? ""));
    const filter = String(formData.get("filter") ?? "");
    const exportParams = new URLSearchParams();
    const preset = String(formData.get("datePreset") ?? "");
    const from = String(formData.get("dateFrom") ?? "").trim();
    const to = String(formData.get("dateTo") ?? "").trim();
    const field = String(formData.get("dateField") ?? "");
    if (preset) {
      exportParams.set("datePreset", preset);
    }
    if (from) {
      exportParams.set("dateFrom", from);
    }
    if (to) {
      exportParams.set("dateTo", to);
    }
    if (field) {
      exportParams.set("dateField", field);
    }
    const {
      datePreset: exportDatePreset,
      dateField: exportDateField,
      dateFrom: exportDateFrom,
      dateTo: exportDateTo,
    } = resolveInventoryDateParams(new URL(`http://inventory.local/?${exportParams.toString()}`));

    const garments = await loadFilteredInventoryGarments(admin, session.shop, {
      search,
      sort,
      filter,
      datePreset: exportDatePreset,
      dateField: exportDateField,
      dateFrom: exportDateFrom,
      dateTo: exportDateTo,
    });

    const csv = exportInventoryGarmentsCsv(garments);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventory-bookings-${stamp}.csv"`,
      },
    });
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

function AdminMetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="gk-admin-metric">
      <span className="gk-admin-metric__label">{label}</span>
      <span className="gk-admin-metric__value">{String(value)}</span>
    </article>
  );
}

function buildInventoryClearDatesUrl(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  next.set("datePreset", "all");
  next.delete("dateFrom");
  next.delete("dateTo");
  next.set("page", "1");
  return `/app/inventory?${next.toString()}`;
}

function InventoryFiltersForm({
  search,
  sort,
  filter,
  datePreset,
  dateField,
  dateFrom,
  dateTo,
  dateRangeLabel,
  dateRangeFrom,
  dateRangeTo,
  onClearDates,
}: {
  search: string;
  sort: GarmentListSort;
  filter: string;
  datePreset: InventoryDatePreset;
  dateField: InventoryDateField;
  dateFrom: string;
  dateTo: string;
  dateRangeLabel: string | null;
  dateRangeFrom: string | null;
  dateRangeTo: string | null;
  onClearDates: () => void;
}) {
  const hasDateRange =
    datePreset !== "all" && Boolean(dateRangeFrom && dateRangeTo);

  return (
    <Form method="get" className="gk-inventory-filters">
      <input type="hidden" name="page" value="1" />

      <div className="gk-inventory-filters__primary">
        <div className="gk-inventory-filters__field gk-inventory-filters__field--search">
          <s-text-field
            label="Search"
            name="q"
            value={search}
            placeholder="Product name or size"
          />
        </div>
        <div className="gk-inventory-filters__field">
          <s-select label="Sort by" name="sort" value={sort}>
            <s-option value="name">Name</s-option>
            <s-option value="timesRented">Times rented</s-option>
            <s-option value="revenue">Revenue</s-option>
            <s-option value="profit">Profit</s-option>
          </s-select>
        </div>
        <div className="gk-inventory-filters__field">
          <s-select label="Garments" name="filter" value={filter}>
            <s-option value="">All garments</s-option>
            <s-option value="rented">Rented in this view</s-option>
            <s-option value="hold">Active try-on hold</s-option>
          </s-select>
        </div>
        <div className="gk-inventory-filters__apply">
          <s-button type="submit" variant="primary">
            Apply filters
          </s-button>
        </div>
      </div>

      <section className="gk-inventory-filters__period" aria-labelledby="inventory-rental-period">
        <div className="gk-inventory-filters__period-body" id="inventory-rental-period">
          <div className="gk-inventory-filters__period-meta">
            <span className="gk-inventory-filters__section-title">Rental period</span>
            {hasDateRange ? (
              <span className="gk-inventory-filters__active-range">
                {formatDisplayDate(dateRangeFrom)} – {formatDisplayDate(dateRangeTo)}
              </span>
            ) : (
              <span className="gk-inventory-filters__period-hint">All time</span>
            )}
          </div>
          <div className="gk-inventory-filters__match">
            <s-select label="Match rentals by" name="dateField" value={dateField}>
              {DATE_FIELDS.map((field) => (
                <s-option key={field.value} value={field.value}>
                  {field.label}
                </s-option>
              ))}
            </s-select>
          </div>
          <InventoryDateRangeCalendar
            key={`${datePreset}-${dateFrom}-${dateTo}`}
            initialFrom={dateFrom}
            initialTo={dateTo}
            onClear={onClearDates}
          />
        </div>
      </section>
    </Form>
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
    datePreset,
    dateField,
    dateFrom,
    dateTo,
    dateRangeLabel,
    dateRangeFrom,
    dateRangeTo,
    total,
    page,
    totalPages,
    pageStart,
    pageEnd,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submitIntent =
    navigation.state === "submitting"
      ? String(navigation.formData?.get("intent") ?? "sync")
      : null;
  const isSyncing = submitIntent === "sync";
  const isExporting = submitIntent === "export";

  const listPagination = useMemo(
    () => buildListPagination(total, page, INVENTORY_PAGE_SIZE),
    [total, page],
  );

  return (
    <s-page heading="Inventory & Bookings" inlineSize="large">
      <div className="gk-admin-page">
        <p className="gk-admin-guide">
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

        {datePreset !== "all" ? (
          <s-banner tone="info">
            Times rented, revenue, and profit reflect confirmed and pending hires in
            the selected date range. Try-on holds and next available are current.
          </s-banner>
        ) : null}

        <div className="gk-admin-metrics gk-admin-metrics--5">
          <AdminMetricCard label="Garments" value={summary.variantCount} />
          <AdminMetricCard
            label={datePreset !== "all" ? "Times rented (period)" : "Times rented"}
            value={summary.totalTimesRented}
          />
          <AdminMetricCard label="Try-on holds" value={summary.activeHolds} />
          <AdminMetricCard
            label={datePreset !== "all" ? "Revenue (period)" : "Revenue"}
            value={summary.totalRevenueLabel}
          />
          <AdminMetricCard
            label={datePreset !== "all" ? "Profit (period)" : "Profit"}
            value={summary.totalProfitLabel}
          />
        </div>

        <section className="gk-admin-panel" aria-label="Inventory filters">
          <div className="gk-admin-panel__toolbar">
            <span className="gk-admin-panel__toolbar-meta">
              {total === 0
                ? "No garments in this view"
                : totalPages > 1
                  ? `Showing ${pageStart}–${pageEnd} of ${total} garments`
                  : `${total} garment${total === 1 ? "" : "s"} in this view`}
            </span>
            <div className="gk-admin-panel__toolbar-actions">
              <Form method="post">
                <input type="hidden" name="intent" value="sync" />
                <s-button
                  type="submit"
                  variant="secondary"
                  {...(isSyncing ? { loading: true } : {})}
                >
                  Sync orders
                </s-button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="export" />
                <input type="hidden" name="q" value={search} />
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="filter" value={filter} />
                <input type="hidden" name="dateField" value={dateField} />
                <input type="hidden" name="datePreset" value={datePreset} />
                <input type="hidden" name="dateFrom" value={dateFrom} />
                <input type="hidden" name="dateTo" value={dateTo} />
                <s-button
                  type="submit"
                  variant="secondary"
                  {...(isExporting ? { loading: true } : {})}
                >
                  Export CSV
                </s-button>
              </Form>
            </div>
          </div>

          <InventoryFiltersForm
            search={search}
            sort={sort}
            filter={filter}
            datePreset={datePreset}
            dateField={dateField}
            dateFrom={dateFrom}
            dateTo={dateTo}
            dateRangeLabel={dateRangeLabel}
            dateRangeFrom={dateRangeFrom}
            dateRangeTo={dateRangeTo}
            onClearDates={() => navigate(buildInventoryClearDatesUrl(searchParams))}
          />
        </section>

        <section className="gk-admin-panel" aria-label="Garment list">
          {total === 0 ? (
            <div className="gk-admin-empty">
              <p className="gk-admin-empty__title">No garments match</p>
              <p className="gk-admin-empty__lede">
                Try another search, filter, or date range.
              </p>
            </div>
          ) : (
            <>
              <ListPaginationBar
                meta={listPagination}
                label="Garments"
                onPageChange={(nextPage) => {
                  const next = new URLSearchParams(searchParams);
                  next.set("page", String(nextPage));
                  navigate(`/app/inventory?${next.toString()}`);
                }}
              />
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
              <ListPaginationBar
                meta={listPagination}
                label="Garments"
                onPageChange={(nextPage) => {
                  const next = new URLSearchParams(searchParams);
                  next.set("page", String(nextPage));
                  navigate(`/app/inventory?${next.toString()}`);
                }}
              />
            </>
          )}
        </section>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
