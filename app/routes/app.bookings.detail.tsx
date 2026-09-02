import { useMemo } from "react";
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
} from "react-router";

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
  const { booking, bufferConfig, holidays, preview } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const livePreview = useMemo(() => {
    return previewBufferDates({
      rentalStart: booking.rentalStart,
      rentalEnd: booking.rentalEnd,
      deliveryMethod: booking.deliveryMethod as DeliveryMethod,
      bufferConfig,
      holidays: new Set(holidays),
      override: {
        bufferBeforeDays: booking.bufferBeforeDays,
        bufferBeforeUnit: booking.bufferBeforeUnit as BufferDayUnit | null,
        bufferAfterDays: booking.bufferAfterDays,
        bufferAfterUnit: booking.bufferAfterUnit as BufferDayUnit | null,
      },
    });
  }, [booking, bufferConfig, holidays]);

  const displayPreview = actionData?.saved ? livePreview : preview;

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
                <Link to="/app/buffer-settings">global buffer settings</Link>.
              </s-paragraph>
            </s-stack>

            <Form method="post">
              <input type="hidden" name="bookingId" value={booking.id} />

              <s-stack direction="block" gap="large">
                <s-select
                  label="Delivery method"
                  name="deliveryMethod"
                  value={booking.deliveryMethod}
                >
                  <option value="post">Post</option>
                  <option value="pickup">Local pickup</option>
                </s-select>

                <s-checkbox
                  name="useDefaultBefore"
                  checked={booking.bufferBeforeDays == null}
                  label="Use global default for start buffer"
                />
                <s-grid gridTemplateColumns="1fr 160px auto" gap="large" alignItems="end">
                  <s-number-field
                    label="Start buffer"
                    name="bufferBeforeDays"
                    value={String(booking.bufferBeforeDays ?? "")}
                    min={0}
                    step={1}
                  />
                  <s-select
                    label="Unit"
                    name="bufferBeforeUnit"
                    value={booking.bufferBeforeUnit ?? "calendar"}
                  >
                    <option value="calendar">Calendar days</option>
                    <option value="business">Business days</option>
                  </s-select>
                  <s-text>{formatDisplayDate(displayPreview.startBufferDate)}</s-text>
                </s-grid>

                <s-date-field
                  label="Rental start (delivery date)"
                  name="rentalStart"
                  value={booking.rentalStart}
                  required
                />

                <s-date-field
                  label="Rental end (return date)"
                  name="rentalEnd"
                  value={booking.rentalEnd}
                  required
                />

                <s-checkbox
                  name="useDefaultAfter"
                  checked={booking.bufferAfterDays == null}
                  label="Use global default for end buffer"
                />
                <s-grid gridTemplateColumns="1fr 160px auto" gap="large" alignItems="end">
                  <s-number-field
                    label="End buffer"
                    name="bufferAfterDays"
                    value={String(booking.bufferAfterDays ?? "")}
                    min={0}
                    step={1}
                  />
                  <s-select
                    label="Unit"
                    name="bufferAfterUnit"
                    value={booking.bufferAfterUnit ?? "calendar"}
                  >
                    <option value="calendar">Calendar days</option>
                    <option value="business">Business days</option>
                  </s-select>
                  <s-text>{formatDisplayDate(displayPreview.endBufferDate)}</s-text>
                </s-grid>

                <s-stack direction="inline" gap="large">
                  <s-button
                    type="submit"
                    variant="primary"
                    {...(isSubmitting ? { loading: true } : {})}
                  >
                    Save changes
                  </s-button>
                  <Link to="/app/bookings">
                    <s-button variant="tertiary">Cancel</s-button>
                  </Link>
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
                Hire period: {formatDateField(booking.rentalStart)} –{" "}
                {formatDateField(booking.rentalEnd)}
              </s-text>
              <s-text>
                Blocked from {formatDateField(displayPreview.startBufferDate)} through{" "}
                {formatDateField(displayPreview.endBufferDate)}
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
