import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "react-router";

import {
  getWaitlistPageData,
  updateWaitlistStatus,
  waitlistEntriesToCsv,
  type WaitlistStatus,
  type WaitlistSummary,
} from "../lib/waitlist/waitlist.server";
import {
  notifyWaitlistEntryById,
  removeWaitlistEntry,
} from "../lib/waitlist/waitlist-notify.server";
import { WaitlistEntryCard } from "../components/WaitlistEntryCard";
import { WaitlistPaginationBar } from "../components/WaitlistPagination";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import waitlistStyles from "../styles/waitlist.css?url";

export const links = () => [{ rel: "stylesheet", href: waitlistStyles }];

const STATUS_FILTERS: Array<{ id: WaitlistStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "contacted", label: "Contacted" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "removed", label: "Removed" },
];

const WAITLIST_HELP =
  "Customers join from hire or try-on widgets when dates or slots are unavailable. Availability emails go out automatically when a hire opens for the customer's event date (after cancellations, or hourly via cron). You can still send manually. Book-now links open the product page.";

function parseStatusFilter(value: string | null): WaitlistStatus | "all" {
  if (
    value === "waiting" ||
    value === "contacted" ||
    value === "fulfilled" ||
    value === "removed"
  ) {
    return value;
  }
  return "all";
}

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function buildWaitlistUrl(options: {
  status: WaitlistStatus | "all";
  page?: number;
  demandPage?: number;
}): string {
  const params = new URLSearchParams();
  if (options.status !== "all") {
    params.set("status", options.status);
  }
  if (options.page && options.page > 1) {
    params.set("page", String(options.page));
  }
  if (options.demandPage && options.demandPage > 1) {
    params.set("demandPage", String(options.demandPage));
  }
  const query = params.toString();
  return query ? `/app/waitlist?${query}` : "/app/waitlist";
}

function filterCount(summary: WaitlistSummary, id: WaitlistStatus | "all"): number {
  if (id === "all") {
    return summary.total;
  }
  return summary[id];
}

function WaitlistStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "waiting" | "contacted" | "fulfilled" | "removed" | "tryon" | "total";
}) {
  const toneClass = tone ? ` gk-waitlist-stat--${tone}` : "";
  return (
    <p className={`gk-waitlist-stat${toneClass}`}>
      <span className="gk-waitlist-stat__value">{value}</span>
      <span className="gk-waitlist-stat__label">{label}</span>
    </p>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12M8 11l4 4 4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg
      className="gk-waitlist-empty__icon"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6h16v12H4V6Zm0 0 4 4h8l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WaitlistSkeleton() {
  return (
    <div className="gk-waitlist-skeleton-list" aria-hidden="true">
      {[0, 1].map((key) => (
        <div key={key} className="gk-waitlist-skeleton-card">
          <div className="gk-waitlist-skeleton-line gk-waitlist-skeleton-line--short" />
          <div className="gk-waitlist-skeleton-line gk-waitlist-skeleton-line--medium" />
          <div className="gk-waitlist-skeleton-line" />
          <div className="gk-waitlist-skeleton-line gk-waitlist-skeleton-line--medium" />
        </div>
      ))}
    </div>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = parseStatusFilter(url.searchParams.get("status"));
  const entriesPage = parsePage(url.searchParams.get("page"));
  const demandPage = parsePage(url.searchParams.get("demandPage"));

  return getWaitlistPageData(session.shop, admin, {
    status,
    entriesPage,
    demandPage,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");

  if (intent === "export-csv") {
    const status = parseStatusFilter(String(formData.get("status") ?? "all"));
    const data = await getWaitlistPageData(session.shop, admin, {
      status,
      exportAllEntries: true,
    });
    const csv = waitlistEntriesToCsv(data.entries);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (intent === "mark-contacted" && id) {
    await updateWaitlistStatus(session.shop, id, "contacted");
  }

  if (intent === "mark-fulfilled" && id) {
    await updateWaitlistStatus(session.shop, id, "fulfilled");
  }

  if (intent === "mark-waiting" && id) {
    await updateWaitlistStatus(session.shop, id, "waiting");
  }

  if (intent === "notify-availability" && id) {
    const result = await notifyWaitlistEntryById(session.shop, id);
    return result.ok
      ? { ok: true, notified: true }
      : { ok: false, error: result.error };
  }

  if (intent === "remove-entry" && id) {
    const notifyCustomer = String(formData.get("notifyCustomer") ?? "") === "true";
    const result = await removeWaitlistEntry(session.shop, id, { notifyCustomer });
    return result.ok
      ? { ok: true, removed: true }
      : { ok: false, error: result.error };
  }

  return { ok: true };
};

export default function WaitlistPage() {
  const { entries, summary, demand, entriesPagination, demandPagination } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const activeStatus = parseStatusFilter(searchParams.get("status"));
  const isSubmitting = navigation.state === "submitting";
  const isLoading = navigation.state === "loading";

  return (
    <s-page heading="Waitlist" inlineSize="large">
      <div className="gk-waitlist">
        <header className="gk-waitlist-header">
          <div>
            <div className="gk-waitlist-header__title-row">
              <span className="gk-waitlist-header__badge" aria-label={`${summary.total} entries`}>
                {summary.total}
              </span>
            </div>
            <p className="gk-waitlist-lede">
              Manage hire and try-on waitlist requests in one place. New{" "}
              <strong>waiting</strong> enquiries trigger an admin email (template on in
              Notifications) and update the count beside <strong>Waitlist</strong> in the app
              menu. Set <strong>Reply-To email</strong> in Notifications so alerts reach your
              inbox.
            </p>
          </div>
          <div className="gk-waitlist-info-wrap">
            <button
              type="button"
              className="gk-waitlist-info-btn"
              aria-label="How waitlist notifications work"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
                <path
                  d="M12 10v6M12 7h.01"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div className="gk-waitlist-tooltip" role="tooltip">
              {WAITLIST_HELP}
            </div>
          </div>
        </header>

        <section className="gk-waitlist-stats" aria-label="Waitlist summary">
          <WaitlistStat label="Waiting" value={summary.waiting} tone="waiting" />
          <WaitlistStat label="Contacted" value={summary.contacted} tone="contacted" />
          <WaitlistStat label="Fulfilled" value={summary.fulfilled} tone="fulfilled" />
          <WaitlistStat label="Removed" value={summary.removed} tone="removed" />
          <WaitlistStat label="Try-on" value={summary.tryOn} tone="tryon" />
          <WaitlistStat label="Total" value={summary.total} tone="total" />
        </section>

        {demand.length > 0 ? (
          <section className="gk-waitlist-panel" aria-labelledby="waitlist-demand-title">
            <h2 className="gk-waitlist-panel__title" id="waitlist-demand-title">
              Demand by product
            </h2>
            <div className="gk-waitlist-table-wrap">
              <table className="gk-waitlist-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Product ID</th>
                    <th scope="col" className="gk-waitlist-table__num">
                      Waiting
                    </th>
                    <th scope="col" className="gk-waitlist-table__num">
                      Notified
                    </th>
                    <th scope="col" className="gk-waitlist-table__num">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {demand.map((row) => (
                    <tr key={row.productId}>
                      <td className="gk-waitlist-table__product">{row.productTitle}</td>
                      <td className="gk-waitlist-table__id">{row.productId}</td>
                      <td className="gk-waitlist-table__num">{row.waiting}</td>
                      <td className="gk-waitlist-table__num">{row.notified}</td>
                      <td className="gk-waitlist-table__num">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="gk-waitlist-demand-cards">
              {demand.map((row) => (
                <article key={row.productId} className="gk-waitlist-demand-card">
                  <p className="gk-waitlist-demand-card__title">{row.productTitle}</p>
                  <p className="gk-waitlist-demand-card__meta">ID {row.productId}</p>
                  <div className="gk-waitlist-demand-card__nums">
                    <span>
                      Waiting <strong>{row.waiting}</strong>
                    </span>
                    <span>
                      Notified <strong>{row.notified}</strong>
                    </span>
                    <span>
                      Total <strong>{row.total}</strong>
                    </span>
                  </div>
                </article>
              ))}
            </div>
            <WaitlistPaginationBar
              meta={demandPagination}
              label="Demand by product"
              buildHref={(page) =>
                buildWaitlistUrl({
                  status: activeStatus,
                  page: entriesPagination.page,
                  demandPage: page,
                })
              }
            />
          </section>
        ) : null}

        <div className="gk-waitlist-toolbar">
          <nav className="gk-waitlist-tabs" aria-label="Filter by status">
            {STATUS_FILTERS.map((filter) => {
              const active = activeStatus === filter.id;
              const href = buildWaitlistUrl({
                status: filter.id,
                demandPage: demandPagination.page,
              });
              const count = filterCount(summary, filter.id);

              return (
                <Link
                  key={filter.id}
                  to={href}
                  className={`gk-waitlist-tab${active ? " gk-waitlist-tab--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {filter.label}
                  <span className="gk-waitlist-tab__count">{count}</span>
                </Link>
              );
            })}
          </nav>

          <div className="gk-waitlist-export">
            <Form method="post" className="gk-waitlist-export-form">
              <input type="hidden" name="intent" value="export-csv" />
              <input type="hidden" name="status" value={activeStatus} />
              <button type="submit" className="gk-waitlist-btn-ghost">
                <ExportIcon />
                Export CSV
              </button>
            </Form>
          </div>
        </div>

        {isLoading ? (
          <WaitlistSkeleton />
        ) : entries.length === 0 ? (
          <div className="gk-waitlist-empty">
            <InboxIcon />
            <p className="gk-waitlist-empty__title">No waitlist entries</p>
            <p className="gk-waitlist-empty__text">
              {activeStatus === "all"
                ? "When customers join the waitlist from your storefront, they'll appear here."
                : `No entries with status "${activeStatus}".`}
            </p>
          </div>
        ) : (
          <>
            <WaitlistPaginationBar
              meta={entriesPagination}
              label="Waitlist entries"
              buildHref={(page) =>
                buildWaitlistUrl({
                  status: activeStatus,
                  page,
                  demandPage: demandPagination.page,
                })
              }
            />
            <div className="gk-waitlist-entries">
              {entries.map((entry) => (
                <WaitlistEntryCard
                  key={entry.id}
                  entry={entry}
                  isSubmitting={isSubmitting}
                />
              ))}
            </div>
            <WaitlistPaginationBar
              meta={entriesPagination}
              label="Waitlist entries"
              buildHref={(page) =>
                buildWaitlistUrl({
                  status: activeStatus,
                  page,
                  demandPage: demandPagination.page,
                })
              }
            />
          </>
        )}
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};