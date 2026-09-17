import { describe, expect, it } from "vitest";

import {
  buildRentalTokenMap,
  renderNotificationEmail,
  renderNotificationTemplate,
} from "./notification-render";

describe("renderNotificationTemplate", () => {
  it("replaces known tokens and leaves unknown tokens empty", () => {
    const output = renderNotificationTemplate(
      "Hi {{customerFirstName}}, order {{shopifyOrderNumber}}",
      { customerFirstName: "Alex", shopifyOrderNumber: "1001" },
    );

    expect(output).toBe("Hi Alex, order 1001");
  });
});

describe("renderNotificationEmail", () => {
  it("builds html and plain text bodies", () => {
    const tokens = buildRentalTokenMap(
      {
        bookingId: "b1",
        customerName: "Alex Smith",
        customerEmail: "alex@example.com",
        productTitle: "Silk Gown",
        size: "10",
        rentalStart: "2026-09-15",
        rentalEnd: "2026-09-20",
        eventDate: "2026-09-18",
        rentalStatus: "confirmed",
        deliveryMethod: "post",
        shopifyOrderNumber: "1001",
        rentalCreatedAt: "2026-09-01T10:00:00.000Z",
        fulfillmentTrackingLink: null,
        returnTrackingLink: null,
      },
      "GK Drobe",
    );

    const rendered = renderNotificationEmail(
      "Hello {{customerFirstName}}",
      "Your rental starts {{rentalStartDate}}.\n\n{{products}}",
      tokens,
    );

    expect(rendered.subject).toBe("Hello Alex");
    expect(rendered.bodyText).toContain("Silk Gown · Size 10");
    expect(rendered.bodyHtml).toContain("<br>");
  });
});
