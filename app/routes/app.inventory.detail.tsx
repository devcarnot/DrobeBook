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
  useNavigation,
  useSearchParams,
} from "react-router";
import { useState } from "react";

import { createGarmentBlockedDate } from "../lib/blocked-dates.server";
import {
  buildGarmentCalendarDays,
  currentCalendarMonth,
  getGarmentDetail,
} from "../lib/garment/garment.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const variantId = url.searchParams.get("variantId");
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");

  if (!productId || !variantId) {
    throw new Response("Missing garment", { status: 400 });
  }

  const garment = await getGarmentDetail(
    admin,
    session.shop,
    productId,
    variantId,
  );

  if (!garment) {
    throw new Response("Garment not found", { status: 404 });
  }

  const calendar = currentCalendarMonth();
  const year = yearParam ? Number.parseInt(yearParam, 10) : calendar.year;
  const month = monthParam ? Number.parseInt(monthParam, 10) : calendar.month;
  const calendarDays = buildGarmentCalendarDays(
    year,
    month,
    garment.bookings,
    garment.blockedDates,
  );

  return {
    garment,
    calendar: { year, month, days: calendarDays },
    shop: session.shop,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "block");

  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");

  if (intent === "block") {
    const startDate = String(formData.get("startDate") ?? "");
    const endDate = String(formData.get("endDate") ?? "");
    const reason = String(formData.get("reason") ?? "Try-on hold");

    if (!productId || !variantId || !startDate || !endDate) {
      return { error: "Choose a start and end date." };
    }

    if (startDate > endDate) {
      return { error: "End date must be on or after the start date." };
    }

    await createGarmentBlockedDate(session.shop, {
      productId,
      variantId,
      startDate,
      endDate,
      reason,
    });

    return { blocked: true };
  }

  return null;
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

function formatMonthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function orderAdminUrl(shop: string, orderId: string) {
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/orders/${orderId}`;
}

export default function InventoryDetailPage() {
  const { garment, calendar, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [showBlockForm, setShowBlockForm] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  const backQuery = searchParams.toString();
  const backHref = backQuery ? `/app/inventory?${backQuery}` : "/app/inventory";

  const historyEntries = [
    ...garment.bookings.map((booking) => ({
      id: booking.id,
      startDate: booking.startDate,
      endDate: booking.endDate,
      source: "Online" as const,
      detail: booking.orderId ? `Order #${booking.orderId}` : "Confirmed booking",
      orderId: booking.orderId,
      tone: "success" as const,
    })),
    ...garment.blockedDates.map((block) => ({
      id: block.id,
      startDate: block.startDate,
      endDate: block.endDate,
      source: "Manual" as const,
      detail: block.reason || "Reserved",
      orderId: null,
      tone: "warning" as const,
    })),
  ].sort((a, b) => b.startDate.localeCompare(a.startDate));

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const firstDayOffset =
    (new Date(Date.UTC(calendar.year, calendar.month - 1, 1)).getUTCDay() + 6) %
    7;

  return (
    <s-page heading={garment.productTitle} inlineSize="large">
      <s-link slot="breadcrumb-actions" href={backHref}>
        Inventory & Bookings
      </s-link>

      <s-stack direction="block" gap="large">
        {actionData?.error ? (
          <s-banner tone="critical">{actionData.error}</s-banner>
        ) : null}
        {actionData?.blocked ? (
          <s-banner tone="success">Dates reserved for this garment.</s-banner>
        ) : null}

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-grid gridTemplateColumns="auto 1fr auto" gap="large" alignItems="center">
            {garment.imageUrl ? (
              <img
                src={garment.imageUrl}
                alt=""
                width={96}
                height={96}
                style={{ objectFit: "cover", borderRadius: "0" }}
              />
            ) : null}
            <s-stack direction="block" gap="small">
              <s-heading>{garment.productTitle}</s-heading>
              <s-text tone="neutral">
                {garment.sizeLabel} · {garment.variantTitle}
              </s-text>
              {garment.nextAvailableDate ? (
                <s-text tone="neutral">
                  Next available: {formatDisplayDate(garment.nextAvailableDate)}
                </s-text>
              ) : null}
            </s-stack>
            <s-button variant="primary" onClick={() => setShowBlockForm(true)}>
              Reserve / Block Dates
            </s-button>
          </s-grid>
        </s-box>

        <s-stack direction="block" gap="base">
          <s-text type="strong">Performance</s-text>
          <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="large">
            <s-box padding="large" background="base" border="base" borderRadius="large">
              <s-stack direction="block" gap="small">
                <s-text tone="neutral">Times rented</s-text>
                <s-heading>{garment.timesRented}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="large" background="base" border="base" borderRadius="large">
              <s-stack direction="block" gap="small">
                <s-text tone="neutral">Total revenue</s-text>
                <s-heading>{garment.revenueLabel}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="large" background="base" border="base" borderRadius="large">
              <s-stack direction="block" gap="small">
                <s-text tone="neutral">Profit</s-text>
                <s-heading>{garment.profitLabel}</s-heading>
              </s-stack>
            </s-box>
          </s-grid>
        </s-stack>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack direction="inline" gap="large" alignItems="center">
              <s-text type="strong">Calendar</s-text>
              <s-badge tone="success">Booked online</s-badge>
              <s-badge tone="warning">Manually reserved</s-badge>
            </s-stack>

            <s-text type="strong">{formatMonthLabel(calendar.year, calendar.month)}</s-text>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    textAlign: "center",
                    padding: "8px 4px",
                  }}
                >
                  {label}
                </div>
              ))}
              {Array.from({ length: firstDayOffset }).map((_, index) => (
                <div key={`pad-${index}`} />
              ))}
              {calendar.days.map((day) => {
                const dayNumber = Number.parseInt(day.iso.slice(-2), 10);
                const hasBooking = day.bookings > 0;
                const hasBlock = day.blocks > 0;
                return (
                  <div
                    key={day.iso}
                    style={{
                      minHeight: "72px",
                      border: "1px solid var(--p-color-border, #dfe3e8)",
                      borderRadius: "0",
                      padding: "10px",
                      background: hasBooking
                        ? "rgba(18, 128, 92, 0.12)"
                        : hasBlock
                          ? "rgba(185, 137, 0, 0.14)"
                          : "transparent",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>
                      {dayNumber}
                    </div>
                    {hasBooking ? (
                      <s-badge tone="success">Online</s-badge>
                    ) : null}
                    {hasBlock ? (
                      <s-badge tone="warning">Manual</s-badge>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-text type="strong">Booking history</s-text>
            {historyEntries.length === 0 ? (
              <s-box padding="large" background="subdued" borderRadius="base">
                <s-text tone="neutral">No bookings or reservations yet.</s-text>
              </s-box>
            ) : (
              <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Dates</s-table-header>
              <s-table-header listSlot="labeled">Source</s-table-header>
              <s-table-header listSlot="secondary">Details</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {historyEntries.map((entry) => (
                <s-table-row key={entry.id}>
                  <s-table-cell>
                    {formatDisplayDate(entry.startDate)}
                    {entry.endDate !== entry.startDate
                      ? ` – ${formatDisplayDate(entry.endDate)}`
                      : ""}
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={entry.tone}>{entry.source}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {entry.orderId ? (
                      <Link
                        to={orderAdminUrl(shop, entry.orderId)}
                        target="_top"
                      >
                        {entry.detail}
                      </Link>
                    ) : (
                      entry.detail
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
            )}
          </s-stack>
        </s-box>

        {showBlockForm ? (
          <s-box padding="large" border="base" borderRadius="large" background="base">
            <s-stack direction="block" gap="large">
              <s-text type="strong">Reserve / Block Dates</s-text>
              <Form method="post" onSubmit={() => setShowBlockForm(false)}>
                <input type="hidden" name="intent" value="block" />
                <input type="hidden" name="productId" value={garment.productId} />
                <input type="hidden" name="variantId" value={garment.variantId} />
                <s-stack direction="block" gap="large">
                  <s-grid gridTemplateColumns="1fr 1fr" gap="large">
                    <s-date-field label="Start date" name="startDate" required />
                    <s-date-field label="End date" name="endDate" required />
                  </s-grid>
                  <s-text-field
                    label="Reason"
                    name="reason"
                    value="Try-on hold"
                    placeholder="Try-on hold"
                  />
                  <s-stack direction="inline" gap="large">
                    <s-button
                      type="submit"
                      variant="primary"
                      {...(isSubmitting ? { loading: true } : {})}
                    >
                      Confirm reservation
                    </s-button>
                    <s-button
                      type="button"
                      variant="tertiary"
                      onClick={() => setShowBlockForm(false)}
                    >
                      Cancel
                    </s-button>
                  </s-stack>
                </s-stack>
              </Form>
            </s-stack>
          </s-box>
        ) : null}
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
