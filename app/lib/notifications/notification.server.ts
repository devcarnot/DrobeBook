import prisma from "../../db.server";
import { getShopConfig, saveShopConfig } from "../shop-settings.server";
import {
  DEFAULT_NOTIFICATIONS_CONFIG,
  DEFAULT_NOTIFICATION_TEMPLATES,
  normalizeNotificationsConfig,
} from "./notification-config";
import {
  sendNotificationEmail,
  type SendEmailResult,
} from "./notification-email.server";
import {
  adminAppBaseUrl,
  isCustomerTemplate,
  isMerchantTemplate,
  sendMerchantNotifications,
} from "./merchant-notify.server";
import { notifyMerchantForRentalEvent } from "./merchant-rental-notify.server";

type TemplateSendResult = SendEmailResult | { ok: boolean; skipped: true };

function wasSkipped(result: TemplateSendResult) {
  return "skipped" in result && result.skipped;
}
import {
  buildAppointmentTokenMap,
  buildRentalTokenMap,
  buildWaitlistTokenMap,
  renderNotificationEmail,
} from "./notification-render";
import type {
  AppointmentNotificationContext,
  NotificationDeliveryMethod,
  NotificationTemplate,
  NotificationTrigger,
  NotificationsConfig,
  RentalNotificationContext,
  WaitlistNotificationContext,
} from "./notification.types";

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDeliveryMethod(value: string | null | undefined): NotificationDeliveryMethod {
  if (value === "pickup") {
    return "pickup";
  }
  if (value === "local") {
    return "local";
  }
  return "post";
}

export async function getNotificationsConfig(shop: string) {
  const config = await getShopConfig(shop);
  return normalizeNotificationsConfig(config.notifications);
}

export async function saveNotificationsConfig(
  shop: string,
  notifications: NotificationsConfig,
) {
  const existing = await getShopConfig(shop);
  await saveShopConfig(shop, {
    ...existing,
    notifications: normalizeNotificationsConfig(notifications),
  });
  return notifications;
}

export function bookingToNotificationContext(booking: {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  pickupCollectionWindow?: string | null;
  productTitle: string | null;
  size: string;
  startDate: Date;
  endDate: Date;
  eventDate: Date;
  workflowStatus: string;
  deliveryMethod: string;
  orderId: string | null;
  createdAt: Date;
  fulfillmentTrackingLink: string | null;
  returnTrackingLink: string | null;
}): RentalNotificationContext {
  return {
    bookingId: booking.id,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    pickupCollectionWindow: booking.pickupCollectionWindow ?? null,
    productTitle: booking.productTitle,
    size: booking.size,
    rentalStart: formatIsoDate(booking.startDate),
    rentalEnd: formatIsoDate(booking.endDate),
    eventDate: formatIsoDate(booking.eventDate),
    rentalStatus: booking.workflowStatus,
    deliveryMethod: booking.deliveryMethod,
    shopifyOrderNumber: booking.orderId,
    rentalCreatedAt: booking.createdAt.toISOString(),
    fulfillmentTrackingLink: booking.fulfillmentTrackingLink,
    returnTrackingLink: booking.returnTrackingLink,
  };
}

function templateMatchesDeliveryMethod(
  template: NotificationTemplate,
  deliveryMethod: NotificationDeliveryMethod,
) {
  return template.deliveryMethods.includes(deliveryMethod);
}

function dedupeAutomatedTemplates(
  templates: NotificationTemplate[],
  templateId?: string,
) {
  if (templateId) {
    return templates;
  }

  const seen = new Set<string>();
  return templates.filter((template) => {
    const key = template.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildTriggerKey(input: {
  shop: string;
  templateId: string;
  bookingId?: string;
  email: string;
  anchorDate?: string;
}) {
  return [
    input.shop,
    input.templateId,
    input.bookingId ?? "none",
    input.email.toLowerCase(),
    input.anchorDate ?? "instant",
  ].join(":");
}

function manualResendAnchorDate() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `manual:${crypto.randomUUID()}`;
  }
  return `manual:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function recordNotificationSend(input: {
  shop: string;
  templateId: string;
  bookingId?: string;
  recipientEmail: string;
  subject: string;
  status: "sent" | "failed" | "skipped";
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

async function sendTemplateEmail(
  shop: string,
  config: NotificationsConfig,
  template: NotificationTemplate,
  recipientEmail: string,
  tokens: Record<string, string>,
  meta: {
    bookingId?: string;
    anchorDate?: string;
    ignoreGlobalDisabled?: boolean;
    /** Admin picked a template — always deliver, do not dedupe against automated sends. */
    allowResend?: boolean;
  },
): Promise<TemplateSendResult> {
  if (!template.active) {
    return { ok: false, skipped: true };
  }

  if (!config.enabled && !meta.ignoreGlobalDisabled) {
    return { ok: false, skipped: true };
  }

  const email = recipientEmail.trim().toLowerCase();
  if (!email) {
    return { ok: false, skipped: true };
  }

  const anchorDate = meta.allowResend
    ? manualResendAnchorDate()
    : meta.anchorDate;

  const triggerKey = buildTriggerKey({
    shop,
    templateId: template.id,
    bookingId: meta.bookingId,
    email,
    anchorDate,
  });

  if (!meta.allowResend) {
    const existing = await prisma.notificationSend.findUnique({
      where: { triggerKey },
    });
    if (existing && existing.status !== "failed") {
      return { ok: true, skipped: true };
    }
  }

  const { subject, bodyHtml, bodyText } = renderNotificationEmail(
    template.subject,
    template.body,
    tokens,
  );

  const result = await sendNotificationEmail(shop, {
    to: email,
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
    recipientEmail: email,
    subject,
    status: result.ok ? "sent" : "failed",
    triggerKey,
    error: result.error,
  });

  return result;
}

function shopDisplayName(shop: string) {
  return shop.replace(/\.myshopify\.com$/i, "").replace(/[-_]/g, " ");
}

export async function sendRentalNotification(
  shop: string,
  context: RentalNotificationContext,
  options: {
    trigger: NotificationTrigger;
    workflowStatus?: string;
    templateId?: string;
    anchorDate?: string;
  },
) {
  const config = await getNotificationsConfig(shop);
  const deliveryMethod = normalizeDeliveryMethod(context.deliveryMethod);
  const tokens = buildRentalTokenMap(context, config.fromName || shopDisplayName(shop));
  const email = context.customerEmail?.trim().toLowerCase();

  if (!email) {
    return { sent: 0, skipped: 1 };
  }

  const templates = config.templates.filter((template) => {
    if (options.templateId) {
      return template.id === options.templateId;
    }

    if (!templateMatchesDeliveryMethod(template, deliveryMethod)) {
      return false;
    }

    if (options.trigger === "manual") {
      return template.trigger === "manual";
    }

    if (!isCustomerTemplate(template)) {
      return false;
    }

    if (template.trigger !== options.trigger) {
      return false;
    }

    if (
      options.trigger === "on_status_change" &&
      template.workflowStatus &&
      template.workflowStatus !== options.workflowStatus
    ) {
      return false;
    }

    return true;
  });

  const templatesToSend = dedupeAutomatedTemplates(templates, options.templateId);

  if (!templatesToSend.length) {
    return {
      sent: 0,
      skipped: 0,
      error: options.templateId
        ? "That notification template is inactive or missing."
        : "No active notification template matched this rental.",
    };
  }

  let sent = 0;
  let warning: string | undefined;
  let lastError: string | undefined;

  for (const template of templatesToSend) {
    if (
      template.id === "pickup-collection-reminder" &&
      !context.pickupCollectionWindow?.trim()
    ) {
      continue;
    }
    if (
      template.id === "rental-upcoming-pickup" &&
      context.pickupCollectionWindow?.trim()
    ) {
      continue;
    }

    const result = await sendTemplateEmail(shop, config, template, email, tokens, {
      bookingId: context.bookingId,
      anchorDate: options.anchorDate,
      ignoreGlobalDisabled: Boolean(options.templateId),
      allowResend: Boolean(options.templateId),
    });

    if (wasSkipped(result)) {
      continue;
    }

    if (!result.ok) {
      lastError = "error" in result ? result.error : "Could not send email.";
      continue;
    }

    sent += 1;
    if ("warning" in result && result.warning) {
      warning = result.warning;
    }
  }

  if (sent === 0) {
    return {
      sent: 0,
      skipped: templatesToSend.length,
      error:
        lastError ??
        (options.templateId
          ? "Email was not sent. Check Resend logs or notification settings."
          : "Email was not sent. Check that the template is active and notification settings are enabled."),
    };
  }

  if (
    !options.templateId &&
    (options.trigger === "on_create" || options.trigger === "on_status_change")
  ) {
    void notifyMerchantForRentalEvent(shop, context, options.trigger, {
      workflowStatus: options.workflowStatus,
      deliveryMethod,
      anchorDate: options.anchorDate,
    }).catch((error) => {
      console.warn("[merchant-notify] rental", error);
    });
  }

  return {
    sent,
    skipped: templatesToSend.length - sent,
    warning,
    provider: warning ? "log" : "resend",
  };
}

export async function sendWaitlistAdminCreatedNotification(
  shop: string,
  context: WaitlistNotificationContext,
  options?: { entryId?: string },
) {
  const config = await getNotificationsConfig(shop);
  const tokens = buildWaitlistTokenMap(context, config.fromName || shopDisplayName(shop));
  return sendMerchantNotifications(shop, {
    trigger: "on_waitlist_created",
    tokens,
    bookingId: options?.entryId,
    anchorDate: formatIsoDate(new Date()),
  });
}

export async function sendWaitlistNotification(
  shop: string,
  context: WaitlistNotificationContext,
) {
  const config = await getNotificationsConfig(shop);
  const email = context.email.trim().toLowerCase();
  if (!email) {
    return { sent: 0, skipped: 1 };
  }

  const tokens = buildWaitlistTokenMap(context, config.fromName || shopDisplayName(shop));
  const templates = config.templates.filter(
    (template) =>
      template.trigger === "on_waitlist_notify" && isCustomerTemplate(template),
  );

  let sent = 0;
  for (const template of templates) {
    const result = await sendTemplateEmail(shop, config, template, email, tokens, {
      anchorDate: formatIsoDate(new Date()),
    });
    if (result.ok && !wasSkipped(result)) {
      sent += 1;
    }
  }

  return { sent, skipped: templates.length - sent };
}

export async function sendWaitlistRemovedNotification(
  shop: string,
  context: WaitlistNotificationContext,
) {
  const config = await getNotificationsConfig(shop);
  const email = context.email.trim().toLowerCase();
  if (!email) {
    return { sent: 0, skipped: 1 };
  }

  const tokens = buildWaitlistTokenMap(context, config.fromName || shopDisplayName(shop));
  const templates = config.templates.filter(
    (template) =>
      template.trigger === "on_waitlist_removed" &&
      template.active &&
      isCustomerTemplate(template),
  );

  let sent = 0;
  for (const template of templates) {
    const result = await sendTemplateEmail(shop, config, template, email, tokens, {
      anchorDate: formatIsoDate(new Date()),
    });
    if (result.ok && !wasSkipped(result)) {
      sent += 1;
    }
  }

  return { sent, skipped: templates.length - sent };
}

export async function sendAppointmentNotification(
  shop: string,
  context: AppointmentNotificationContext,
  options?: {
    trigger?: NotificationTrigger;
    templateId?: string;
    anchorDate?: string;
  },
) {
  const config = await getNotificationsConfig(shop);
  const email = context.customerEmail?.trim().toLowerCase();
  if (!email) {
    return { sent: 0, skipped: 1 };
  }

  const trigger = options?.trigger ?? "on_appointment_confirm";
  const tokens = buildAppointmentTokenMap(
    context,
    config.fromName || shopDisplayName(shop),
  );
  const templates = config.templates.filter((template) => {
    if (options?.templateId) {
      return template.id === options.templateId;
    }
    return (
      template.trigger === trigger && template.active && isCustomerTemplate(template)
    );
  });

  let sent = 0;
  for (const template of templates) {
    const result = await sendTemplateEmail(shop, config, template, email, tokens, {
      bookingId: context.appointmentId,
      anchorDate: options?.anchorDate ?? context.appointmentDate,
      ignoreGlobalDisabled: Boolean(options?.templateId),
      allowResend: Boolean(options?.templateId),
    });
    if (result.ok && !wasSkipped(result)) {
      sent += 1;
    }
  }

  if (!options?.templateId) {
    const adminTokens = {
      ...tokens,
      adminAppointmentUrl: `${adminAppBaseUrl()}/app/inventory`,
    };
    void sendMerchantNotifications(shop, {
      trigger,
      tokens: adminTokens,
      bookingId: context.appointmentId,
      anchorDate: options?.anchorDate ?? context.appointmentDate,
    }).catch((error) => console.warn("[merchant-notify] appointment", error));
  }

  return { sent, skipped: templates.length - sent };
}

export async function sendTryOnItemUnavailableNotification(
  shop: string,
  context: AppointmentNotificationContext,
) {
  return sendAppointmentNotification(shop, context, {
    trigger: "on_appointment_item_unavailable",
  });
}

export function appointmentBookingToNotificationContext(booking: {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  date: Date;
  time: string;
  durationMinutes: number;
  itemsToTryOn: string | null;
}): AppointmentNotificationContext {
  return {
    appointmentId: booking.id,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    appointmentDate: formatIsoDate(booking.date),
    appointmentTime: booking.time,
    durationMinutes: booking.durationMinutes,
    itemsToTryOn: booking.itemsToTryOn,
  };
}

function anchorDateForTemplate(
  booking: RentalNotificationContext,
  template: NotificationTemplate,
) {
  const base =
    template.trigger === "days_before_start" || template.trigger === "on_start_date"
      ? booking.rentalStart
      : template.trigger === "days_before_end" ||
          template.trigger === "on_end_date" ||
          template.trigger === "days_after_end"
        ? booking.rentalEnd
        : booking.rentalCreatedAt.slice(0, 10);

  const date = new Date(`${base}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + template.offsetDays);
  return formatIsoDate(date);
}

function isDueToday(anchorDate: string, today = formatIsoDate(new Date())) {
  return anchorDate === today;
}

export async function processScheduledRentalNotifications(shop: string) {
  const config = await getNotificationsConfig(shop);
  if (!config.enabled) {
    return { processed: 0, sent: 0 };
  }

  const scheduledTriggers = new Set<NotificationTrigger>([
    "days_before_start",
    "on_start_date",
    "days_before_end",
    "on_end_date",
    "days_after_end",
  ]);

  const templates = config.templates.filter(
    (template) => template.automated && template.active && scheduledTriggers.has(template.trigger),
  );

  if (!templates.length) {
    return { processed: 0, sent: 0 };
  }

  const bookings = await prisma.booking.findMany({
    where: {
      shop,
      status: "confirmed",
      workflowStatus: { not: "cancelled" },
    },
    take: 500,
  });

  let processed = 0;
  let sent = 0;

  for (const booking of bookings) {
    const context = bookingToNotificationContext(booking);
    const deliveryMethod = normalizeDeliveryMethod(booking.deliveryMethod);

    for (const template of templates) {
      if (!templateMatchesDeliveryMethod(template, deliveryMethod)) {
        continue;
      }

      const anchorDate = anchorDateForTemplate(context, template);
      if (!isDueToday(anchorDate)) {
        continue;
      }

      processed += 1;
      const result = isMerchantTemplate(template)
        ? await notifyMerchantForRentalEvent(shop, context, template.trigger, {
            deliveryMethod,
            anchorDate,
          })
        : await sendRentalNotification(shop, context, {
            trigger: template.trigger,
            anchorDate,
            templateId: template.id,
          });
      sent += result.sent;
    }
  }

  return { processed, sent };
}

function anchorDateForAppointment(
  context: AppointmentNotificationContext,
  template: NotificationTemplate,
) {
  const date = new Date(`${context.appointmentDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + template.offsetDays);
  return formatIsoDate(date);
}

export async function processScheduledAppointmentNotifications(shop: string) {
  const config = await getNotificationsConfig(shop);
  if (!config.enabled) {
    return { processed: 0, sent: 0 };
  }

  const templates = config.templates.filter(
    (template) =>
      template.automated &&
      template.active &&
      template.trigger === "days_before_appointment",
  );

  if (!templates.length) {
    return { processed: 0, sent: 0 };
  }

  const today = formatIsoDate(new Date());
  const horizon = new Date(`${today}T12:00:00.000Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 14);

  const appointments = await prisma.appointmentBooking.findMany({
    where: {
      shop,
      date: { gte: new Date(`${today}T00:00:00.000Z`), lte: horizon },
    },
    take: 500,
  });

  let processed = 0;
  let sent = 0;

  for (const appointment of appointments) {
    const context = appointmentBookingToNotificationContext(appointment);

    for (const template of templates) {
      const anchorDate = anchorDateForAppointment(context, template);
      if (!isDueToday(anchorDate)) {
        continue;
      }

      processed += 1;
      const result = await sendAppointmentNotification(shop, context, {
        trigger: template.trigger,
        anchorDate,
        templateId: template.id,
      });
      sent += result.sent;
    }
  }

  return { processed, sent };
}

export async function listRecentNotificationSends(shop: string, bookingId?: string) {
  return prisma.notificationSend.findMany({
    where: {
      shop,
      ...(bookingId ? { bookingId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: bookingId ? 20 : 50,
  });
}

export function notificationsConfigFromFormData(formData: FormData): NotificationsConfig {
  const templatesRaw = String(formData.get("templatesJson") ?? "").trim();
  let templates = DEFAULT_NOTIFICATION_TEMPLATES.map((entry) => ({ ...entry }));

  if (templatesRaw) {
    try {
      templates = normalizeNotificationsConfig({
        templates: JSON.parse(templatesRaw) as NotificationTemplate[],
      }).templates;
    } catch {
      templates = DEFAULT_NOTIFICATION_TEMPLATES.map((entry) => ({ ...entry }));
    }
  }

  return normalizeNotificationsConfig({
    enabled: String(formData.get("enabled") ?? "true") === "true",
    fromName: String(formData.get("fromName") ?? DEFAULT_NOTIFICATIONS_CONFIG.fromName),
    fromEmail: String(formData.get("fromEmail") ?? ""),
    replyToEmail: String(formData.get("replyToEmail") ?? ""),
    adminNotifyEmail: String(formData.get("adminNotifyEmail") ?? ""),
    adminHighValueThresholdCents:
      Number.parseInt(String(formData.get("adminHighValueThresholdCents") ?? "0"), 10) || 0,
    templates,
  });
}

export function notificationTemplateFromFormData(
  formData: FormData,
  existing?: NotificationTemplate,
): NotificationTemplate {
  const deliveryMethods = formData
    .getAll("deliveryMethods")
    .map((value) => String(value))
    .filter(Boolean) as NotificationDeliveryMethod[];

  return {
    id: String(formData.get("id") ?? existing?.id ?? crypto.randomUUID()),
    name: String(formData.get("name") ?? "Notification"),
    category: String(formData.get("category") ?? "rental_created") as NotificationTemplate["category"],
    deliveryMethods: deliveryMethods.length
      ? deliveryMethods
      : existing?.deliveryMethods ?? ["post", "pickup", "local"],
    channel: "email",
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    automated: String(formData.get("automated") ?? "false") === "true",
    trigger: String(formData.get("trigger") ?? "manual") as NotificationTrigger,
    offsetDays: Number.parseInt(String(formData.get("offsetDays") ?? "0"), 10) || 0,
    workflowStatus: String(formData.get("workflowStatus") ?? "") || undefined,
    active: String(formData.get("active") ?? "false") === "true",
    recipient:
      String(formData.get("recipient") ?? existing?.recipient ?? "customer") === "merchant"
        ? "merchant"
        : "customer",
  };
}
