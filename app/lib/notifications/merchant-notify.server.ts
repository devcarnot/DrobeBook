import prisma from "../../db.server";
import { getShopConfig } from "../shop-settings.server";
import { normalizeNotificationsConfig } from "./notification-config";
import { renderNotificationEmail } from "./notification-render";
import { sendNotificationEmail } from "./notification-email.server";
import { withNotificationTokenAliases } from "./notification-token-aliases";
import type {
  NotificationDeliveryMethod,
  NotificationTemplate,
  NotificationTrigger,
  NotificationsConfig,
} from "./notification.types";

function shopDisplayName(shop: string) {
  return shop.replace(/\.myshopify\.com$/i, "").replace(/[-_]/g, " ");
}

export function resolveMerchantNotificationEmail(config: NotificationsConfig) {
  const admin = config.adminNotifyEmail?.trim();
  if (admin && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin)) {
    return admin;
  }
  const reply = config.replyToEmail.trim();
  if (reply && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply)) {
    return reply;
  }
  const from = config.fromEmail.trim();
  if (from && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    return from;
  }
  return "";
}

function buildTriggerKey(input: {
  shop: string;
  templateId: string;
  bookingId?: string;
  email: string;
  anchorDate?: string;
}) {
  const parts = [
    input.shop,
    input.templateId,
    input.bookingId ?? "none",
    input.email,
    input.anchorDate ?? "event",
  ];
  return parts.join(":");
}

async function recordNotificationSend(input: {
  shop: string;
  templateId: string;
  bookingId?: string;
  recipientEmail: string;
  subject: string;
  status: "sent" | "failed";
  triggerKey: string;
  error?: string;
}) {
  try {
    await prisma.notificationSend.create({
      data: {
        shop: input.shop,
        templateId: input.templateId,
        bookingId: input.bookingId ?? null,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        status: input.status,
        triggerKey: input.triggerKey,
        error: input.error ?? null,
      },
    });
  } catch {
    // Duplicate trigger key — already sent.
  }
}

async function sendMerchantTemplate(
  shop: string,
  config: NotificationsConfig,
  template: NotificationTemplate,
  merchantEmail: string,
  tokens: Record<string, string>,
  meta: { bookingId?: string; anchorDate?: string },
) {
  if (!template.active || !template.automated) {
    return { ok: false, skipped: true as const };
  }

  if (!config.enabled) {
    return { ok: false, skipped: true as const };
  }

  const enriched = withNotificationTokenAliases(tokens);
  const { subject, bodyHtml, bodyText } = renderNotificationEmail(
    template.subject,
    template.body,
    enriched,
  );

  const triggerKey = buildTriggerKey({
    shop,
    templateId: template.id,
    bookingId: meta.bookingId,
    email: merchantEmail,
    anchorDate: meta.anchorDate,
  });

  const existing = await prisma.notificationSend.findUnique({
    where: { triggerKey },
  });
  if (existing && existing.status !== "failed") {
    return { ok: true, skipped: true as const };
  }

  const result = await sendNotificationEmail(shop, {
    to: merchantEmail,
    subject,
    bodyHtml,
    bodyText,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    replyTo: config.replyToEmail,
  });

  await recordNotificationSend({
    shop,
    templateId: template.id,
    bookingId: meta.bookingId,
    recipientEmail: merchantEmail,
    subject,
    status: result.ok ? "sent" : "failed",
    triggerKey,
    error: result.error,
  });

  return result;
}

export function isMerchantTemplate(template: NotificationTemplate) {
  return (
    template.recipient === "merchant" ||
    template.category === "admin_alert" ||
    template.category === "waitlist_admin_new"
  );
}

export function isCustomerTemplate(template: NotificationTemplate) {
  return !isMerchantTemplate(template);
}

async function getNotificationsConfig(shop: string) {
  const config = await getShopConfig(shop);
  return normalizeNotificationsConfig(config.notifications);
}

export async function sendMerchantNotifications(
  shop: string,
  options: {
    trigger: NotificationTrigger;
    tokens: Record<string, string>;
    bookingId?: string;
    anchorDate?: string;
    workflowStatus?: string;
    deliveryMethod?: NotificationDeliveryMethod;
    templateFilter?: (template: NotificationTemplate) => boolean;
  },
) {
  const config = await getNotificationsConfig(shop);
  const merchantEmail = resolveMerchantNotificationEmail(config);
  if (!merchantEmail) {
    console.warn(
      "[merchant-notify] Skipped — set Admin notification email or Reply-To in Notifications.",
    );
    return { sent: 0, skipped: 1, error: "merchant_email_missing" as const };
  }

  const shopName = config.fromName || shopDisplayName(shop);
  const tokens = {
    merchantName: shopName,
    shopName,
    ...options.tokens,
  };

  const templates = config.templates.filter((template) => {
    if (!isMerchantTemplate(template)) {
      return false;
    }
    if (template.trigger !== options.trigger) {
      return false;
    }
    if (
      options.workflowStatus &&
      template.workflowStatus &&
      template.workflowStatus !== options.workflowStatus
    ) {
      return false;
    }
    if (
      options.deliveryMethod &&
      template.deliveryMethods.length > 0 &&
      !template.deliveryMethods.includes(options.deliveryMethod)
    ) {
      return false;
    }
    if (options.templateFilter && !options.templateFilter(template)) {
      return false;
    }
    return true;
  });

  let sent = 0;
  for (const template of templates) {
    const result = await sendMerchantTemplate(shop, config, template, merchantEmail, tokens, {
      bookingId: options.bookingId,
      anchorDate: options.anchorDate ?? new Date().toISOString().slice(0, 10),
    });
    if (result.ok && !("skipped" in result && result.skipped)) {
      sent += 1;
    }
  }

  return { sent, skipped: templates.length - sent };
}

export function adminAppBaseUrl() {
  return (
    process.env.SHOPIFY_APP_URL?.replace(/\/$/, "") ||
    "https://drobebook-production.up.railway.app"
  );
}