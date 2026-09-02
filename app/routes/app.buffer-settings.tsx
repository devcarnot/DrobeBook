import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import {
  bufferConfigFromFormData,
  DEFAULT_BUFFER_CONFIG,
  type BufferConfig,
  type BufferDayUnit,
  type DeliveryBufferDefaults,
} from "../lib/booking/buffer-config";
import {
  getShopBufferConfig,
  saveShopBufferConfig,
} from "../lib/booking/buffer.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const buffers = await getShopBufferConfig(session.shop);
  return { buffers };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const buffers = bufferConfigFromFormData(formData);
  await saveShopBufferConfig(session.shop, buffers);
  return { saved: true, buffers };
};

function unitLabel(unit: BufferDayUnit): string {
  return unit === "business" ? "business days" : "calendar days";
}

function summarizeSettings(settings: DeliveryBufferDefaults): string {
  return `${settings.blockedDaysFromToday} ${unitLabel(settings.blockedDaysUnit)} lead · cut-off ${settings.cutOffTime} · ${settings.bufferAfterRental} ${unitLabel(settings.bufferAfterUnit)} after rental`;
}

function TimelineStep({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <s-box padding="small" border="base" borderRadius="base" background="base">
      <s-stack direction="block" gap="small-100">
        <s-text tone="neutral" color="subdued">
          {label}
        </s-text>
        {emphasis ? (
          <s-badge tone="success">{value}</s-badge>
        ) : (
          <s-text type="strong">{value}</s-text>
        )}
      </s-stack>
    </s-box>
  );
}

function BufferTimeline({ settings }: { settings: DeliveryBufferDefaults }) {
  return (
    <s-grid
      gridTemplateColumns="1fr auto 1fr auto 1fr auto 1fr"
      gap="small-200"
      alignItems="center"
    >
      <TimelineStep
        label="Lead time"
        value={`${settings.blockedDaysFromToday}d`}
      />
      <s-text tone="neutral" color="subdued">
        →
      </s-text>
      <TimelineStep
        label="Before"
        value={`${settings.bufferBeforeRental}d`}
      />
      <s-text tone="neutral" color="subdued">
        →
      </s-text>
      <TimelineStep label="Rental" value="Hire dates" emphasis />
      <s-text tone="neutral" color="subdued">
        →
      </s-text>
      <TimelineStep label="After" value={`${settings.bufferAfterRental}d`} />
    </s-grid>
  );
}

function BufferMethodCard({
  method,
  title,
  badge,
  settings,
}: {
  method: "post" | "pickup";
  title: string;
  badge: string;
  settings: DeliveryBufferDefaults;
}) {
  return (
    <s-box padding="large" border="base" borderRadius="large" background="base">
      <s-stack direction="block" gap="large">
        <s-stack direction="inline" gap="base" alignItems="start" justifyContent="space-between">
          <s-stack direction="block" gap="small-200">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text type="strong">{title}</s-text>
              <s-badge tone="info">{badge}</s-badge>
            </s-stack>
            <s-text tone="neutral" color="subdued">
              {summarizeSettings(settings)}
            </s-text>
          </s-stack>
        </s-stack>

        <s-box padding="large" background="subdued" borderRadius="base">
          <BufferTimeline settings={settings} />
        </s-box>

        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">Lead time &amp; cut-off</s-text>
            <s-paragraph tone="neutral" color="subdued">
              How soon customers can book and when same-day dispatch stops
              counting.
            </s-paragraph>
          </s-stack>
          <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="large" alignItems="end">
            <s-number-field
              label="Blocked days from today"
              name={`${method}_blockedDaysFromToday`}
              value={String(settings.blockedDaysFromToday)}
              min={0}
              step={1}
            />
            <s-select
              label="Unit"
              name={`${method}_blockedDaysUnit`}
              value={settings.blockedDaysUnit}
            >
              <option value="calendar">Calendar days</option>
              <option value="business">Business days</option>
            </s-select>
            <s-text-field
              label="Cut-off time"
              name={`${method}_cutOffTime`}
              value={settings.cutOffTime}
              placeholder="13:00"
              details="24-hour HH:MM"
            />
          </s-grid>
        </s-stack>

        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">Turnaround buffers</s-text>
            <s-paragraph tone="neutral" color="subdued">
              Extra blocked days before and after the hire period for cleaning or
              dispatch.
            </s-paragraph>
          </s-stack>
          <s-grid gridTemplateColumns="1fr 1fr" gap="large" alignItems="end">
            <s-number-field
              label="Buffer before rental"
              name={`${method}_bufferBeforeRental`}
              value={String(settings.bufferBeforeRental)}
              min={0}
              step={1}
            />
            <s-select
              label="Unit"
              name={`${method}_bufferBeforeUnit`}
              value={settings.bufferBeforeUnit}
            >
              <option value="calendar">Calendar days</option>
              <option value="business">Business days</option>
            </s-select>
          </s-grid>
          <s-grid gridTemplateColumns="1fr 1fr" gap="large" alignItems="end">
            <s-number-field
              label="Buffer after rental"
              name={`${method}_bufferAfterRental`}
              value={String(settings.bufferAfterRental)}
              min={0}
              step={1}
            />
            <s-select
              label="Unit"
              name={`${method}_bufferAfterUnit`}
              value={settings.bufferAfterUnit}
            >
              <option value="calendar">Calendar days</option>
              <option value="business">Business days</option>
            </s-select>
          </s-grid>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export default function BufferSettingsPage() {
  const { buffers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const activeBuffers: BufferConfig = actionData?.buffers ?? buffers;

  return (
    <s-page heading="Buffer settings" inlineSize="large">
      <s-stack direction="block" gap="large">
        {actionData?.saved ? (
          <s-banner tone="success">Buffer settings saved.</s-banner>
        ) : null}

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="info" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Super-flexible buffer system</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Set separate defaults for post and pickup. Business-day
                calculations automatically skip weekends and shop-wide blocked
                dates.
              </s-paragraph>
              <s-stack direction="inline" gap="large">
                <s-link href="/app/blocked-dates">Manage bank holidays</s-link>
                <s-link href="/app/bookings">Rental calendar</s-link>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-box>

        <Form method="post">
          <s-stack direction="block" gap="large">
            <s-grid gridTemplateColumns="1fr 1fr" gap="large">
              <BufferMethodCard
                method="post"
                title="Post delivery"
                badge="Shipping"
                settings={activeBuffers.post}
              />
              <BufferMethodCard
                method="pickup"
                title="Local pickup"
                badge="Pickup"
                settings={activeBuffers.pickup}
              />
            </s-grid>

            <s-box padding="large" border="base" borderRadius="large" background="base">
              <s-stack
                direction="inline"
                gap="large"
                alignItems="center"
                justifyContent="space-between"
              >
                <s-text tone="neutral" color="subdued">
                  Changes apply to storefront availability immediately after saving.
                </s-text>
                <s-button
                  type="submit"
                  variant="primary"
                  {...(isSubmitting ? { loading: true } : {})}
                >
                  Save buffer settings
                </s-button>
              </s-stack>
            </s-box>
          </s-stack>
        </Form>

        <s-box
          padding="large"
          background="subdued"
          border="base"
          borderRadius="large"
        >
          <s-stack direction="block" gap="small">
            <s-text type="strong">Factory defaults</s-text>
            <s-paragraph tone="neutral" color="subdued">
              Post: {DEFAULT_BUFFER_CONFIG.post.blockedDaysFromToday} calendar days
              lead, cut-off {DEFAULT_BUFFER_CONFIG.post.cutOffTime},{" "}
              {DEFAULT_BUFFER_CONFIG.post.bufferAfterRental}-day after-rental buffer.
            </s-paragraph>
            <s-paragraph tone="neutral" color="subdued">
              Pickup: {DEFAULT_BUFFER_CONFIG.pickup.blockedDaysFromToday} calendar
              days lead, cut-off {DEFAULT_BUFFER_CONFIG.pickup.cutOffTime},{" "}
              {DEFAULT_BUFFER_CONFIG.pickup.bufferAfterRental}-day after-rental buffer.
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
