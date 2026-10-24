import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { resolveDeliverableFromEmail } from "./notification-email.server";

describe("resolveDeliverableFromEmail", () => {
  const original = process.env.NOTIFICATION_FROM_EMAIL;

  beforeEach(() => {
    process.env.NOTIFICATION_FROM_EMAIL = "notifications@georgiekelly.com.au";
  });

  afterEach(() => {
    process.env.NOTIFICATION_FROM_EMAIL = original;
  });

  it("falls back to env when admin From is Gmail", () => {
    expect(resolveDeliverableFromEmail("gk.drobe@gmail.com")).toBe(
      "notifications@georgiekelly.com.au",
    );
  });

  it("uses admin From when it is a custom domain", () => {
    expect(resolveDeliverableFromEmail("hello@georgiekelly.com.au")).toBe(
      "hello@georgiekelly.com.au",
    );
  });
});
