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

/**
 * Blocked dates / shop blackouts are separate from buffer lead-time maths
 * (postage cut-off, before/after rental buffers). Do not feed them in here.
 */
export async function getHolidayDates(_shop: string): Promise<Set<string>> {
  return new Set();
}

export { DEFAULT_BUFFER_CONFIG, parseBufferConfig };