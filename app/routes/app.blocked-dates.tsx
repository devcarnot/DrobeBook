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

  const date = String(formData.get("date") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!date) {
    return { error: "Please choose a date." };
  }

  await createBlockedDate(session.shop, { date, reason });
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

export default function BlockedDatesPage() {
  const { blockedDates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Blocked dates">
      {actionData?.error ? (
        <s-banner tone="critical">{actionData.error}</s-banner>
      ) : null}
      {actionData?.created ? (
        <s-banner tone="success">Blocked date added.</s-banner>
      ) : null}
      {actionData?.deleted ? (
        <s-banner tone="success">Blocked date removed.</s-banner>
      ) : null}

      <s-section heading="Add blocked date">
        <s-paragraph tone="neutral" color="subdued">
          Block shop-wide dates when gowns cannot be hired — public holidays,
          stock takes, or maintenance days.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="create" />
          <s-grid gridTemplateColumns="1fr 2fr auto" gap="base">
            <s-date-field label="Date" name="date" required />
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
                Add date
              </s-button>
            </s-box>
          </s-grid>
        </Form>
      </s-section>

      <s-section heading="Current blocked dates">
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
              <s-table-header listSlot="primary">Date</s-table-header>
              <s-table-header listSlot="labeled">Reason</s-table-header>
              <s-table-header listSlot="secondary">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {blockedDates.map((entry) => (
                <s-table-row key={entry.id}>
                  <s-table-cell>{formatDisplayDate(entry.date)}</s-table-cell>
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
      </s-section>

      <s-section slot="aside" heading="How blocking works">
        <s-paragraph>
          Blocked dates apply to all products. Customers will not be able to
          select these dates in the booking calendar on the storefront.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
