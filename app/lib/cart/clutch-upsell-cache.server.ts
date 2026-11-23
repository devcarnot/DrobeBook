type ClutchCacheEntry = {
  at: number;
  body: string;
};

const CLUTCH_RESPONSE_CACHE = new Map<string, ClutchCacheEntry>();
const CLUTCH_CACHE_TTL_MS = 90_000;

export function clutchResponseCacheKey(parts: Record<string, string>): string {
  return Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key]}`)
    .join("&");
}

export function readClutchResponseCache(key: string): string | null {
  const entry = CLUTCH_RESPONSE_CACHE.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.at > CLUTCH_CACHE_TTL_MS) {
    CLUTCH_RESPONSE_CACHE.delete(key);
    return null;
  }
  return entry.body;
}

export function writeClutchResponseCache(key: string, body: string): void {
  CLUTCH_RESPONSE_CACHE.set(key, { at: Date.now(), body });
  if (CLUTCH_RESPONSE_CACHE.size > 200) {
    const oldest = [...CLUTCH_RESPONSE_CACHE.entries()].sort(
      (a, b) => a[1].at - b[1].at,
    )[0];
    if (oldest) {
      CLUTCH_RESPONSE_CACHE.delete(oldest[0]);
    }
  }
}