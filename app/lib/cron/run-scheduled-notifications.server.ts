import {
  processScheduledAppointmentNotifications,
  processScheduledRentalNotifications,
} from "../notifications/notification.server";
import { listShopsWithAppData } from "../shop-data.server";

export async function runScheduledNotificationsForAllShops() {
  const shops = await listShopsWithAppData();
  let shopsProcessed = 0;
  let totalSent = 0;
  let totalProcessed = 0;

  for (const shop of shops) {
    const rental = await processScheduledRentalNotifications(shop).catch((error) => {
      console.warn(`[cron-notifications] Rental failed for ${shop}:`, error);
      return { processed: 0, sent: 0, error: true as const };
    });

    const appointment = await processScheduledAppointmentNotifications(shop).catch(
      (error) => {
        console.warn(`[cron-notifications] Appointment failed for ${shop}:`, error);
        return { processed: 0, sent: 0 };
      },
    );

    if ("error" in rental) {
      continue;
    }

    shopsProcessed += 1;
    totalSent += rental.sent + appointment.sent;
    totalProcessed += rental.processed + appointment.processed;
  }

  return {
    shops: shops.length,
    shopsProcessed,
    totalProcessed,
    totalSent,
  };
}
