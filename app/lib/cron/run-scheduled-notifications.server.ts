import { processScheduledRentalNotifications } from "../notifications/notification.server";
import { listShopsWithAppData } from "../shop-data.server";

export async function runScheduledNotificationsForAllShops() {
  const shops = await listShopsWithAppData();
  let shopsProcessed = 0;
  let totalSent = 0;
  let totalProcessed = 0;

  for (const shop of shops) {
    const result = await processScheduledRentalNotifications(shop).catch((error) => {
      console.warn(`[cron-notifications] Failed for ${shop}:`, error);
      return { processed: 0, sent: 0, error: true as const };
    });

    if ("error" in result) {
      continue;
    }

    shopsProcessed += 1;
    totalSent += result.sent;
    totalProcessed += result.processed;
  }

  return {
    shops: shops.length,
    shopsProcessed,
    totalProcessed,
    totalSent,
  };
}
