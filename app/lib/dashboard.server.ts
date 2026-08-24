import prisma from "../db.server";
import {
  DEFAULT_WIDGET_CONFIG,
  type WidgetConfig,
} from "./shop-settings";
import { getShopWidgetConfig } from "./shop-settings.server";

export type DashboardStats = {
  bookingCount: number;
  upcomingBookingCount: number;
  blockedDateCount: number;
  hasSavedSettings: boolean;
  damageProtectionConfigured: boolean;
  widgetTextsCustomized: boolean;
};

export async function getDashboardStats(shop: string): Promise<DashboardStats> {
  const now = new Date();

  const [bookingCount, upcomingBookingCount, blockedDateCount, settings, config] =
    await Promise.all([
      prisma.booking.count({ where: { shop } }),
      prisma.booking.count({
        where: {
          shop,
          status: { not: "cancelled" },
          startDate: { gte: now },
        },
      }),
      prisma.blockedDate.count({ where: { shop } }),
      prisma.shopSettings.findUnique({ where: { shop } }),
      getShopWidgetConfig(shop),
    ]);

  const widgetTextsCustomized =
    config.deliveryInstructions !== DEFAULT_WIDGET_CONFIG.deliveryInstructions ||
    config.postageNote !== DEFAULT_WIDGET_CONFIG.postageNote ||
    config.pickupLabel !== DEFAULT_WIDGET_CONFIG.pickupLabel ||
    config.postLabel !== DEFAULT_WIDGET_CONFIG.postLabel;

  return {
    bookingCount,
    upcomingBookingCount,
    blockedDateCount,
    hasSavedSettings: Boolean(settings),
    damageProtectionConfigured: Boolean(config.damageProtectionVariantId),
    widgetTextsCustomized,
  };
}
