import prisma from "../db.server";
import {
  DEFAULT_SHOP_CONFIG,
  DEFAULT_APPOINTMENT_CONFIG,
  DEFAULT_SEARCH_CONFIG,
  parseShopConfig,
  serializeShopConfig,
  type AppointmentConfig,
  type SearchConfig,
  type ShopConfig,
} from "./shop-config";
import {
  DEFAULT_CLUTCH_UPSELL_CONFIG,
  type ClutchUpsellConfig,
} from "./cart/clutch-upsell-config";
import {
  DEFAULT_BACKUP_DRESS_DISCOUNT_CONFIG,
  normalizeBackupDressDiscountConfig,
  type BackupDressDiscountConfig,
} from "./booking/backup-dress-discount-config";
import {
  DEFAULT_WIDGET_CONFIG,
  type WidgetConfig,
} from "./shop-settings";

export async function getShopConfig(shop: string): Promise<ShopConfig> {
  const record = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  return parseShopConfig(record?.config);
}

export async function saveShopConfig(
  shop: string,
  config: ShopConfig,
): Promise<ShopConfig> {
  const serialized = serializeShopConfig(config);

  await prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      config: serialized,
    },
    update: {
      config: serialized,
    },
  });

  return config;
}

export async function getShopWidgetConfig(shop: string): Promise<WidgetConfig> {
  const config = await getShopConfig(shop);
  return config.widget;
}

export async function saveShopWidgetConfig(
  shop: string,
  widget: WidgetConfig,
): Promise<WidgetConfig> {
  const existing = await getShopConfig(shop);
  await saveShopConfig(shop, {
    ...existing,
    widget,
  });
  return widget;
}

export async function getShopAppointmentConfig(
  shop: string,
): Promise<AppointmentConfig> {
  const config = await getShopConfig(shop);
  return config.appointment;
}

export async function saveShopAppointmentConfig(
  shop: string,
  appointment: AppointmentConfig,
): Promise<AppointmentConfig> {
  const existing = await getShopConfig(shop);
  await saveShopConfig(shop, {
    ...existing,
    appointment,
  });
  return appointment;
}

export async function getShopSearchConfig(shop: string): Promise<SearchConfig> {
  const config = await getShopConfig(shop);
  return config.search;
}

export async function saveShopSearchConfig(
  shop: string,
  search: SearchConfig,
): Promise<SearchConfig> {
  const existing = await getShopConfig(shop);
  await saveShopConfig(shop, {
    ...existing,
    search,
  });
  return search;
}

export async function getShopClutchUpsellConfig(shop: string): Promise<ClutchUpsellConfig> {
  const config = await getShopConfig(shop);
  return config.clutchUpsell;
}

export async function saveShopClutchUpsellConfig(
  shop: string,
  clutchUpsell: ClutchUpsellConfig,
): Promise<ClutchUpsellConfig> {
  const existing = await getShopConfig(shop);
  await saveShopConfig(shop, {
    ...existing,
    clutchUpsell,
  });
  return clutchUpsell;
}

export async function getShopBackupDressDiscountConfig(
  shop: string,
): Promise<BackupDressDiscountConfig> {
  const config = await getShopConfig(shop);
  return normalizeBackupDressDiscountConfig(config.backupDressDiscount);
}

export async function saveShopBackupDressDiscountConfig(
  shop: string,
  backupDressDiscount: BackupDressDiscountConfig,
): Promise<BackupDressDiscountConfig> {
  const existing = await getShopConfig(shop);
  const normalized = normalizeBackupDressDiscountConfig(backupDressDiscount);
  await saveShopConfig(shop, {
    ...existing,
    backupDressDiscount: normalized,
  });
  return normalized;
}

export {
  DEFAULT_WIDGET_CONFIG,
  DEFAULT_SHOP_CONFIG,
  DEFAULT_APPOINTMENT_CONFIG,
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_CLUTCH_UPSELL_CONFIG,
  DEFAULT_BACKUP_DRESS_DISCOUNT_CONFIG,
};
