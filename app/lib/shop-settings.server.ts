import prisma from "../db.server";
import {
  DEFAULT_SHOP_CONFIG,
  parseShopConfig,
  serializeShopConfig,
  type ShopConfig,
} from "./shop-config";
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

export { DEFAULT_WIDGET_CONFIG, DEFAULT_SHOP_CONFIG };
