import prisma from "../../db.server";
import { addDays, formatDateIso, toDateOnly } from "./availability";
import {
  DEFAULT_BUFFER_CONFIG,
  parseBufferConfig,
  type BufferConfig,
} from "./buffer-config";
import { getShopConfig, saveShopConfig } from "../shop-settings.server";

function expandBlockedRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  let current = toDateOnly(start);
  const last = toDateOnly(end);

  while (current.getTime() <= last.getTime()) {
    dates.push(formatDateIso(current));
    current = addDays(current, 1);
  }

  return dates;
}

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
    },
    select: {
      startDate: true,
      endDate: true,
    },
  });

  const holidays = new Set<string>();
  for (const row of rows) {
    for (const iso of expandBlockedRange(row.startDate, row.endDate)) {
      holidays.add(iso);
    }
  }

  return holidays;
}

export { DEFAULT_BUFFER_CONFIG, parseBufferConfig };
