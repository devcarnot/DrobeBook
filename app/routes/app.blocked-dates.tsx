import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import {
  createBlockedDate,
  deleteBlockedDate,
  listBlockedDates,
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
  const intent = String(formData.get("intent") ?? "create");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    if (id) {
      await deleteBlockedDate(session.shop, id);
    }
    return { deleted: true };
  }

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? formData.get("startDate") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!startDate) {
    return { error: "Please choose a start date." };
  }

  await createBlockedDate(session.shop, { startDate, endDate, reason });
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

export default function BlockedDatesPage() {
  const { blockedDates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Blocked dates" inlineSize="large">
      <s-stack direction="block" gap="large">
        {actionData?.error ? (
          <s-banner tone="critical">{actionData.error}</s-banner>
        ) : null}
        {actionData?.created ? (
          <s-banner tone="success">Blocked date range added.</s-banner>
        ) : null}
        {actionData?.deleted ? (
          <s-banner tone="success">Blocked date removed.</s-banner>
        ) : null}

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="calendar" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Shop-wide blackouts</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Block dates when gowns cannot be hired. These also count as bank
                holidays when buffer settings use business days.
              </s-paragraph>
              <s-link href="/app/inventory">Garment-specific try-on holds</s-link>
            </s-stack>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Add blocked date</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Choose a start and optional end date. Leave reason blank for a
                generic holiday block.
              </s-paragraph>
            </s-stack>

            <Form method="post">
              <input type="hidden" name="intent" value="create" />
              <s-grid gridTemplateColumns="1fr 1fr 2fr auto" gap="large" alignItems="end">
                <s-date-field label="Start date" name="startDate" required />
                <s-date-field label="End date" name="endDate" />
                <s-text-field
                  label="Reason (optional)"
                  name="reason"
                  placeholder="e.g. Public holiday"
                />
                <s-box paddingBlockStart="large-300">
                  <s-button
                    type="submit"
                    variant="primary"
                    {...(isSubmitting ? { loading: true } : {})}
                  >
                    Add dates
                  </s-button>
                </s-box>
              </s-grid>
            </Form>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-text type="strong">Current blocked dates</s-text>

            {blockedDates.length === 0 ? (
              <s-box padding="large" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-text type="strong">No blocked dates yet</s-text>
                  <s-paragraph tone="neutral" color="subdued">
                    Add dates above to prevent bookings on holidays or maintenance
                    days.
                  </s-paragraph>
                </s-stack>
              </s-box>
            ) : (
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Dates</s-table-header>
                  <s-table-header listSlot="labeled">Reason</s-table-header>
                  <s-table-header listSlot="secondary">Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {blockedDates.map((entry) => (
                    <s-table-row key={entry.id}>
                      <s-table-cell>
                        {formatRange(entry.startDate, entry.endDate)}
                      </s-table-cell>
                      <s-table-cell>{entry.reason || "—"}</s-table-cell>
                      <s-table-cell>
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={entry.id} />
                          <s-button type="submit" variant="tertiary" tone="critical">
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
