import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Form, Link } from "react-router";

import { WaitlistConfirmDialog } from "./WaitlistConfirmDialog";
import {
  deliveryDateFromWaitlistEvent,
  parseWaitlistEntryNotes,
} from "../lib/waitlist/waitlist-admin-display";
import type { WaitlistEntryView, WaitlistStatus } from "../lib/waitlist/waitlist.server";

function statusPillClass(status: WaitlistStatus): string {
  return `gk-waitlist-pill gk-waitlist-pill--${status}`;
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

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 14a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-.5.5M14 10a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l.5-.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WaitlistField({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  if (children == null || children === "") {
    return null;
  }

  return (
    <div className="gk-waitlist-field">
      <span className="gk-waitlist-field__label">{label}</span>
      <div
        className={`gk-waitlist-field__value${mono ? " gk-waitlist-field__value--mono" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function DateValue({ text }: { text: string }) {
  return (
    <span className="gk-waitlist-date">
      <CalendarIcon />
      {text}
    </span>
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

  const priorityChip =
    entry.claimIsActive && entry.claimExpiresAt ? (
      <span className="gk-waitlist-chip">
        <CalendarIcon />
        Priority until {formatDateTime(entry.claimExpiresAt)}
      </span>
    ) : null;

  const followUpText =
    entry.notifiedAt && !entry.claimIsActive
      ? `Notified ${formatDateTime(entry.notifiedAt)}`
      : null;

  const [removeDialog, setRemoveDialog] = useState<null | "notify" | "silent">(null);
  const removeNotifyRef = useRef<HTMLFormElement>(null);
  const removeSilentRef = useRef<HTMLFormElement>(null);

  const confirmRemove = () => {
    if (removeDialog === "notify") {
      removeNotifyRef.current?.requestSubmit();
    } else if (removeDialog === "silent") {
      removeSilentRef.current?.requestSubmit();
    }
    setRemoveDialog(null);
  };

  return (
    <article className="gk-waitlist-card">
      <div className="gk-waitlist-card__inner">
        <header className="gk-waitlist-card__top">
          <div className="gk-waitlist-card__pills">
            <span className={statusPillClass(entry.status)}>{statusLabel(entry.status)}</span>
            <span
              className={`gk-waitlist-pill ${entry.kind === "try_on" ? "gk-waitlist-pill--tryon" : "gk-waitlist-pill--hire"}`}
            >
              {bookingType}
            </span>
          </div>

          <div className="gk-waitlist-card__actions-top">
            {entry.status === "waiting" ? (
              <Form method="post">
                <input type="hidden" name="intent" value="notify-availability" />
                <input type="hidden" name="id" value={entry.id} />
                <button
                  type="submit"
                  className="gk-waitlist-btn gk-waitlist-btn--send"
                  disabled={isSubmitting}
                >
                  Send availability email
                </button>
              </Form>
            ) : null}
            <a
              href={entry.mailtoUrl}
              target="_blank"
              rel="noreferrer"
              className="gk-waitlist-btn gk-waitlist-btn--secondary"
            >
              Compose
            </a>
          </div>
        </header>

        <section className="gk-waitlist-section" aria-labelledby={`wl-customer-${entry.id}`}>
          <h3 className="gk-waitlist-section__heading" id={`wl-customer-${entry.id}`}>
            Customer
          </h3>
          <div className="gk-waitlist-fields">
            <WaitlistField label="Email address">{entry.email}</WaitlistField>
            <WaitlistField label="Customer name">{entry.name}</WaitlistField>
            <WaitlistField label="Phone number">{entry.phone}</WaitlistField>
            <WaitlistField label="Pronouns">{entry.pronouns}</WaitlistField>
            <WaitlistField label="Submission date & time">
              <DateValue text={formatDateTime(entry.createdAt)} />
            </WaitlistField>
            {followUpText ? (
              <WaitlistField label="Follow-up">{followUpText}</WaitlistField>
            ) : null}
            {priorityChip ? (
              <div className="gk-waitlist-field">
                <span className="gk-waitlist-field__label">Priority access</span>
                <div className="gk-waitlist-field__value">{priorityChip}</div>
              </div>
            ) : null}
          </div>
          {customerMessage ? (
            <blockquote className="gk-waitlist-quote">
              <span className="gk-waitlist-quote__label">Customer message</span>
              {customerMessage}
            </blockquote>
          ) : null}
        </section>

        <section className="gk-waitlist-section" aria-labelledby={`wl-booking-${entry.id}`}>
          <h3 className="gk-waitlist-section__heading" id={`wl-booking-${entry.id}`}>
            Product &amp; booking
          </h3>
          <div className="gk-waitlist-fields">
            <WaitlistField label="Product name">{entry.productTitle}</WaitlistField>
            <WaitlistField label="Product ID" mono>
              {entry.productId}
            </WaitlistField>
            {entry.variantId ? (
              <WaitlistField label="Variant ID" mono>
                {entry.variantId}
              </WaitlistField>
            ) : null}
            <WaitlistField label="Selected size">{entry.size}</WaitlistField>
            {entry.kind === "garment" && entry.eventDate ? (
              <>
                <WaitlistField label="Requested event date">
                  <DateValue text={formatDate(entry.eventDate) ?? ""} />
                </WaitlistField>
                <WaitlistField label="Requested delivery date">
                  <DateValue text={formatDate(deliveryDate) ?? ""} />
                </WaitlistField>
              </>
            ) : null}
            {entry.kind === "try_on" ? (
              <>
                <WaitlistField label="Waitlist selected date">
                  <DateValue text={formatDate(entry.preferredDate) ?? ""} />
                </WaitlistField>
                <WaitlistField label="Preferred time">{entry.preferredTime}</WaitlistField>
                <WaitlistField label="Appointment duration">
                  {entry.durationMinutes ? `${entry.durationMinutes} minutes` : null}
                </WaitlistField>
              </>
            ) : null}
          </div>

          <nav className="gk-waitlist-links" aria-label="Product links">
            <a
              href={entry.adminProductUrl}
              target="_blank"
              rel="noreferrer"
              className="gk-waitlist-link"
            >
              <LinkIcon />
              Open in Shopify
            </a>
            {entry.storefrontProductUrl ? (
              <a
                href={entry.storefrontProductUrl}
                target="_blank"
                rel="noreferrer"
                className="gk-waitlist-link"
              >
                <LinkIcon />
                View on storefront
              </a>
            ) : null}
            <Link
              to={`/app/inventory/detail?productId=${entry.productId}${entry.variantId ? `&variantId=${entry.variantId}` : ""}`}
              className="gk-waitlist-link"
            >
              <CalendarIcon />
              Inventory calendar
            </Link>
            {entry.claimIsActive && entry.claimStorefrontUrl ? (
              <a
                href={entry.claimStorefrontUrl}
                target="_blank"
                rel="noreferrer"
                className="gk-waitlist-link"
              >
                <LinkIcon />
                Priority booking link
              </a>
            ) : null}
          </nav>
        </section>

        <footer className="gk-waitlist-card__footer">
          {entry.status !== "contacted" && entry.status !== "fulfilled" ? (
            <Form method="post">
              <input type="hidden" name="intent" value="mark-contacted" />
              <input type="hidden" name="id" value={entry.id} />
              <button
                type="submit"
                className="gk-waitlist-btn gk-waitlist-btn--secondary"
                disabled={isSubmitting}
              >
                Mark contacted
              </button>
            </Form>
          ) : null}
          {entry.status !== "fulfilled" ? (
            <Form method="post">
              <input type="hidden" name="intent" value="mark-fulfilled" />
              <input type="hidden" name="id" value={entry.id} />
              <button
                type="submit"
                className="gk-waitlist-btn gk-waitlist-btn--primary"
                disabled={isSubmitting}
              >
                Mark fulfilled
              </button>
            </Form>
          ) : null}
          {entry.status !== "waiting" && entry.status !== "removed" ? (
            <Form method="post">
              <input type="hidden" name="intent" value="mark-waiting" />
              <input type="hidden" name="id" value={entry.id} />
              <button type="submit" className="gk-waitlist-btn gk-waitlist-btn--secondary">
                Reopen
              </button>
            </Form>
          ) : null}
          {entry.status !== "removed" ? (
            <>
              <button
                type="button"
                className="gk-waitlist-btn gk-waitlist-btn--danger"
                onClick={() => setRemoveDialog("notify")}
              >
                Remove &amp; notify
              </button>
              <button
                type="button"
                className="gk-waitlist-btn gk-waitlist-btn--danger"
                onClick={() => setRemoveDialog("silent")}
              >
                Remove silently
              </button>
              <Form method="post" ref={removeNotifyRef} className="gk-waitlist-sr-only">
                <input type="hidden" name="intent" value="remove-entry" />
                <input type="hidden" name="id" value={entry.id} />
                <input type="hidden" name="notifyCustomer" value="true" />
              </Form>
              <Form method="post" ref={removeSilentRef} className="gk-waitlist-sr-only">
                <input type="hidden" name="intent" value="remove-entry" />
                <input type="hidden" name="id" value={entry.id} />
                <input type="hidden" name="notifyCustomer" value="false" />
              </Form>
            </>
          ) : null}
        </footer>
      </div>

      {removeDialog ? (
        <WaitlistConfirmDialog
          title={
            removeDialog === "notify"
              ? "Remove and notify customer?"
              : "Remove without notifying?"
          }
          description={
            removeDialog === "notify"
              ? `This will remove ${entry.email} from the waitlist and send them an email. This cannot be undone.`
              : `This will silently remove ${entry.email} from the waitlist. The customer will not receive an email.`
          }
          confirmLabel={removeDialog === "notify" ? "Remove & notify" : "Remove silently"}
          onCancel={() => setRemoveDialog(null)}
          onConfirm={confirmRemove}
        />
      ) : null}
    </article>
  );
}