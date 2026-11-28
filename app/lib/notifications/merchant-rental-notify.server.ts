import { adminAppBaseUrl, sendMerchantNotifications } from "./merchant-notify.server";
import { buildRentalTokenMap } from "./notification-render";
import type {
  NotificationDeliveryMethod,
  NotificationTrigger,
  RentalNotificationContext,
} from "./notification.types";
import { getShopConfig } from "../shop-settings.server";
import { normalizeNotificationsConfig } from "./notification-config";

function withAdminUrls(
  shop: string,
  context: RentalNotificationContext,
): RentalNotificationContext {
  const base = adminAppBaseUrl();
  return {
    ...context,
    adminBookingUrl:
      context.adminBookingUrl ||
      `${base}/app/rentals/${context.bookingId}`,
    bookingReference: context.bookingReference || context.bookingId.slice(0, 8),
    bookingType: context.bookingType || "Hire",
  };
}

export async function notifyMerchantForRentalEvent(
  shop: string,
  context: RentalNotificationContext,
  trigger: NotificationTrigger,
  options?: {
    workflowStatus?: string;
    deliveryMethod?: NotificationDeliveryMethod;
    anchorDate?: string;
  },
) {
  const enriched = withAdminUrls(shop, context);
  const config = normalizeNotificationsConfig(
    (await getShopConfig(shop)).notifications,
  );
  const tokens = buildRentalTokenMap(
    enriched,
    config.fromName || shop.replace(/\.myshopify\.com$/i, ""),
  );

  const threshold = config.adminHighValueThresholdCents ?? 0;

  return sendMerchantNotifications(shop, {
    trigger,
    tokens,
    bookingId: context.bookingId,
    anchorDate: options?.anchorDate,
    workflowStatus: options?.workflowStatus,
    deliveryMethod: options?.deliveryMethod,
    templateFilter: (template) => {
      if (template.id === "admin-high-value-booking") {
        if (threshold <= 0) {
          return false;
        }
        const total = Number.parseFloat(
          String(tokens.orderTotal).replace(/[^\d.]/g, ""),
        );
        if (!Number.isFinite(total)) {
          return false;
        }
        return Math.round(total * 100) >= threshold;
      }
      return true;
    },
  });
}