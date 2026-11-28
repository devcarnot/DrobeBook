import type { NotificationTemplate } from "./notification.types";

/** Safe for client + server (notification settings UI). */
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