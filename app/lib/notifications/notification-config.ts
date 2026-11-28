import {
  DEFAULT_NOTIFICATIONS_CONFIG,
  DEFAULT_NOTIFICATION_TEMPLATES,
} from "./notification-defaults";
import type { NotificationTemplate, NotificationsConfig } from "./notification.types";

function coerceEmailChannel(template: NotificationTemplate): NotificationTemplate {
  const recipient =
    template.recipient ??
    (template.category === "admin_alert" || template.category === "waitlist_admin_new"
      ? "merchant"
      : "customer");
  return { ...template, channel: "email", recipient };
}

function mergeTemplates(templates: NotificationTemplate[] | undefined) {
  const byId = new Map<string, NotificationTemplate>();

  for (const template of templates ?? []) {
    if (!byId.has(template.id)) {
      byId.set(template.id, coerceEmailChannel(template));
    }
  }

  for (const fallback of DEFAULT_NOTIFICATION_TEMPLATES) {
    if (!byId.has(fallback.id)) {
      byId.set(fallback.id, { ...fallback });
    }
  }

  return DEFAULT_NOTIFICATION_TEMPLATES.map(
    (fallback) => byId.get(fallback.id) ?? { ...fallback },
  ).concat(
    [...byId.values()].filter(
      (template) => !DEFAULT_NOTIFICATION_TEMPLATES.some((fallback) => fallback.id === template.id),
    ),
  );
}

export function normalizeNotificationsConfig(
  config: Partial<NotificationsConfig> | undefined,
): NotificationsConfig {
  const merged = {
    ...DEFAULT_NOTIFICATIONS_CONFIG,
    ...(config ?? {}),
    templates: mergeTemplates(config?.templates),
  };

  return {
    ...merged,
    fromName: String(merged.fromName ?? DEFAULT_NOTIFICATIONS_CONFIG.fromName),
    fromEmail: String(merged.fromEmail ?? ""),
    replyToEmail: String(merged.replyToEmail ?? ""),
    adminNotifyEmail: String(merged.adminNotifyEmail ?? ""),
    adminHighValueThresholdCents: Number.isFinite(
      Number(merged.adminHighValueThresholdCents),
    )
      ? Math.max(0, Math.round(Number(merged.adminHighValueThresholdCents)))
      : 0,
  };
}

export { DEFAULT_NOTIFICATIONS_CONFIG, DEFAULT_NOTIFICATION_TEMPLATES };
