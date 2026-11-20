import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { ResponsiveGrid } from "../components/ResponsiveGrid";
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
    const validFrom = String(formData.get("validFrom") ?? "").trim();
    const validUntil = String(formData.get("validUntil") ?? "").trim();

    try {
      await createWeeklyBlockedDays(session.shop, {
        weekdayMask,
        reason,
        appliesToHire,
        appliesToTryOn,
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
}): string {
  const parts: string[] = [];
  if (entry.appliesToHire) parts.push("Hire");
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
      <s-stack direction="block" gap="large">
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

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="calendar" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Shop-wide blackouts</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Block specific dates or recurring weekdays. Rules apply to the
                hire booking calendar and/or try-on appointments. Shop-wide date
                ranges also count as bank holidays when buffer settings use
                business days.
              </s-paragraph>
              <s-link href="/app/inventory">Garment-specific hire holds</s-link>
            </s-stack>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Block date range</s-text>
              <s-paragraph tone="neutral" color="subdued">
                For holidays, maintenance, or closures. Choose which booking
                types this applies to.
              </s-paragraph>
            </s-stack>

            <Form method="post">
              <input type="hidden" name="intent" value="create-range" />
              <s-stack direction="block" gap="large">
                <ResponsiveGrid layout="form-actions" alignItems="end">
                  <s-date-field label="Start date" name="startDate" required />
                  <s-date-field label="End date" name="endDate" />
                  <s-text-field
                    label="Reason (optional)"
                    name="reason"
                    placeholder="e.g. Public holiday"
                  />
                </ResponsiveGrid>
                <s-stack direction="inline" gap="large">
                  <label>
                    <input type="checkbox" name="appliesToHire" defaultChecked />{" "}
                    Hire bookings
                  </label>
                  <label>
                    <input type="checkbox" name="appliesToTryOn" defaultChecked />{" "}
                    Try-on appointments
                  </label>
                </s-stack>
                <s-box>
                  <s-button
                    type="submit"
                    variant="primary"
                    {...(isSubmitting ? { loading: true } : {})}
                  >
                    Add date range
                  </s-button>
                </s-box>
              </s-stack>
            </Form>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Block weekdays (recurring)</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Select days such as Saturday and Sunday — every matching day
                is unavailable on the storefront calendars. Optional valid-from /
                valid-until dates limit how long the rule runs.
              </s-paragraph>
            </s-stack>

            <Form method="post">
              <input type="hidden" name="intent" value="create-weekly" />
              <s-stack direction="block" gap="large">
                <s-stack direction="block" gap="small">
                  <s-text type="strong">Days of week</s-text>
                  <s-stack direction="inline" gap="large">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <label key={label}>
                        <input type="checkbox" name="weekdays" value={index} />{" "}
                        {label}
                      </label>
                    ))}
                  </s-stack>
                </s-stack>
                <ResponsiveGrid layout="form-actions" alignItems="end">
                  <s-date-field label="Valid from (optional)" name="validFrom" />
                  <s-date-field label="Valid until (optional)" name="validUntil" />
                  <s-text-field
                    label="Reason (optional)"
                    name="reason"
                    placeholder="e.g. Closed weekends"
                  />
                </ResponsiveGrid>
                <s-stack direction="inline" gap="large">
                  <label>
                    <input type="checkbox" name="appliesToHire" defaultChecked />{" "}
                    Hire bookings
                  </label>
                  <label>
                    <input type="checkbox" name="appliesToTryOn" defaultChecked />{" "}
                    Try-on appointments
                  </label>
                </s-stack>
                <s-box>
                  <s-button type="submit" variant="primary">
                    Add weekday rule
                  </s-button>
                </s-box>
              </s-stack>
            </Form>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-text type="strong">Current blocked rules</s-text>

            {blockedDates.length === 0 ? (
              <s-box padding="large" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-text type="strong">No blocked rules yet</s-text>
                  <s-paragraph tone="neutral" color="subdued">
                    Add a date range or weekday rule above.
                  </s-paragraph>
                </s-stack>
              </s-box>
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
          </s-stack>
        </s-box>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};