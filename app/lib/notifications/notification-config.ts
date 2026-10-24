import {
  DEFAULT_NOTIFICATIONS_CONFIG,
  DEFAULT_NOTIFICATION_TEMPLATES,
} from "./notification-defaults";
import type { NotificationTemplate, NotificationsConfig } from "./notification.types";

/** Inactive sample templates removed from the product — drop from saved shop configs. */
const LEGACY_REMOVED_TEMPLATE_IDS = new Set([
  "rental-start-post",
  "return-reminder-post",
  "after-rental-all",
]);

function mergeTemplates(templates: NotificationTemplate[] | undefined) {
  const byId = new Map<string, NotificationTemplate>();

  for (const template of templates ?? []) {
    if (LEGACY_REMOVED_TEMPLATE_IDS.has(template.id)) {
      continue;
    }
    if (!byId.has(template.id)) {
      byId.set(template.id, template);
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
  };
}

export { DEFAULT_NOTIFICATIONS_CONFIG, DEFAULT_NOTIFICATION_TEMPLATES };
