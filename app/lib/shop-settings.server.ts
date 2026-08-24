import prisma from "../db.server";
import {
  DEFAULT_WIDGET_CONFIG,
  parseWidgetConfig,
  serializeWidgetConfig,
  type WidgetConfig,
} from "./shop-settings";

export async function getShopWidgetConfig(shop: string): Promise<WidgetConfig> {
  const record = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  return parseWidgetConfig(record?.config);
}

export async function saveShopWidgetConfig(
  shop: string,
  config: WidgetConfig,
): Promise<WidgetConfig> {
  const serialized = serializeWidgetConfig(config);

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

export { DEFAULT_WIDGET_CONFIG };
