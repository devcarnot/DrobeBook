import { useMemo } from "react";

import {
  buildRentalTokenMap,
  renderNotificationEmail,
} from "../lib/notifications/notification-render";

const SAMPLE_RENTAL = {
  bookingId: "preview",
  customerName: "Alex Smith",
  customerEmail: "alex@example.com",
  productTitle: "Silk Evening Gown",
  size: "10",
  rentalStart: "2026-09-15",
  rentalEnd: "2026-09-20",
  eventDate: "2026-09-18",
  rentalStatus: "confirmed",
  deliveryMethod: "post",
  shopifyOrderNumber: "1042",
  rentalCreatedAt: new Date().toISOString(),
  fulfillmentTrackingLink: "https://tracking.example.com/abc123",
  returnTrackingLink: "",
};

type NotificationEmailPreviewProps = {
  subject: string;
  body: string;
  shopName?: string;
};

export function NotificationEmailPreview({
  subject,
  body,
  shopName = "GK.Drobe",
}: NotificationEmailPreviewProps) {
  const rendered = useMemo(() => {
    const tokens = buildRentalTokenMap(SAMPLE_RENTAL, shopName);
    return renderNotificationEmail(subject, body, tokens);
  }, [subject, body, shopName]);

  return (
    <div className="gk-email-preview">
      <div className="gk-email-preview__chrome">
        <span className="gk-email-preview__dot" />
        <span className="gk-email-preview__dot" />
        <span className="gk-email-preview__dot" />
      </div>
      <div className="gk-email-preview__meta">
        <div className="gk-email-preview__meta-row">
          <span className="gk-email-preview__label">Subject</span>
          <span className="gk-email-preview__value">
            {rendered.subject || "Email subject preview"}
          </span>
        </div>
        <div className="gk-email-preview__meta-row">
          <span className="gk-email-preview__label">To</span>
          <span className="gk-email-preview__value">alex@example.com</span>
        </div>
      </div>
      <div
        className="gk-email-preview__body"
        dangerouslySetInnerHTML={{
          __html: rendered.bodyHtml || "<p>Start typing your message to preview it here.</p>",
        }}
      />
    </div>
  );
}
