import { describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_TEMPLATES } from "./notification-defaults";
import { normalizeNotificationsConfig } from "./notification-config";

describe("normalizeNotificationsConfig", () => {
  it("does not duplicate default templates when saved config repeats ids", () => {
    const duplicate = DEFAULT_NOTIFICATION_TEMPLATES[0];
    const config = normalizeNotificationsConfig({
      templates: [duplicate, duplicate, { ...duplicate, name: "Changed copy" }],
    });

    const rentalStartTemplates = config.templates.filter(
      (template) => template.id === duplicate.id,
    );

    expect(rentalStartTemplates).toHaveLength(1);
    expect(config.templates).toHaveLength(DEFAULT_NOTIFICATION_TEMPLATES.length);
  });

  it("keeps custom templates alongside defaults", () => {
    const config = normalizeNotificationsConfig({
      templates: [
        {
          id: "custom-template",
          name: "Custom",
          category: "rental_created",
          deliveryMethods: ["post"],
          channel: "email",
          subject: "Hi",
          body: "Body",
          automated: false,
          trigger: "manual",
          offsetDays: 0,
          active: true,
        },
      ],
    });

    expect(config.templates.some((template) => template.id === "custom-template")).toBe(true);
    expect(config.templates.length).toBe(DEFAULT_NOTIFICATION_TEMPLATES.length + 1);
  });
});
