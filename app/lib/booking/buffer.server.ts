import prisma from "../../db.server";
import { expandRangeToIsoDates } from "../blocked-dates.logic";
import {
  DEFAULT_BUFFER_CONFIG,
  parseBufferConfig,
  type BufferConfig,
} from "./buffer-config";
import { getShopConfig, saveShopConfig } from "../shop-settings.server";

export async function getShopBufferConfig(shop: string): Promise<BufferConfig> {
  const config = await getShopConfig(shop);
  return config.buffers;
}

export async function saveShopBufferConfig(
  shop: string,
  buffers: BufferConfig,
): Promise<BufferConfig> {
  const existing = await getShopConfig(shop);
  await saveShopConfig(shop, { ...existing, buffers });
  return buffers;
}

export async function getHolidayDates(shop: string): Promise<Set<string>> {
  const rows = await prisma.blockedDate.findMany({
    where: {
      shop,
      productId: null,
      variantId: null,
      appliesToHire: true,
    },
    select: {
      startDate: true,
      endDate: true,
      blockKind: true,
      weekdayMask: true,
      appliesToHire: true,
      appliesToTryOn: true,
      productId: true,
      variantId: true,
      reason: true,
    },
  });

  const holidays = new Set<string>();

  for (const row of rows) {
    if (row.blockKind === "weekly") {
      continue;
    }
    for (const iso of expandRangeToIsoDates(row.startDate, row.endDate)) {
      holidays.add(iso);
    }
  }

  return holidays;
}

export { DEFAULT_BUFFER_CONFIG, parseBufferConfig };
