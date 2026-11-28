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
} from "../lib/waitlist/waitlist.server";
import {
  notifyWaitlistEntryById,
  removeWaitlistEntry,
} from "../lib/waitlist/waitlist-notify.server";
import { WaitlistEntryCard } from "../components/WaitlistEntryCard";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const STATUS_FILTERS: Array<{ id: WaitlistStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "contacted", label: "Contacted" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "removed", label: "Removed" },
];

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = parseStatusFilter(url.searchParams.get("status"));

  return getWaitlistPageData(session.shop, admin, { status });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");

  if (intent === "export-csv") {
    const status = parseStatusFilter(String(formData.get("status") ?? "all"));
    const data = await getWaitlistPageData(session.shop, admin, { status });
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
  const { entries, summary, demand } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const activeStatus = parseStatusFilter(searchParams.get("status"));
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading={`Waitlist (${summary.total})`} inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">Customer waitlist requests</s-text>
            <s-paragraph tone="neutral" color="subdued">
              Customers join from hire or try-on widgets when dates or slots are unavailable.
              Availability emails go out automatically when a hire opens for the customer&apos;s event date (after cancellations, or hourly via cron). You can still send manually. Book-now links open the product page.
            </s-paragraph>
          </s-stack>
        </s-box>

        <s-stack direction="inline" gap="small" alignItems="center">
          <s-badge tone="warning">{summary.waiting} waiting</s-badge>
          <s-badge tone="info">{summary.contacted} contacted</s-badge>
          <s-badge tone="success">{summary.fulfilled} fulfilled</s-badge>
          <s-badge tone="neutral">{summary.removed} removed</s-badge>
          <s-badge>{summary.tryOn} try-on</s-badge>
          <s-badge>{summary.total} total</s-badge>
        </s-stack>

        {demand.length > 0 ? (
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="large">
              <s-text type="strong">Demand by product</s-text>
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Product</s-table-header>
                  <s-table-header listSlot="labeled">Product ID</s-table-header>
                  <s-table-header listSlot="labeled">Waiting</s-table-header>
                  <s-table-header listSlot="labeled">Notified</s-table-header>
                  <s-table-header listSlot="secondary">Total</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {demand.map((row) => (
                    <s-table-row key={row.productId}>
                      <s-table-cell>{row.productTitle}</s-table-cell>
                      <s-table-cell>{row.productId}</s-table-cell>
                      <s-table-cell>{row.waiting}</s-table-cell>
                      <s-table-cell>{row.notified}</s-table-cell>
                      <s-table-cell>{row.total}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-stack>
          </s-box>
        ) : null}

        <s-stack direction="inline" gap="small" alignItems="center" justifyContent="space-between">
          <s-stack direction="inline" gap="small">
            {STATUS_FILTERS.map((filter) => {
              const active = activeStatus === filter.id;
              const href =
                filter.id === "all"
                  ? "/app/waitlist"
                  : `/app/waitlist?status=${filter.id}`;

              return (
                <Link key={filter.id} to={href} style={{ textDecoration: "none" }}>
                  <s-button variant={active ? "primary" : "secondary"}>
                    {filter.label}
                  </s-button>
                </Link>
              );
            })}
          </s-stack>

          <Form method="post">
            <input type="hidden" name="intent" value="export-csv" />
            <input type="hidden" name="status" value={activeStatus} />
            <s-button type="submit" variant="tertiary" icon="export">
              Export CSV
            </s-button>
          </Form>
        </s-stack>

        {entries.length === 0 ? (
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-text tone="neutral">
              {activeStatus === "all"
                ? "No waitlist entries yet."
                : `No ${activeStatus} waitlist entries.`}
            </s-text>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {entries.map((entry) => (
              <WaitlistEntryCard
                key={entry.id}
                entry={entry}
                isSubmitting={isSubmitting}
              />
            ))}
          </s-stack>
        )}
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
