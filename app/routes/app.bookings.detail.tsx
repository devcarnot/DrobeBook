import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";

import { ResponsiveGrid } from "../components/ResponsiveGrid";
import {
  formatDisplayDate,
  previewBufferDates,
} from "../lib/booking/buffer";
import {
  parseDeliveryMethod,
  type BufferDayUnit,
  type DeliveryMethod,
} from "../lib/booking/buffer-config";
import {
  getHolidayDates,
  getShopBufferConfig,
} from "../lib/booking/buffer.server";
import { parseIsoDate } from "../lib/booking/availability.server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

function parseOptionalCount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
}

function parseOptionalUnit(
  value: FormDataEntryValue | null,
): BufferDayUnit | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  return raw === "business" ? "business" : "calendar";
}

type BookingDraft = {
  deliveryMethod: DeliveryMethod;
  rentalStart: string;
  rentalEnd: string;
  useDefaultBefore: boolean;
  useDefaultAfter: boolean;
  bufferBeforeDays: string;
  bufferBeforeUnit: BufferDayUnit;
  bufferAfterDays: string;
  bufferAfterUnit: BufferDayUnit;
};

function bookingToDraft(booking: {
  deliveryMethod: DeliveryMethod;
  rentalStart: string;
  rentalEnd: string;
  bufferBeforeDays: number | null;
  bufferBeforeUnit: string | null;
  bufferAfterDays: number | null;
  bufferAfterUnit: string | null;
}): BookingDraft {
  return {
    deliveryMethod: booking.deliveryMethod,
    rentalStart: booking.rentalStart,
    rentalEnd: booking.rentalEnd,
    useDefaultBefore: booking.bufferBeforeDays == null,
    useDefaultAfter: booking.bufferAfterDays == null,
    bufferBeforeDays:
      booking.bufferBeforeDays != null ? String(booking.bufferBeforeDays) : "",
    bufferBeforeUnit: (booking.bufferBeforeUnit ?? "calendar") as BufferDayUnit,
    bufferAfterDays:
      booking.bufferAfterDays != null ? String(booking.bufferAfterDays) : "",
    bufferAfterUnit: (booking.bufferAfterUnit ?? "calendar") as BufferDayUnit,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId");

  if (!bookingId) {
    throw new Response("Missing bookingId", { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, shop: session.shop },
  });

  if (!booking) {
    throw new Response("Booking not found", { status: 404 });
  }

  const [bufferConfig, holidays] = await Promise.all([
    getShopBufferConfig(session.shop),
    getHolidayDates(session.shop),
  ]);

  const rentalStart = booking.startDate.toISOString().slice(0, 10);
  const rentalEnd = booking.endDate.toISOString().slice(0, 10);
  const deliveryMethod = parseDeliveryMethod(booking.deliveryMethod);

  const preview = previewBufferDates({
    rentalStart,
    rentalEnd,
    deliveryMethod,
    bufferConfig,
    holidays,
    override: {
      bufferBeforeDays: booking.bufferBeforeDays,
      bufferBeforeUnit: booking.bufferBeforeUnit as BufferDayUnit | null,
      bufferAfterDays: booking.bufferAfterDays,
      bufferAfterUnit: booking.bufferAfterUnit as BufferDayUnit | null,
    },
  });

  return {
    booking: {
      id: booking.id,
      productId: booking.productId,
      variantId: booking.variantId,
      size: booking.size,
      deliveryMethod,
      rentalStart,
      rentalEnd,
      bufferBeforeDays: booking.bufferBeforeDays,
      bufferBeforeUnit: booking.bufferBeforeUnit,
      bufferAfterDays: booking.bufferAfterDays,
      bufferAfterUnit: booking.bufferAfterUnit,
      status: booking.status,
      orderId: booking.orderId,
    },
    bufferConfig,
    holidays: [...holidays],
    preview,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const bookingId = String(formData.get("bookingId") ?? "");

  if (!bookingId) {
    return { error: "Missing booking ID." };
  }

  const rentalStart = parseIsoDate(String(formData.get("rentalStart") ?? ""));
  const rentalEnd = parseIsoDate(String(formData.get("rentalEnd") ?? ""));

  if (!rentalStart || !rentalEnd) {
    return { error: "Please choose valid rental start and end dates." };
  }

  if (rentalEnd.getTime() < rentalStart.getTime()) {
    return { error: "Rental end must be on or after rental start." };
  }

  const deliveryMethod = parseDeliveryMethod(
    String(formData.get("deliveryMethod") ?? ""),
  );

  const useDefaultBefore = formData.get("useDefaultBefore") === "on";
  const useDefaultAfter = formData.get("useDefaultAfter") === "on";

  await prisma.booking.updateMany({
    where: { id: bookingId, shop: session.shop },
    data: {
      startDate: rentalStart,
      endDate: rentalEnd,
      deliveryMethod,
      bufferBeforeDays: useDefaultBefore
        ? null
        : parseOptionalCount(formData.get("bufferBeforeDays")),
      bufferBeforeUnit: useDefaultBefore
        ? null
        : parseOptionalUnit(formData.get("bufferBeforeUnit")),
      bufferAfterDays: useDefaultAfter
        ? null
        : parseOptionalCount(formData.get("bufferAfterDays")),
      bufferAfterUnit: useDefaultAfter
        ? null
        : parseOptionalUnit(formData.get("bufferAfterUnit")),
    },
  });

  return { saved: true };
};

function formatDateField(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function BookingDetailPage() {
  const { booking, bufferConfig, holidays } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  const [draft, setDraft] = useState(() => bookingToDraft(booking));

  useEffect(() => {
    setDraft(bookingToDraft(booking));
  }, [booking]);

  const bufferPreview = useMemo(() => {
    return previewBufferDates({
      rentalStart: draft.rentalStart,
      rentalEnd: draft.rentalEnd,
      deliveryMethod: draft.deliveryMethod,
      bufferConfig,
      holidays: new Set(holidays),
      override: {
        bufferBeforeDays: draft.useDefaultBefore
          ? null
          : draft.bufferBeforeDays
            ? Number.parseInt(draft.bufferBeforeDays, 10)
            : null,
        bufferBeforeUnit: draft.useDefaultBefore ? null : draft.bufferBeforeUnit,
        bufferAfterDays: draft.useDefaultAfter
          ? null
          : draft.bufferAfterDays
            ? Number.parseInt(draft.bufferAfterDays, 10)
            : null,
        bufferAfterUnit: draft.useDefaultAfter ? null : draft.bufferAfterUnit,
      },
    });
  }, [draft, bufferConfig, holidays]);

  return (
    <s-page heading="Dates & delivery" inlineSize="large">
      <s-link href="/app/bookings" slot="breadcrumb-actions">
        Rental calendar
      </s-link>

      <s-stack direction="block" gap="large">
        {actionData?.error ? (
          <s-banner tone="critical">{actionData.error}</s-banner>
        ) : null}
        {actionData?.saved ? (
          <s-banner tone="success">Rental dates and buffers updated.</s-banner>
        ) : null}

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Manually adjust buffers for this rental</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Override global buffer defaults for rental {booking.id.slice(0, 8)}.
                Leave override checkboxes ticked to use your{" "}
                <s-link href="/app/buffer-settings">global buffer settings</s-link>.
              </s-paragraph>
            </s-stack>

            <Form method="post">
              <input type="hidden" name="bookingId" value={booking.id} />

              <s-stack direction="block" gap="large">
                <s-select
                  label="Delivery method"
                  name="deliveryMethod"
                  value={draft.deliveryMethod}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      deliveryMethod: parseDeliveryMethod(event.currentTarget.value),
                    }))
                  }
                >
                  <s-option value="post">Post</s-option>
                  <s-option value="pickup">Local pickup</s-option>
                </s-select>

                <s-checkbox
                  name="useDefaultBefore"
                  checked={draft.useDefaultBefore}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      useDefaultBefore: event.currentTarget.checked,
                    }))
                  }
                  label="Use global default for start buffer"
                />
                <ResponsiveGrid layout="detail-actions" alignItems="end">
                  <s-number-field
                    label="Start buffer"
                    name="bufferBeforeDays"
                    value={draft.bufferBeforeDays}
                    min={0}
                    step={1}
                    disabled={draft.useDefaultBefore}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        bufferBeforeDays: event.currentTarget.value,
                      }))
                    }
                  />
                  <s-select
                    label="Unit"
                    name="bufferBeforeUnit"
                    value={draft.bufferBeforeUnit}
                    disabled={draft.useDefaultBefore}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        bufferBeforeUnit: event.currentTarget.value as BufferDayUnit,
                      }))
                    }
                  >
                    <s-option value="calendar">Calendar days</s-option>
                    <s-option value="business">Business days</s-option>
                  </s-select>
                  <s-text>{formatDisplayDate(bufferPreview.startBufferDate)}</s-text>
                </ResponsiveGrid>

                <s-date-field
                  label="Rental start (delivery date)"
                  name="rentalStart"
                  value={draft.rentalStart}
                  required
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      rentalStart: event.currentTarget.value,
                    }))
                  }
                />

                <s-date-field
                  label="Rental end (return date)"
                  name="rentalEnd"
                  value={draft.rentalEnd}
                  required
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      rentalEnd: event.currentTarget.value,
                    }))
                  }
                />

                <s-checkbox
                  name="useDefaultAfter"
                  checked={draft.useDefaultAfter}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      useDefaultAfter: event.currentTarget.checked,
                    }))
                  }
                  label="Use global default for end buffer"
                />
                <ResponsiveGrid layout="detail-actions" alignItems="end">
                  <s-number-field
                    label="End buffer"
                    name="bufferAfterDays"
                    value={draft.bufferAfterDays}
                    min={0}
                    step={1}
                    disabled={draft.useDefaultAfter}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        bufferAfterDays: event.currentTarget.value,
                      }))
                    }
                  />
                  <s-select
                    label="Unit"
                    name="bufferAfterUnit"
                    value={draft.bufferAfterUnit}
                    disabled={draft.useDefaultAfter}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        bufferAfterUnit: event.currentTarget.value as BufferDayUnit,
                      }))
                    }
                  >
                    <s-option value="calendar">Calendar days</s-option>
                    <s-option value="business">Business days</s-option>
                  </s-select>
                  <s-text>{formatDisplayDate(bufferPreview.endBufferDate)}</s-text>
                </ResponsiveGrid>

                <s-stack direction="inline" gap="large">
                  <s-button
                    type="submit"
                    variant="primary"
                    {...(isSubmitting ? { loading: true } : {})}
                  >
                    Save changes
                  </s-button>
                  <s-button
                    type="button"
                    variant="tertiary"
                    onClick={() => navigate("/app/bookings")}
                  >
                    Cancel
                  </s-button>
                </s-stack>
              </s-stack>
            </Form>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="base">
            <s-text type="strong">Summary</s-text>
            <s-stack direction="block" gap="small">
              <s-text>
                Hire period: {formatDateField(draft.rentalStart)} –{" "}
                {formatDateField(draft.rentalEnd)}
              </s-text>
              <s-text>
                Blocked from {formatDateField(bufferPreview.startBufferDate)} through{" "}
                {formatDateField(bufferPreview.endBufferDate)}
              </s-text>
              {booking.orderId ? (
                <s-text>Order #{booking.orderId}</s-text>
              ) : null}
            </s-stack>
          </s-stack>
        </s-box>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
