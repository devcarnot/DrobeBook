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
import { useEffect, useState } from "react";

import { AdminTryOnBookingModal } from "../components/AdminTryOnBookingModal";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import { createAdminAppointmentBooking } from "../lib/appointment/appointment-admin.server";
import {
  allowedAppointmentDurationMinutes,
  parseAppointmentDurationMinutes,
} from "../lib/appointment/appointment-durations";
import { shiftMonth } from "../lib/booking/rental-calendar";
import {
  createGarmentBlockedDate,
  deleteBlockedDate,
} from "../lib/blocked-dates.server";
import { saveGarmentCostSettings } from "../lib/garment/garment-stats.server";
import { getShopConfig } from "../lib/shop-settings.server";
import {
  buildGarmentCalendarDays,
  currentCalendarMonth,
  getGarmentDetail,
} from "../lib/garment/garment.server";
import { notifyNextWaitlistForGarment } from "../lib/waitlist/waitlist-notify.server";
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

  const shopConfig = await getShopConfig(session.shop);
  const garment = await getGarmentDetail(
    admin,
    session.shop,
    productId,
    variantId,
    {
      tryOnVariantId: shopConfig.appointment.tryOnVariantId,
      tryOnProductTitle: shopConfig.appointment.tryOnProductTitle,
    },
  );

  if (!garment) {
    throw new Response("Garment not found", { status: 404 });
  }

  const defaults = currentCalendarMonth();
  const year = yearParam ? Number.parseInt(yearParam, 10) : defaults.year;
  const month = monthParam ? Number.parseInt(monthParam, 10) : defaults.month;
  const calendarDays = buildGarmentCalendarDays(
    year,
    month,
    garment.bookings,
    garment.blockedDates,
    garment.shopWideBlocks,
    garment.tryOnAppointments,
  );

  return {
    garment,
    appointmentConfig: shopConfig.appointment,
    calendar: {
      year,
      month,
      days: calendarDays,
      prev: shiftMonth(year, month, -1),
      next: shiftMonth(year, month, 1),
    },
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

  if (intent === "delete-block") {
    const blockId = String(formData.get("blockId") ?? "");
    if (!blockId) {
      return { error: "Missing reservation to remove." };
    }

    const removed = await deleteBlockedDate(session.shop, blockId);
    if (removed?.productId && removed.variantId) {
      await notifyNextWaitlistForGarment(
        session.shop,
        removed.productId,
        removed.variantId,
      );
    }

    return { deleted: true, waitlistNotified: Boolean(removed?.productId) };
  }

  if (intent === "save-costs") {
    if (!productId || !variantId) {
      return { error: "Missing garment." };
    }

    await saveGarmentCostSettings(session.shop, productId, variantId, {
      purchaseCostOverride: String(formData.get("purchaseCostOverride") ?? ""),
      cleaningCostPerHire: String(formData.get("cleaningCostPerHire") ?? ""),
    });

    return { costsSaved: true };
  }

  if (intent === "book-try-on") {
    const shopConfig = await getShopConfig(session.shop);
    const appointmentDate = String(formData.get("appointmentDate") ?? "").trim();
    const appointmentTime = String(formData.get("appointmentTime") ?? "").trim();
    const durationMinutes = parseAppointmentDurationMinutes(
      String(formData.get("durationMinutes") ?? ""),
      allowedAppointmentDurationMinutes(shopConfig.appointment.appointmentDurations),
    );
    const customerName = String(formData.get("customerName") ?? "").trim();
    const availabilityChecked = formData.get("availabilityChecked") === "true";

    if (!appointmentDate || !appointmentTime || !durationMinutes) {
      return { error: "Choose an appointment date and time." };
    }

    if (!customerName) {
      return { error: "Customer name is required." };
    }

    if (!availabilityChecked) {
      return { error: "Confirm availability for the customer's event date." };
    }

    const activeTerms = (shopConfig.appointment.tryOnTerms ?? []).filter(
      (entry) => entry.label?.trim(),
    );
    for (const [index, term] of activeTerms.entries()) {
      const termId = term.id || `term-${index + 1}`;
      if (formData.get(`term_${termId}`) !== "true") {
        return { error: "Accept all try-on terms before confirming." };
      }
    }

    const result = await createAdminAppointmentBooking({
      shop: session.shop,
      date: appointmentDate,
      time: appointmentTime,
      durationMinutes,
      customerName,
      customerEmail: String(formData.get("customerEmail") ?? ""),
      eventDate: String(formData.get("eventDate") ?? ""),
      itemsToTryOn: String(formData.get("itemsToTryOn") ?? ""),
      instagram: String(formData.get("instagram") ?? ""),
      gownProductId: productId,
      gownVariantId: variantId,
      config: shopConfig.appointment,
    });

    if ("error" in result) {
      return { error: result.error };
    }

    return { appointmentBooked: true };
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

function formatMoney(amount: number, currencyCode: string | null) {
  if (currencyCode === "AUD" || !currencyCode) {
    return `$${amount.toFixed(2)}`;
  }
  return `${currencyCode} ${amount.toFixed(2)}`;
}

function orderAdminUrl(shop: string, orderId: string) {
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/orders/${orderId}`;
}

function bookingStatusLabel(status: string) {
  if (status === "confirmed") {
    return "Confirmed";
  }
  if (status === "pending") {
    return "Pending checkout";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  return status;
}

function bookingStatusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  if (status === "confirmed") {
    return "success";
  }
  if (status === "cancelled") {
    return "critical";
  }
  if (status === "pending") {
    return "info";
  }
  return "warning";
}

function calendarNavHref(
  productId: string,
  variantId: string,
  year: number,
  month: number,
  searchParams: URLSearchParams,
) {
  const params = new URLSearchParams(searchParams);
  params.set("productId", productId);
  params.set("variantId", variantId);
  params.set("year", String(year));
  params.set("month", String(month));
  return `/app/inventory/detail?${params.toString()}`;
}

export default function InventoryDetailPage() {
  const { garment, calendar, shop, appointmentConfig } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [showTryOnModal, setShowTryOnModal] = useState(false);
  const isSubmitting = navigation.state === "submitting";
  const submittingBlockId = navigation.formData?.get("blockId");

  useEffect(() => {
    if (actionData?.appointmentBooked) {
      setShowTryOnModal(false);
    }
  }, [actionData?.appointmentBooked]);

  const backQuery = searchParams.toString();
  const backHref = backQuery ? `/app/inventory?${backQuery}` : "/app/inventory";

  const confirmedCount = garment.bookings.filter(
    (booking) => booking.status === "confirmed",
  ).length;
  const pendingCount = garment.bookings.filter(
    (booking) => booking.status === "pending",
  ).length;

  const historyEntries = [
    ...garment.tryOnAppointments.map((appointment) => ({
      id: appointment.id,
      startDate: appointment.date,
      endDate: appointment.date,
      source: "Try-on appointment" as const,
      status: appointment.source === "admin" ? "admin" : "confirmed",
      customerLabel:
        appointment.customerName ||
        appointment.customerEmail ||
        "Try-on customer",
      detail: appointment.itemsToTryOn || `${appointment.time} · ${appointment.durationMinutes} min`,
      orderId: appointment.orderId,
      revenue: null as number | null,
      canDelete: false,
      blockId: null as string | null,
    })),
    ...garment.bookings.map((booking) => ({
      id: booking.id,
      startDate: booking.startDate,
      endDate: booking.endDate,
      source: booking.source === "manual" ? ("Manual" as const) : ("Online" as const),
      status: booking.status,
      customerLabel:
        booking.customerName ||
        booking.customerEmail ||
        (booking.source === "manual" ? "In-store customer" : "—"),
      detail: booking.orderId
        ? `Order #${booking.orderId}`
        : booking.status === "pending"
          ? "In cart — awaiting checkout"
          : booking.source === "manual"
            ? "Manual rental"
            : "Online booking",
      orderId: booking.orderId,
      revenue: booking.pricePaid,
      canDelete: false,
      blockId: null as string | null,
    })),
    ...garment.blockedDates.map((block) => ({
      id: block.id,
      startDate: block.startDate,
      endDate: block.endDate,
      source: "Try-on hold" as const,
      status: "hold",
      detail: block.reason || "Reserved in store",
      orderId: null,
      revenue: null as number | null,
      canDelete: true,
      blockId: block.id,
    })),
  ].sort((a, b) => b.startDate.localeCompare(a.startDate));

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const firstDayOffset =
    (new Date(Date.UTC(calendar.year, calendar.month - 1, 1)).getUTCDay() + 6) %
    7;

  const unitCostLabel =
    garment.unitCost.amount != null
      ? formatMoney(garment.unitCost.amount, garment.unitCost.currencyCode)
      : garment.unitCost.available
        ? "Not set in Shopify"
        : "Unavailable (check staff permissions)";

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
          <s-banner tone="success">
            Dates reserved — this garment is blocked on the website for those
            dates.
          </s-banner>
        ) : null}
        {actionData?.deleted ? (
          <s-banner tone="success">
            Try-on hold removed.
            {actionData.waitlistNotified
              ? " The next waitlist customer has been notified with priority access."
              : ""}
          </s-banner>
        ) : null}
        {actionData?.costsSaved ? (
          <s-banner tone="success">Garment cost settings saved.</s-banner>
        ) : null}
        {actionData?.appointmentBooked ? (
          <s-banner tone="success">
            Try-on appointment booked — it now appears on the rental calendar.
          </s-banner>
        ) : null}

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <ResponsiveGrid layout="header-row" alignItems="center">
            {garment.imageUrl ? (
              <img
                src={garment.imageUrl}
                alt=""
                width={96}
                height={96}
                style={{ objectFit: "cover", borderRadius: "4px" }}
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
              ) : (
                <s-text tone="neutral" color="subdued">
                  No upcoming availability in the next year
                </s-text>
              )}
            </s-stack>
            <s-button variant="primary" onClick={() => setShowTryOnModal(true)}>
              Book try-on appointment
            </s-button>
          </ResponsiveGrid>
        </s-box>

        <ResponsiveGrid layout="4">
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral" color="subdued">
                Times rented
              </s-text>
              <s-heading>{garment.timesRented}</s-heading>
              <s-text tone="neutral" color="subdued">
                {confirmedCount} confirmed · {pendingCount} pending
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral" color="subdued">
                Total revenue
              </s-text>
              <s-heading>{garment.revenueLabel}</s-heading>
              <s-text tone="neutral" color="subdued">
                From confirmed hires
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral" color="subdued">
                Profit
              </s-text>
              <s-heading>{garment.profitLabel}</s-heading>
              <s-text tone="neutral" color="subdued">
                Revenue − purchase cost − cleaning
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral" color="subdued">
                Acquisition cost
              </s-text>
              <s-heading>{unitCostLabel}</s-heading>
              <s-text tone="neutral" color="subdued">
                Shopify cost per item
              </s-text>
            </s-stack>
          </s-box>
        </ResponsiveGrid>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-text type="strong">Cost settings</s-text>
            <s-paragraph tone="neutral" color="subdued">
              Override Shopify acquisition cost and set a per-hire cleaning cost for
              profit reporting on this garment.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="save-costs" />
              <input type="hidden" name="productId" value={garment.productId} />
              <input type="hidden" name="variantId" value={garment.variantId} />
              <ResponsiveGrid layout="2">
                <s-text-field
                  label="Purchase cost override (AUD)"
                  name="purchaseCostOverride"
                  value={
                    garment.purchaseCostOverride != null
                      ? String(garment.purchaseCostOverride)
                      : ""
                  }
                  placeholder={
                    garment.unitCost.amount != null
                      ? String(garment.unitCost.amount)
                      : "Uses Shopify cost"
                  }
                />
                <s-text-field
                  label="Cleaning cost per hire (AUD)"
                  name="cleaningCostPerHire"
                  value={
                    garment.cleaningCostPerHire != null
                      ? String(garment.cleaningCostPerHire)
                      : ""
                  }
                  placeholder="0.00"
                />
              </ResponsiveGrid>
              <div className="gk-form-actions">
                <s-button
                  type="submit"
                  variant="primary"
                  {...(isSubmitting &&
                  navigation.formData?.get("intent") === "save-costs"
                    ? { loading: true }
                    : {})}
                >
                  Save costs
                </s-button>
              </div>
            </Form>
          </s-stack>
        </s-box>

        {garment.waitlistEntries.length > 0 ? (
          <s-box padding="large" border="base" borderRadius="large" background="base">
            <s-stack direction="block" gap="large">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-text type="strong">Waitlist demand</s-text>
                <s-badge tone="warning">
                  {garment.waitlistWaitingCount} waiting
                </s-badge>
              </s-stack>
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Customer</s-table-header>
                  <s-table-header listSlot="labeled">Status</s-table-header>
                  <s-table-header listSlot="labeled">Event date</s-table-header>
                  <s-table-header listSlot="secondary">Priority access</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {garment.waitlistEntries.map((entry) => (
                    <s-table-row key={entry.id}>
                      <s-table-cell>
                        {entry.email}
                        {entry.name ? ` · ${entry.name}` : ""}
                      </s-table-cell>
                      <s-table-cell>{entry.status}</s-table-cell>
                      <s-table-cell>
                        {entry.eventDate
                          ? formatDisplayDate(entry.eventDate)
                          : "—"}
                      </s-table-cell>
                      <s-table-cell>
                        {entry.claimExpiresAt &&
                        new Date(entry.claimExpiresAt).getTime() > Date.now()
                          ? `Until ${formatDisplayDate(entry.claimExpiresAt.slice(0, 10))}`
                          : entry.notifiedAt
                            ? "Notified"
                            : "—"}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
              <s-link href="/app/waitlist">View all waitlist requests</s-link>
            </s-stack>
          </s-box>
        ) : null}

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack direction="inline" gap="large" alignItems="center">
              <s-text type="strong">Garment calendar</s-text>
              <s-badge tone="success">Confirmed hire</s-badge>
              <s-badge tone="info">Pending checkout</s-badge>
              <s-badge tone="warning">Try-on hold</s-badge>
              <s-badge tone="caution">Try-on appointment</s-badge>
              <s-badge tone="critical">Shop blackout</s-badge>
            </s-stack>

            <s-stack direction="inline" gap="large" alignItems="center">
              <Link
                to={calendarNavHref(
                  garment.productId,
                  garment.variantId,
                  calendar.prev.year,
                  calendar.prev.month,
                  searchParams,
                )}
              >
                ← Previous
              </Link>
              <s-text type="strong">
                {formatMonthLabel(calendar.year, calendar.month)}
              </s-text>
              <Link
                to={calendarNavHref(
                  garment.productId,
                  garment.variantId,
                  calendar.next.year,
                  calendar.next.month,
                  searchParams,
                )}
              >
                Next →
              </Link>
            </s-stack>

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
                const hasConfirmed = day.confirmedBookings > 0;
                const hasPending = day.pendingBookings > 0;
                const hasGarmentBlock = day.garmentBlocks > 0;
                const hasShopBlock = day.shopBlocks > 0;
                const hasTryOnAppointment = day.tryOnAppointments > 0;
                const background = hasShopBlock
                  ? "rgba(215, 44, 13, 0.1)"
                  : hasGarmentBlock
                    ? "rgba(185, 137, 0, 0.14)"
                    : hasTryOnAppointment
                      ? "rgba(230, 119, 0, 0.14)"
                      : hasConfirmed
                        ? "rgba(18, 128, 92, 0.12)"
                        : hasPending
                          ? "rgba(44, 110, 203, 0.12)"
                          : "transparent";

                return (
                  <div
                    key={day.iso}
                    style={{
                      minHeight: "80px",
                      border: "1px solid var(--p-color-border, #dfe3e8)",
                      borderRadius: "4px",
                      padding: "8px",
                      background,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        marginBottom: "6px",
                      }}
                    >
                      {dayNumber}
                    </div>
                    <s-stack direction="block" gap="small-100">
                      {hasConfirmed ? (
                        <s-badge tone="success">Hired</s-badge>
                      ) : null}
                      {hasPending ? (
                        <s-badge tone="info">Pending</s-badge>
                      ) : null}
                      {hasTryOnAppointment ? (
                        <s-badge tone="caution">
                          Try-on{day.tryOnAppointments > 1 ? ` (${day.tryOnAppointments})` : ""}
                        </s-badge>
                      ) : null}
                      {hasGarmentBlock ? (
                        <s-badge tone="warning">Hold</s-badge>
                      ) : null}
                      {hasShopBlock ? (
                        <s-badge tone="critical">Closed</s-badge>
                      ) : null}
                    </s-stack>
                  </div>
                );
              })}
            </div>
          </s-stack>
        </s-box>

        {garment.blockedDates.length > 0 ? (
          <s-box padding="large" border="base" borderRadius="large" background="base">
            <s-stack direction="block" gap="large">
              <s-text type="strong">Active try-on holds</s-text>
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Dates</s-table-header>
                  <s-table-header listSlot="labeled">Reason</s-table-header>
                  <s-table-header listSlot="secondary">Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {garment.blockedDates.map((block) => (
                    <s-table-row key={block.id}>
                      <s-table-cell>
                        {formatDisplayDate(block.startDate)}
                        {block.endDate !== block.startDate
                          ? ` – ${formatDisplayDate(block.endDate)}`
                          : ""}
                      </s-table-cell>
                      <s-table-cell>{block.reason || "Try-on hold"}</s-table-cell>
                      <s-table-cell>
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete-block" />
                          <input type="hidden" name="blockId" value={block.id} />
                          <input
                            type="hidden"
                            name="productId"
                            value={garment.productId}
                          />
                          <input
                            type="hidden"
                            name="variantId"
                            value={garment.variantId}
                          />
                          <s-button
                            type="submit"
                            variant="tertiary"
                            tone="critical"
                            {...(isSubmitting && submittingBlockId === block.id
                              ? { loading: true }
                              : {})}
                          >
                            Remove hold
                          </s-button>
                        </Form>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-stack>
          </s-box>
        ) : null}

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-text type="strong">Full booking history</s-text>
            {historyEntries.length === 0 ? (
              <s-box padding="large" background="subdued" borderRadius="base">
                <s-text tone="neutral">
                  No bookings or try-on holds yet. Online hires appear here
                  automatically; use &quot;Book try-on appointment&quot; for
                  in-store bookings.
                </s-text>
              </s-box>
            ) : (
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Dates</s-table-header>
                  <s-table-header listSlot="labeled">Customer</s-table-header>
                  <s-table-header listSlot="labeled">Type</s-table-header>
                  <s-table-header listSlot="labeled">Status</s-table-header>
                  <s-table-header listSlot="labeled">Revenue</s-table-header>
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
                        {"customerLabel" in entry ? entry.customerLabel : "—"}
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge
                          tone={
                            entry.source === "Try-on hold"
                              ? "warning"
                              : entry.source === "Try-on appointment"
                                ? "caution"
                                : entry.source === "Manual"
                                  ? "info"
                                  : "success"
                          }
                        >
                          {entry.source}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>
                        {entry.source === "Online" ? (
                          <s-badge tone={bookingStatusTone(entry.status)}>
                            {bookingStatusLabel(entry.status)}
                          </s-badge>
                        ) : entry.source === "Try-on appointment" ? (
                          <s-badge tone="success">Confirmed</s-badge>
                        ) : (
                          <s-text tone="neutral" color="subdued">
                            Blocks website
                          </s-text>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {entry.revenue != null
                          ? formatMoney(entry.revenue, "AUD")
                          : "—"}
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="base" alignItems="center">
                          {entry.orderId ? (
                            <s-button
                              variant="tertiary"
                              onClick={() =>
                                window.open(
                                  orderAdminUrl(shop, entry.orderId!),
                                  "_top",
                                )
                              }
                            >
                              {entry.detail}
                            </s-button>
                          ) : (
                            <s-text>{entry.detail}</s-text>
                          )}
                          {entry.canDelete && entry.blockId ? (
                            <Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="delete-block"
                              />
                              <input
                                type="hidden"
                                name="blockId"
                                value={entry.blockId}
                              />
                              <input
                                type="hidden"
                                name="productId"
                                value={garment.productId}
                              />
                              <input
                                type="hidden"
                                name="variantId"
                                value={garment.variantId}
                              />
                              <s-button
                                type="submit"
                                variant="tertiary"
                                tone="critical"
                                {...(isSubmitting &&
                                submittingBlockId === entry.blockId
                                  ? { loading: true }
                                  : {})}
                              >
                                Remove
                              </s-button>
                            </Form>
                          ) : null}
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            )}
          </s-stack>
        </s-box>

        <AdminTryOnBookingModal
          open={showTryOnModal}
          onClose={() => setShowTryOnModal(false)}
          config={appointmentConfig}
          productId={garment.productId}
          variantId={garment.variantId}
          gownTitle={garment.productTitle}
          sizeLabel={garment.sizeLabel}
          isSubmitting={
            isSubmitting && navigation.formData?.get("intent") === "book-try-on"
          }
        />
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
