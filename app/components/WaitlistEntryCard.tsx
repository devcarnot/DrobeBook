import type { ReactNode } from "react";
import { Form, Link } from "react-router";

import { ResponsiveGrid } from "./ResponsiveGrid";
import {
  deliveryDateFromWaitlistEvent,
  parseWaitlistEntryNotes,
} from "../lib/waitlist/waitlist-admin-display";
import type { WaitlistEntryView, WaitlistStatus } from "../lib/waitlist/waitlist.server";

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

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return null;
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

function statusLabel(status: WaitlistStatus): string {
  const labels: Record<WaitlistStatus, string> = {
    waiting: "Waiting",
    contacted: "Contacted",
    fulfilled: "Fulfilled",
    removed: "Removed",
  };
  return labels[status];
}

function LabeledValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  if (children == null || children === "") {
    return null;
  }

  return (
    <s-stack direction="block" gap="small-100">
      <s-text tone="neutral" color="subdued">
        {label}
      </s-text>
      <s-text>{children}</s-text>
    </s-stack>
  );
}

export function WaitlistEntryCard({
  entry,
  isSubmitting,
}: {
  entry: WaitlistEntryView;
  isSubmitting: boolean;
}) {
  const { customerMessage } = parseWaitlistEntryNotes(entry.notes);
  const deliveryDate = deliveryDateFromWaitlistEvent(entry.eventDate);
  const bookingType = entry.kind === "try_on" ? "Try-on" : "Hire";

  const priorityText =
    entry.claimIsActive && entry.claimExpiresAt
      ? `Priority access until ${formatDateTime(entry.claimExpiresAt)}`
      : entry.notifiedAt
        ? `Notified ${formatDateTime(entry.notifiedAt)}`
        : null;

  return (
    <s-box padding="large" background="base" border="base" borderRadius="large">
      <s-stack direction="block" gap="large">
        <s-stack
          direction="inline"
          gap="large"
          alignItems="start"
          justifyContent="space-between"
        >
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-badge tone={statusTone(entry.status)}>{statusLabel(entry.status)}</s-badge>
            <s-badge tone={entry.kind === "try_on" ? "info" : "neutral"}>
              {bookingType}
            </s-badge>
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
          <s-stack direction="block" gap="large">
            <s-text type="strong">Customer</s-text>
            <ResponsiveGrid layout="2" gap="large" alignItems="start">
              <LabeledValue label="Waitlist status">{statusLabel(entry.status)}</LabeledValue>
              <LabeledValue label="Booking type">{bookingType}</LabeledValue>
              <LabeledValue label="Email address">{entry.email}</LabeledValue>
              <LabeledValue label="Customer name">{entry.name}</LabeledValue>
              <LabeledValue label="Phone number">{entry.phone}</LabeledValue>
              <LabeledValue label="Pronouns">{entry.pronouns}</LabeledValue>
              <LabeledValue label="Submission date & time">
                {formatDateTime(entry.createdAt)}
              </LabeledValue>
              {priorityText ? (
                <LabeledValue label="Follow-up">{priorityText}</LabeledValue>
              ) : null}
            </ResponsiveGrid>
            {customerMessage ? (
              <LabeledValue label="Customer message / notes">{customerMessage}</LabeledValue>
            ) : null}
          </s-stack>
        </s-box>

        <s-box padding="base" background="subdued" borderRadius="base">
          <s-stack direction="block" gap="large">
            <s-text type="strong">Product & booking</s-text>
            <ResponsiveGrid layout="2" gap="large" alignItems="start">
              <LabeledValue label="Product name">{entry.productTitle}</LabeledValue>
              <LabeledValue label="Product ID">{entry.productId}</LabeledValue>
              {entry.variantId ? (
                <LabeledValue label="Variant ID">{entry.variantId}</LabeledValue>
              ) : null}
              <LabeledValue label="Selected size">{entry.size}</LabeledValue>
              {entry.kind === "garment" && entry.eventDate ? (
                <>
                  <LabeledValue label="Requested event date">
                    {formatDate(entry.eventDate)}
                  </LabeledValue>
                  <LabeledValue label="Requested delivery date">
                    {formatDate(deliveryDate)}
                  </LabeledValue>
                </>
              ) : null}
              {entry.kind === "try_on" ? (
                <>
                  <LabeledValue label="Waitlist selected date">
                    {formatDate(entry.preferredDate)}
                  </LabeledValue>
                  <LabeledValue label="Preferred time">{entry.preferredTime}</LabeledValue>
                  <LabeledValue label="Appointment duration">
                    {entry.durationMinutes
                      ? `${entry.durationMinutes} minutes`
                      : null}
                  </LabeledValue>
                </>
              ) : null}
            </ResponsiveGrid>

            <s-stack direction="inline" gap="small">
              <s-link href={entry.adminProductUrl} target="_blank">
                Open in Shopify
              </s-link>
              {entry.storefrontProductUrl ? (
                <s-link href={entry.storefrontProductUrl} target="_blank">
                  View on storefront
                </s-link>
              ) : null}
              <s-link
                href={`/app/inventory/detail?productId=${entry.productId}${entry.variantId ? `&variantId=${entry.variantId}` : ""}`}
              >
                Inventory calendar
              </s-link>
              {entry.claimIsActive && entry.claimStorefrontUrl ? (
                <s-link href={entry.claimStorefrontUrl} target="_blank">
                  Priority booking link
                </s-link>
              ) : null}
            </s-stack>
          </s-stack>
        </s-box>

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
  );
}