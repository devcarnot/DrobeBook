import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useLoaderData,
  useNavigate,
  useNavigation,
  useOutlet,
  useSearchParams,
} from "react-router";

import { ResponsiveGrid } from "../components/ResponsiveGrid";
import { RentalProductFilter } from "../components/RentalProductFilter";
import {
  exportRentalsCsv,
  getRentalFilterOptions,
  listRentals,
  updateRentalWorkflowStatus,
} from "../lib/rental/rental.server";
import { fetchShopifyProductById } from "../lib/rental-product/shopify-catalog.server";
import {
  parseDateField,
  parseDatePreset,
  parseListView,
  parseRentalSort,
  parseWorkflowStatus,
  RENTAL_STATUS_LABELS,
  RENTAL_STATUS_TONES,
  RENTAL_WORKFLOW_STATUSES,
  type RentalDateField,
  type RentalDatePreset,
  type RentalListItem,
  type RentalListSort,
  type RentalListView,
  type RentalWorkflowStatus,
} from "../lib/rental/rental.types";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const DATE_FIELDS: Array<{ value: RentalDateField; label: string }> = [
  { value: "dateCreated", label: "Date Created" },
  { value: "rentalStart", label: "Rental Start" },
  { value: "rentalEnd", label: "Rental End" },
];

const DATE_PRESETS: Array<{ value: RentalDatePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "thisMonth", label: "This month to date" },
  { value: "lastMonth", label: "Last month" },
  { value: "last3Months", label: "Last 3 months" },
  { value: "last6Months", label: "Last 6 months" },
  { value: "custom", label: "Custom range" },
];

const SORTS: Array<{ value: RentalListSort; label: string }> = [
  { value: "dateCreated_desc", label: "Date Created desc" },
  { value: "dateCreated_asc", label: "Date Created asc" },
  { value: "rentalStart_desc", label: "Rental Start desc" },
  { value: "rentalStart_asc", label: "Rental Start asc" },
  { value: "rentalEnd_desc", label: "Rental End desc" },
  { value: "rentalEnd_asc", label: "Rental End asc" },
];

const STATUS_TABS: Array<{ value: RentalWorkflowStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  ...RENTAL_WORKFLOW_STATUSES.map((status) => ({
    value: status,
    label: RENTAL_STATUS_LABELS[status],
  })),
];

function formatDisplayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function deliveryLabel(method: string) {
  return method === "pickup" ? "Local pickup" : "Post (shipping)";
}

function formatDateRange(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T12:00:00.000Z`);
  const end = new Date(`${endIso}T12:00:00.000Z`);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  const startLabel = start.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
  const endLabel = end.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${startLabel} – ${endLabel}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const filters = {
    search: url.searchParams.get("q") ?? "",
    workflowStatus: parseWorkflowStatus(url.searchParams.get("status")),
    deliveryMethod: url.searchParams.get("deliveryMethod") ?? "",
    productId: url.searchParams.get("productId") ?? "",
    customerEmail: url.searchParams.get("customerEmail") ?? "",
    dateField: parseDateField(url.searchParams.get("dateField")),
    datePreset: parseDatePreset(url.searchParams.get("datePreset")),
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    sort: parseRentalSort(url.searchParams.get("sort")),
    showBuffers: url.searchParams.get("showBuffers") === "1",
    view: parseListView(url.searchParams.get("view")),
    page: Number.parseInt(url.searchParams.get("page") ?? "1", 10),
  };

  const [listResult, filterOptions] = await Promise.all([
    listRentals(session.shop, filters),
    getRentalFilterOptions(session.shop),
  ]);

  let selectedProductTitle = "";
  if (filters.productId) {
    const bookingMatch = filterOptions.products.find(
      (product) => product.id === filters.productId,
    );
    if (bookingMatch?.title && bookingMatch.title !== filters.productId) {
      selectedProductTitle = bookingMatch.title;
    } else {
      try {
        const shopifyProduct = await fetchShopifyProductById(admin, filters.productId);
        selectedProductTitle = shopifyProduct?.title ?? filters.productId;
      } catch {
        selectedProductTitle = filters.productId;
      }
    }
  }

  return {
    ...listResult,
    filters,
    filterOptions,
    selectedProductTitle,
    shop: session.shop,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "export") {
    const filters = {
      search: String(formData.get("q") ?? ""),
      workflowStatus: parseWorkflowStatus(String(formData.get("status") ?? "all")),
      deliveryMethod: String(formData.get("deliveryMethod") ?? ""),
      productId: String(formData.get("productId") ?? ""),
      customerEmail: String(formData.get("customerEmail") ?? ""),
      dateField: parseDateField(String(formData.get("dateField") ?? "")),
      datePreset: parseDatePreset(String(formData.get("datePreset") ?? "")),
      dateFrom: String(formData.get("dateFrom") ?? "") || undefined,
      dateTo: String(formData.get("dateTo") ?? "") || undefined,
      sort: parseRentalSort(String(formData.get("sort") ?? "")),
    };

    const csv = await exportRentalsCsv(session.shop, filters);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rentals.csv"',
      },
    });
  }

  if (intent === "update-status") {
    const rentalId = String(formData.get("rentalId") ?? "");
    const workflowStatus = String(formData.get("workflowStatus") ?? "") as RentalWorkflowStatus;
    if (rentalId && RENTAL_WORKFLOW_STATUSES.includes(workflowStatus)) {
      await updateRentalWorkflowStatus(session.shop, rentalId, workflowStatus);
    }
    return { ok: true };
  }

  return { ok: false };
};

function RentalCard({
  rental,
  showBuffers,
}: {
  rental: RentalListItem;
  showBuffers: boolean;
}) {
  const tone = RENTAL_STATUS_TONES[rental.workflowStatus];
  const hasBuffers =
    showBuffers &&
    (rental.bufferBeforeDays != null || rental.bufferAfterDays != null);
  const showEventDate =
    rental.eventDate &&
    rental.eventDate !== rental.rentalStart &&
    rental.eventDate !== rental.rentalEnd;

  return (
    <Link to={`/app/rentals/${rental.id}`} className="gk-rental-card">
      <s-box padding="large" border="base" borderRadius="large" background="base">
        <s-stack direction="block" gap="base">
          <div className="gk-rental-card__header">
            <div className="gk-rental-card__title-wrap">
              <span className="gk-rental-card__title">
                {rental.productTitle ?? "Rental product"}
              </span>
              <span className="gk-rental-card__subtitle">
                {rental.customerName ?? "No customer"} · Size {rental.size}
              </span>
            </div>
            <s-badge tone={tone}>{RENTAL_STATUS_LABELS[rental.workflowStatus]}</s-badge>
          </div>

          <div className="gk-rental-card__period">
            <span className="gk-rental-card__period-label">Rental dates</span>
            <span className="gk-rental-card__period-value">
              {formatDateRange(rental.rentalStart, rental.rentalEnd)}
            </span>
            {showEventDate ? (
              <span className="gk-rental-card__period-event">
                Event {formatDisplayDate(rental.eventDate)}
              </span>
            ) : null}
          </div>

          <div className="gk-rental-card__footer">
            <div className="gk-rental-card__chips">
              <span className="gk-rental-card__chip">{deliveryLabel(rental.deliveryMethod)}</span>
              {rental.orderId ? (
                <span className="gk-rental-card__chip">Order #{rental.orderId}</span>
              ) : null}
              {hasBuffers ? (
                <span className="gk-rental-card__chip gk-rental-card__chip--muted">
                  Buffer {rental.bufferBeforeDays ?? 0}d / {rental.bufferAfterDays ?? 0}d
                </span>
              ) : null}
            </div>
            <span className="gk-rental-card__cta">View rental →</span>
          </div>
        </s-stack>
      </s-box>
    </Link>
  );
}

function RentalTableRow({
  rental,
  showBuffers,
}: {
  rental: RentalListItem;
  showBuffers: boolean;
}) {
  const tone = RENTAL_STATUS_TONES[rental.workflowStatus];

  return (
    <tr>
      <td style={{ padding: "0.75rem 1rem" }}>
        <s-link href={`/app/rentals/${rental.id}`}>{rental.id.slice(0, 8)}…</s-link>
      </td>
      <td style={{ padding: "0.75rem 1rem" }}>
        <s-badge tone={tone}>{RENTAL_STATUS_LABELS[rental.workflowStatus]}</s-badge>
      </td>
      <td style={{ padding: "0.75rem 1rem" }}>{rental.customerName ?? "—"}</td>
      <td style={{ padding: "0.75rem 1rem" }}>{rental.productTitle ?? "—"}</td>
      <td style={{ padding: "0.75rem 1rem" }}>{formatDisplayDate(rental.rentalStart)}</td>
      <td style={{ padding: "0.75rem 1rem" }}>{formatDisplayDate(rental.rentalEnd)}</td>
      <td style={{ padding: "0.75rem 1rem" }}>{deliveryLabel(rental.deliveryMethod)}</td>
      {showBuffers ? (
        <td style={{ padding: "0.75rem 1rem" }}>
          {(rental.bufferBeforeDays ?? 0)}/{(rental.bufferAfterDays ?? 0)}
        </td>
      ) : null}
    </tr>
  );
}

export default function RentalsRoute() {
  const outlet = useOutlet();
  if (outlet) {
    return outlet;
  }

  return <RentalsListPage />;
}

function RentalsListPage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(data.filters.search);
  const [showMoreActions, setShowMoreActions] = useState(false);

  useEffect(() => {
    setSearchInput(data.filters.search);
  }, [data.filters.search]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    setSearchParams(next);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() === data.filters.search) {
        return;
      }
      updateParam("q", searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, data.filters.search, searchParams, setSearchParams]);

  function toggleView() {
    updateParam("view", data.filters.view === "card" ? "table" : "card");
  }

  return (
    <s-page heading="Rentals" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/rentals/new")}
      >
        New Rental
      </s-button>

      <s-stack direction="block" gap="large">
        <s-box padding="large" background="subdued" borderRadius="large">
          <div className="gk-rentals-toolbar">
            <div className="gk-rentals-toolbar__meta">
              <span className="gk-rentals-toolbar__title">Rental bookings</span>
              <span className="gk-rentals-toolbar__count">
                {data.total} rental{data.total === 1 ? "" : "s"} · Manage fulfillment and returns
              </span>
            </div>
            <div className="gk-rentals-toolbar__actions">
              <s-button onClick={toggleView}>
                {data.filters.view === "card" ? "Table view" : "Card view"}
              </s-button>
              <div style={{ position: "relative" }}>
                <s-button onClick={() => setShowMoreActions((current) => !current)}>
                  More actions
                </s-button>
                {showMoreActions ? (
                  <div className="gk-filter-field__popover" style={{ right: 0, left: "auto", minWidth: "220px" }}>
                    <Form method="post">
                      <input type="hidden" name="intent" value="export" />
                      <input type="hidden" name="q" value={data.filters.search} />
                      <input type="hidden" name="status" value={data.filters.workflowStatus} />
                      <input type="hidden" name="deliveryMethod" value={data.filters.deliveryMethod} />
                      <input type="hidden" name="productId" value={data.filters.productId} />
                      <input type="hidden" name="customerEmail" value={data.filters.customerEmail} />
                      <input type="hidden" name="dateField" value={data.filters.dateField} />
                      <input type="hidden" name="datePreset" value={data.filters.datePreset} />
                      <input type="hidden" name="dateFrom" value={data.filters.dateFrom ?? ""} />
                      <input type="hidden" name="dateTo" value={data.filters.dateTo ?? ""} />
                      <input type="hidden" name="sort" value={data.filters.sort} />
                      <button type="submit" className="gk-filter-field__action">
                        Export current list to CSV
                      </button>
                    </Form>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </s-box>

        <s-box padding="large" background="base" border="base" borderRadius="large">
          <div className="gk-rentals-filters">
            <s-text-field
              label="Search rentals"
              labelAccessibilityVisibility="exclusive"
              value={searchInput}
              placeholder="Search by ID, customer, email or product"
              icon="search"
              onChange={(event) => setSearchInput(event.currentTarget.value)}
            />

            <nav aria-label="Rental status tabs" className="gk-pill-tabs">
              {STATUS_TABS.map((tab) => {
                const active = data.filters.workflowStatus === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => updateParam("status", tab.value === "all" ? "" : tab.value)}
                    style={{
                      appearance: "none",
                      border: "none",
                      background: active ? "#ffffff" : "transparent",
                      color: active ? "#202223" : "#616161",
                      font: "inherit",
                      fontSize: "13px",
                      fontWeight: active ? 600 : 550,
                      padding: "8px 16px",
                      borderRadius: "9999px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.06)" : "none",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            <div className="gk-rentals-filters__grid">
              <div className="gk-filter-field">
                <span className="gk-filter-field__label">Date range</span>
                <div className="gk-rentals-date-group">
                  <s-select
                    label="Date field"
                    labelAccessibilityVisibility="exclusive"
                    value={data.filters.dateField}
                    onChange={(event) => updateParam("dateField", event.currentTarget.value)}
                  >
                    {DATE_FIELDS.map((field) => (
                      <s-option key={field.value} value={field.value}>
                        {field.label}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select
                    label="Date preset"
                    labelAccessibilityVisibility="exclusive"
                    value={data.filters.datePreset}
                    onChange={(event) => updateParam("datePreset", event.currentTarget.value)}
                  >
                    {DATE_PRESETS.map((preset) => (
                      <s-option key={preset.value} value={preset.value}>
                        {preset.label}
                      </s-option>
                    ))}
                  </s-select>
                </div>
              </div>

              <s-select
                label="Delivery"
                value={data.filters.deliveryMethod}
                onChange={(event) => updateParam("deliveryMethod", event.currentTarget.value)}
              >
                <s-option value="">All delivery methods</s-option>
                <s-option value="post">Post (shipping)</s-option>
                <s-option value="pickup">Local pickup</s-option>
              </s-select>

              <RentalProductFilter
                productId={data.filters.productId}
                productTitle={data.selectedProductTitle}
                onSelect={(productId) => updateParam("productId", productId)}
                onClear={() => updateParam("productId", "")}
              />

              <s-select
                label="Customer"
                value={data.filters.customerEmail}
                onChange={(event) => updateParam("customerEmail", event.currentTarget.value)}
              >
                <s-option value="">All customers</s-option>
                {data.filterOptions.customers.map((customer) => (
                  <s-option key={customer.email} value={customer.email}>
                    {customer.name ? `${customer.name} (${customer.email})` : customer.email}
                  </s-option>
                ))}
              </s-select>
            </div>

            {data.filters.datePreset === "custom" ? (
              <ResponsiveGrid layout="2">
                <s-date-field
                  label="From"
                  value={data.filters.dateFrom ?? data.dateRangeFrom}
                  onChange={(event) => updateParam("dateFrom", event.currentTarget.value)}
                />
                <s-date-field
                  label="To"
                  value={data.filters.dateTo ?? data.dateRangeTo}
                  onChange={(event) => updateParam("dateTo", event.currentTarget.value)}
                />
              </ResponsiveGrid>
            ) : null}

            <div className="gk-rentals-filters__footer">
              <span className="gk-rentals-range-chip">
                {data.dateRangeLabel} · {formatDisplayDate(data.dateRangeFrom)} –{" "}
                {formatDisplayDate(data.dateRangeTo)}
              </span>

              <div className="gk-rentals-toolbar__actions">
                <label className="gk-rentals-toggle">
                  <input
                    type="checkbox"
                    checked={data.filters.showBuffers}
                    onChange={(event) =>
                      updateParam("showBuffers", event.currentTarget.checked ? "1" : "")
                    }
                  />
                  Show buffers
                </label>

                <div className="gk-rentals-sort">
                  <s-select
                    label="Sort"
                    labelAccessibilityVisibility="exclusive"
                    value={data.filters.sort}
                    onChange={(event) => updateParam("sort", event.currentTarget.value)}
                  >
                    {SORTS.map((sort) => (
                      <s-option key={sort.value} value={sort.value}>
                        {sort.label}
                      </s-option>
                    ))}
                  </s-select>
                </div>
              </div>
            </div>
          </div>
        </s-box>

        {data.rentals.length === 0 ? (
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-text type="strong">No rentals were found</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Try adjusting your search term, filters or date range.
              </s-paragraph>
              <s-button variant="primary" onClick={() => navigate("/app/rentals/new")}>
                New Rental
              </s-button>
            </s-stack>
          </s-box>
        ) : data.filters.view === "table" ? (
          <s-box padding="none" background="base" border="base" borderRadius="large">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ background: "#f6f6f7", textAlign: "left" }}>
                    {["ID", "Status", "Customer", "Product", "Start", "End", "Delivery", ...(data.filters.showBuffers ? ["Buffers"] : [])].map((heading) => (
                      <th key={heading} style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rentals.map((rental) => (
                    <RentalTableRow
                      key={rental.id}
                      rental={rental}
                      showBuffers={data.filters.showBuffers}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </s-box>
        ) : (
          <ResponsiveGrid layout="2" gap="large" alignItems="start">
            {data.rentals.map((rental) => (
              <RentalCard
                key={rental.id}
                rental={rental}
                showBuffers={data.filters.showBuffers}
              />
            ))}
          </ResponsiveGrid>
        )}

        {data.totalPages > 1 ? (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button
              disabled={data.page <= 1}
              onClick={() => updateParam("page", String(data.page - 1))}
            >
              Previous
            </s-button>
            <s-text tone="neutral" color="subdued">
              Page {data.page} of {data.totalPages} · {data.total} rental
              {data.total === 1 ? "" : "s"}
            </s-text>
            <s-button
              disabled={data.page >= data.totalPages}
              onClick={() => updateParam("page", String(data.page + 1))}
            >
              Next
            </s-button>
          </s-stack>
        ) : (
          <s-text tone="neutral" color="subdued">
            {data.total} rental{data.total === 1 ? "" : "s"} in this view
          </s-text>
        )}
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
