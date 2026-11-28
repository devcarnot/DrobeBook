import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { Link } from "react-router";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import adminPagesStyles from "../styles/admin-pages.css?url";
import {
  formatWeekdayMask,
  parseWeekdayMaskFromForm,
  WEEKDAY_LABELS,
  WEEKLY_BLOCK_VALID_FROM,
  WEEKLY_BLOCK_VALID_UNTIL,
} from "../lib/blocked-dates.logic";
import {
  createBlockedDate,
  createWeeklyBlockedDays,
  deleteBlockedDate,
  listBlockedDates,
  type BlockedDateRecord,
} from "../lib/blocked-dates.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const links = () => [{ rel: "stylesheet", href: adminPagesStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const blockedDates = await listBlockedDates(session.shop);

  return { blockedDates };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "create-range");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    if (id) {
      await deleteBlockedDate(session.shop, id);
    }
    return { deleted: true };
  }

  if (intent === "create-weekly") {
    const weekdayMask = parseWeekdayMaskFromForm(formData);
    const reason = String(formData.get("reason") ?? "");
    const appliesToHire = formData.get("appliesToHire") === "on";
    const appliesToTryOn = formData.get("appliesToTryOn") === "on";
    const appliesToPost = formData.get("appliesToPost") === "on";
    const appliesToPickup = formData.get("appliesToPickup") === "on";
    const validFrom = String(formData.get("validFrom") ?? "").trim();
    const validUntil = String(formData.get("validUntil") ?? "").trim();

    try {
      await createWeeklyBlockedDays(session.shop, {
        weekdayMask,
        reason,
        appliesToHire,
        appliesToTryOn,
        appliesToPost: appliesToHire ? appliesToPost : false,
        appliesToPickup: appliesToHire ? appliesToPickup : false,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
      });
      return { createdWeekly: true };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Could not save weekly block.",
      };
    }
  }

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? formData.get("startDate") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const appliesToHire = formData.get("appliesToHire") === "on";
  const appliesToTryOn = formData.get("appliesToTryOn") === "on";
  const appliesToPost = formData.get("appliesToPost") === "on";
  const appliesToPickup = formData.get("appliesToPickup") === "on";

  if (!startDate) {
    return { error: "Please choose a start date." };
  }

  if (endDate < startDate) {
    return { error: "End date must be on or after the start date." };
  }

  if (!appliesToHire && !appliesToTryOn) {
    return { error: "Select at least one booking type (hire or try-on)." };
  }

  await createBlockedDate(session.shop, {
    startDate,
    endDate,
    reason,
    blockKind: "range",
    appliesToHire,
    appliesToTryOn,
    appliesToPost: appliesToHire ? appliesToPost : true,
    appliesToPickup: appliesToHire ? appliesToPickup : true,
  });

  return { created: true };
};

function formatDisplayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRange(startDate: string, endDate: string) {
  if (startDate === endDate) {
    return formatDisplayDate(startDate);
  }
  return `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
}

function formatApplies(entry: {
  appliesToHire: boolean;
  appliesToTryOn: boolean;
  appliesToPost?: boolean;
  appliesToPickup?: boolean;
}): string {
  const parts: string[] = [];
  if (entry.appliesToHire) {
    const hireParts: string[] = [];
    if (entry.appliesToPost !== false) hireParts.push("Express post");
    if (entry.appliesToPickup) hireParts.push("Studio pickup");
    parts.push(
      hireParts.length ? `Hire (${hireParts.join(", ")})` : "Hire",
    );
  }
  if (entry.appliesToTryOn) parts.push("Try-on");
  return parts.length ? parts.join(", ") : "—";
}

function describeBlock(entry: BlockedDateRecord) {
  if (entry.blockKind === "weekly" && entry.weekdayMask != null) {
    const days = formatWeekdayMask(entry.weekdayMask);
    const range =
      entry.startDate === WEEKLY_BLOCK_VALID_FROM &&
      entry.endDate === WEEKLY_BLOCK_VALID_UNTIL
        ? "Every week"
        : `${formatRange(entry.startDate, entry.endDate)}`;
    return `Every ${days} (${range})`;
  }
  return formatRange(entry.startDate, entry.endDate);
}

export default function BlockedDatesPage() {
  const { blockedDates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const deletingId = navigation.formData?.get("id");

  return (
    <s-page heading="Blocked dates" inlineSize="large">
      <div className="gk-admin-page">
        {actionData?.error ? (
          <s-banner tone="critical">{actionData.error}</s-banner>
        ) : null}
        {actionData?.created ? (
          <s-banner tone="success">Blocked date range added.</s-banner>
        ) : null}
        {actionData?.createdWeekly ? (
          <s-banner tone="success">Recurring weekday block added.</s-banner>
        ) : null}
        {actionData?.deleted ? (
          <s-banner tone="success">Blocked rule removed.</s-banner>
        ) : null}

        <div className="gk-admin-hero">
          <span className="gk-admin-hero__icon" aria-hidden="true">
            📅
          </span>
          <div className="gk-admin-hero__body">
            <h2 className="gk-admin-hero__title">Shop-wide blackouts</h2>
            <p className="gk-admin-hero__lede">
              Block specific dates or recurring weekdays. Hire rules stop delivery
              starting on those days for the methods you select (the dress may still
              be out on a blocked weekday in between). Try-on rules close appointment
              days. Buffer / lead-time settings live under Booking buffers.
            </p>
            <Link className="gk-admin-hero__link" to="/app/inventory">
              Garment-specific hire holds →
            </Link>
          </div>
        </div>

        <div className="gk-admin-split">
          <section className="gk-admin-panel" aria-label="Block date range">
            <div className="gk-admin-panel__head">
              <div>
                <h3 className="gk-admin-panel__title">Block date range</h3>
                <p className="gk-admin-panel__lede">
                  Holidays, maintenance, or closures. Choose which booking types
                  this applies to.
                </p>
              </div>
            </div>

            <Form method="post" className="gk-admin-form-stack">
              <input type="hidden" name="intent" value="create-range" />
              <div className="gk-blocked-dates-fields">
                <ResponsiveGrid layout="2" gap="base" alignItems="end">
                  <s-date-field label="Start date" name="startDate" required />
                  <s-date-field label="End date" name="endDate" />
                </ResponsiveGrid>
                <s-text-field
                  label="Reason (optional)"
                  name="reason"
                  placeholder="e.g. Public holiday"
                />
              </div>
              <div className="gk-admin-check-row">
                <label>
                  <input type="checkbox" name="appliesToHire" defaultChecked />
                  Hire bookings
                </label>
                <label>
                  <input type="checkbox" name="appliesToTryOn" defaultChecked />
                  Try-on appointments
                </label>
              </div>
              <div className="gk-admin-check-row">
                <label>
                  <input type="checkbox" name="appliesToPost" defaultChecked />
                  Express postage hire
                </label>
                <label>
                  <input type="checkbox" name="appliesToPickup" />
                  Studio pickup hire
                </label>
              </div>
              <s-button
                type="submit"
                variant="primary"
                {...(isSubmitting ? { loading: true } : {})}
              >
                Add date range
              </s-button>
            </Form>
          </section>

          <section className="gk-admin-panel" aria-label="Block weekdays">
            <div className="gk-admin-panel__head">
              <div>
                <h3 className="gk-admin-panel__title">Block weekdays (recurring)</h3>
                <p className="gk-admin-panel__lede">
                  e.g. weekends for express post. Optional valid-from / valid-until
                  dates limit how long the rule runs.
                </p>
              </div>
            </div>

            <Form method="post" className="gk-admin-form-stack">
              <input type="hidden" name="intent" value="create-weekly" />
              <div>
                <p className="gk-admin-panel__subheading">Days of week</p>
                <div className="gk-admin-check-row">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <label key={label}>
                      <input type="checkbox" name="weekdays" value={index} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="gk-blocked-dates-fields">
                <ResponsiveGrid layout="2" gap="base" alignItems="end">
                  <s-date-field label="Valid from (optional)" name="validFrom" />
                  <s-date-field label="Valid until (optional)" name="validUntil" />
                </ResponsiveGrid>
                <s-text-field
                  label="Reason (optional)"
                  name="reason"
                  placeholder="e.g. Closed weekends"
                />
              </div>
              <div className="gk-admin-check-row">
                <label>
                  <input type="checkbox" name="appliesToHire" defaultChecked />
                  Hire bookings
                </label>
                <label>
                  <input type="checkbox" name="appliesToTryOn" defaultChecked />
                  Try-on appointments
                </label>
              </div>
              <div className="gk-admin-check-row">
                <label>
                  <input type="checkbox" name="appliesToPost" defaultChecked />
                  Express postage hire
                </label>
                <label>
                  <input type="checkbox" name="appliesToPickup" />
                  Studio pickup hire
                </label>
              </div>
              <s-button type="submit" variant="primary">
                Add weekday rule
              </s-button>
            </Form>
          </section>
        </div>

        <section className="gk-admin-panel" aria-label="Current blocked rules">
          <div className="gk-admin-panel__head">
            <h3 className="gk-admin-panel__title">Current blocked rules</h3>
          </div>

          {blockedDates.length === 0 ? (
            <div className="gk-admin-empty">
              <p className="gk-admin-empty__title">No blocked rules yet</p>
              <p className="gk-admin-empty__lede">
                Add a date range or weekday rule above.
              </p>
            </div>
          ) : (
            <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Rule</s-table-header>
                  <s-table-header listSlot="labeled">Type</s-table-header>
                  <s-table-header listSlot="labeled">Applies to</s-table-header>
                  <s-table-header listSlot="labeled">Reason</s-table-header>
                  <s-table-header listSlot="secondary">Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {blockedDates.map((entry) => (
                    <s-table-row key={entry.id}>
                      <s-table-cell>{describeBlock(entry)}</s-table-cell>
                      <s-table-cell>
                        {entry.blockKind === "weekly" ? "Weekdays" : "Date range"}
                      </s-table-cell>
                      <s-table-cell>{formatApplies(entry)}</s-table-cell>
                      <s-table-cell>{entry.reason || "—"}</s-table-cell>
                      <s-table-cell>
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={entry.id} />
                          <s-button
                            type="submit"
                            variant="tertiary"
                            tone="critical"
                            {...(isSubmitting && deletingId === entry.id
                              ? { loading: true }
                              : {})}
                          >
                            Remove
                          </s-button>
                        </Form>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
            </s-table>
          )}
        </section>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};