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

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "—";
  }

  return value.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: WaitlistStatus): "warning" | "info" | "success" | "neutral" {
  if (status === "fulfilled") {
    return "success";
  }
  if (status === "contacted") {
    return "info";
  }
  if (status === "removed") {
    return "neutral";
  }
  return "warning";
}

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
              Send automated availability emails, remove entries with notification, and track status.
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
              <s-box
                key={entry.id}
                padding="large"
                background="base"
                border="base"
                borderRadius="large"
              >
                <s-stack direction="block" gap="base">
                  <s-stack
                    direction="inline"
                    gap="large"
                    alignItems="start"
                    justifyContent="space-between"
                  >
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <s-text type="strong">{entry.email}</s-text>
                        <s-badge tone={statusTone(entry.status)}>{entry.status}</s-badge>
                        <s-badge tone={entry.kind === "try_on" ? "info" : "neutral"}>
                          {entry.kind === "try_on" ? "Try-on" : "Hire"}
                        </s-badge>
                      </s-stack>
                      {entry.name ? (
                        <s-text tone="neutral">{entry.name}</s-text>
                      ) : null}
                      {entry.phone ? (
                        <s-text tone="neutral">{entry.phone}</s-text>
                      ) : null}
                      {entry.pronouns ? (
                        <s-text tone="neutral" color="subdued">
                          {entry.pronouns}
                        </s-text>
                      ) : null}
                      <s-text tone="neutral" color="subdued">
                        Submitted {formatDateTime(entry.createdAt)}
                        {entry.claimIsActive && entry.claimExpiresAt
                          ? ` · Priority access until ${formatDateTime(entry.claimExpiresAt)}`
                          : entry.notifiedAt
                            ? ` · Notified ${formatDateTime(entry.notifiedAt)}`
                            : ""}
                      </s-text>
                    </s-stack>

                    <s-stack direction="inline" gap="small">
                      {entry.status === "waiting" ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="notify-availability" />
                          <input type="hidden" name="id" value={entry.id} />
                          <s-button
                            type="submit"
                            variant="primary"
                            {...(isSubmitting ? { loading: true } : {})}
                          >
                            Send availability email
                          </s-button>
                        </Form>
                      ) : null}
                      <s-link href={entry.mailtoUrl} target="_blank">
                        <s-button variant="secondary" icon="email">
                          Compose
                        </s-button>
                      </s-link>
                    </s-stack>
                  </s-stack>

                  <s-box padding="base" background="subdued" borderRadius="base">
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">{entry.productTitle}</s-text>
                      <s-text tone="neutral" color="subdued">
                        Product ID {entry.productId}
                        {entry.size ? ` · Size ${entry.size}` : ""}
                        {entry.eventDate ? ` · Event ${formatDate(entry.eventDate)}` : ""}
                        {entry.preferredDate
                          ? ` · Try-on ${formatDate(entry.preferredDate)}${entry.preferredTime ? ` ${entry.preferredTime}` : ""}`
                          : ""}
                        {entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ""}
                      </s-text>
                      <s-stack direction="inline" gap="small">
                        <s-link href={entry.adminProductUrl} target="_blank">
                          Open in Shopify
                        </s-link>
                        {entry.storefrontProductUrl ? (
                          <s-link href={entry.storefrontProductUrl} target="_blank">
                            View on storefront
                          </s-link>
                        ) : null}
                        <s-link href={`/app/inventory/detail?productId=${entry.productId}${entry.variantId ? `&variantId=${entry.variantId}` : ""}`}>
                          Inventory calendar
                        </s-link>
                      </s-stack>
                    </s-stack>
                  </s-box>

                  {entry.notes ? (
                    <s-box padding="base" background="subdued" borderRadius="base">
                      <s-text tone="neutral">{entry.notes}</s-text>
                    </s-box>
                  ) : null}

                  <s-stack direction="inline" gap="small">
                    {entry.status !== "contacted" && entry.status !== "fulfilled" ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="mark-contacted" />
                        <input type="hidden" name="id" value={entry.id} />
                        <s-button
                          type="submit"
                          variant="secondary"
                          {...(isSubmitting ? { loading: true } : {})}
                        >
                          Mark contacted
                        </s-button>
                      </Form>
                    ) : null}
                    {entry.status !== "fulfilled" ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="mark-fulfilled" />
                        <input type="hidden" name="id" value={entry.id} />
                        <s-button
                          type="submit"
                          variant="tertiary"
                          {...(isSubmitting ? { loading: true } : {})}
                        >
                          Mark fulfilled
                        </s-button>
                      </Form>
                    ) : null}
                    {entry.status !== "waiting" && entry.status !== "removed" ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="mark-waiting" />
                        <input type="hidden" name="id" value={entry.id} />
                        <s-button type="submit" variant="tertiary">
                          Reopen
                        </s-button>
                      </Form>
                    ) : null}
                    {entry.status !== "removed" ? (
                      <>
                        <Form method="post">
                          <input type="hidden" name="intent" value="remove-entry" />
                          <input type="hidden" name="id" value={entry.id} />
                          <input type="hidden" name="notifyCustomer" value="true" />
                          <s-button type="submit" variant="tertiary">
                            Remove &amp; notify
                          </s-button>
                        </Form>
                        <Form method="post">
                          <input type="hidden" name="intent" value="remove-entry" />
                          <input type="hidden" name="id" value={entry.id} />
                          <input type="hidden" name="notifyCustomer" value="false" />
                          <s-button type="submit" variant="tertiary">
                            Remove silently
                          </s-button>
                        </Form>
                      </>
                    ) : null}
                  </s-stack>
                </s-stack>
              </s-box>
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
