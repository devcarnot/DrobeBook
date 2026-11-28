import type { WaitlistEntry } from "@prisma/client";

import prisma from "../../db.server";
import {
  evaluateProductAvailability,
  loadVariantAvailabilityData,
  normalizeShopifyResourceId,
} from "../booking/availability.server";
import {
  sendWaitlistNotification,
  sendWaitlistRemovedNotification,
} from "../notifications/notification.server";
import { getShopConfig } from "../shop-settings.server";
import { extractNumericId } from "../shopify-ids";
import {
  buildClaimStorefrontUrl as resolveClaimStorefrontUrl,
  deliveryDateFromWaitlistEvent,
} from "./waitlist-claim-url.server";

const DEFAULT_CLAIM_WINDOW_HOURS = 48;

export type WaitlistKind = "garment" | "try_on";

function generateClaimToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `claim-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function entryToNotificationContext(
  entry: WaitlistEntry,
  claimUrl: string | null,
) {
  return {
    email: entry.email,
    name: entry.name,
    productTitle: entry.productTitle,
    claimUrl,
    waitlistKind: (entry.kind === "try_on" ? "try_on" : "garment") as WaitlistKind,
    preferredDate: entry.preferredDate
      ? formatIsoDate(entry.preferredDate)
      : entry.eventDate
        ? formatIsoDate(entry.eventDate)
        : null,
    preferredTime: entry.preferredTime,
    durationMinutes: entry.durationMinutes,
  };
}

export function buildStorefrontClaimUrl(
  shop: string,
  productHandle: string,
  claimToken: string,
  options?: { tryOnDate?: string | null },
) {
  const params = new URLSearchParams();
  params.set("gk_claim", claimToken);
  if (options?.tryOnDate) {
    params.set("gk_tryon_date", options.tryOnDate);
  }
  return `https://${shop}/products/${productHandle}?${params.toString()}`;
}

export async function isGarmentWaitlistDateAvailable(
  shop: string,
  entry: WaitlistEntry,
): Promise<boolean> {
  if (!entry.eventDate || !entry.variantId?.trim()) {
    return false;
  }

  const shopConfig = await getShopConfig(shop);
  const durationDays = shopConfig.search.defaultDurationDays || 4;
  const productId = normalizeShopifyResourceId(entry.productId);
  const variantId = normalizeShopifyResourceId(entry.variantId);
  const deliveryDate = deliveryDateFromWaitlistEvent(entry.eventDate);

  const data = await loadVariantAvailabilityData(shop, productId, variantId);
  const result = evaluateProductAvailability(
    {
      productId,
      variantId,
      deliveryDate,
      durationDays,
      deliveryMethod: "post",
    },
    data,
  );

  return result.available;
}

async function promoteWaitlistEntry(
  shop: string,
  entry: WaitlistEntry,
  claimUrl: string | null,
) {
  const config = await getShopConfig(shop);
  const claimWindowHours =
    config.waitlist?.claimWindowHours ?? DEFAULT_CLAIM_WINDOW_HOURS;
  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + claimWindowHours * 60 * 60 * 1000);
  const claimToken = generateClaimToken();

  const updated = await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      notifiedAt: now,
      claimToken,
      claimExpiresAt,
      status: "contacted",
    },
  });

  const resolvedClaimUrl =
    claimUrl ?? (await resolveClaimStorefrontUrl(shop, updated, claimToken));

  void sendWaitlistNotification(
    shop,
    entryToNotificationContext(updated, resolvedClaimUrl),
  ).catch(() => undefined);

  return updated;
}

export async function notifyWaitlistEntryById(shop: string, entryId: string) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { shop, id: entryId, status: "waiting" },
  });

  if (!entry) {
    return { ok: false as const, error: "No waiting entry found for that id." };
  }

  const updated = await promoteWaitlistEntry(shop, entry, null);
  return { ok: true as const, entry: updated };
}

export async function notifyNextWaitlistForGarment(
  shop: string,
  productId: string,
  variantId?: string | null,
) {
  const now = new Date();

  const normalizedProductId = extractNumericId(productId);
  const normalizedVariantId = variantId
    ? extractNumericId(variantId)
    : null;

  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      shop,
      kind: "garment",
      productId: normalizedProductId,
      status: "waiting",
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
      ...(normalizedVariantId ? { variantId: normalizedVariantId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  for (const entry of candidates) {
    const dateOk = await isGarmentWaitlistDateAvailable(shop, entry);
    if (!dateOk) {
      continue;
    }
    return promoteWaitlistEntry(shop, entry, null);
  }

  return null;
}

export async function notifyNextWaitlistForTryOnSlot(
  shop: string,
  input: {
    date: Date;
    durationMinutes?: number | null;
    productId?: string | null;
  },
) {
  const now = new Date();
  const dayStart = new Date(`${formatIsoDate(input.date)}T00:00:00.000Z`);
  const dayEnd = new Date(`${formatIsoDate(input.date)}T23:59:59.999Z`);

  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      shop,
      kind: "try_on",
      status: "waiting",
      preferredDate: { gte: dayStart, lte: dayEnd },
      AND: [
        {
          OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const entry = candidates.find((candidate) => {
    if (
      input.durationMinutes &&
      candidate.durationMinutes &&
      candidate.durationMinutes !== input.durationMinutes
    ) {
      return false;
    }
    if (
      input.productId &&
      candidate.productId &&
      candidate.productId !== "try-on" &&
      candidate.productId !== input.productId
    ) {
      return false;
    }
    return true;
  });

  if (!entry) {
    return null;
  }

  return promoteWaitlistEntry(shop, entry, null);
}

export async function removeWaitlistEntry(
  shop: string,
  entryId: string,
  options: { notifyCustomer?: boolean } = {},
) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { shop, id: entryId },
  });

  if (!entry) {
    return { ok: false as const, error: "Waitlist entry not found." };
  }

  if (entry.status === "removed") {
    return { ok: true as const, alreadyRemoved: true };
  }

  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: "removed",
      claimToken: null,
      claimExpiresAt: null,
    },
  });

  if (options.notifyCustomer) {
    void sendWaitlistRemovedNotification(
      shop,
      entryToNotificationContext(entry, null),
    ).catch(() => undefined);
  }

  return { ok: true as const };
}

export async function getWaitlistForGarment(
  shop: string,
  productId: string,
  variantId: string,
) {
  return prisma.waitlistEntry.findMany({
    where: {
      shop,
      kind: "garment",
      productId,
      OR: [{ variantId }, { variantId: null }],
      status: { not: "removed" },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}

export type WaitlistDemandRow = {
  productId: string;
  productTitle: string;
  waiting: number;
  contacted: number;
  notified: number;
  total: number;
};

export async function getWaitlistDemandByProduct(
  shop: string,
  options?: { skip?: number; take?: number },
): Promise<{ rows: WaitlistDemandRow[]; total: number }> {
  const entries = await prisma.waitlistEntry.findMany({
    where: { shop, kind: "garment", status: { not: "removed" } },
    orderBy: { createdAt: "desc" },
    select: {
      productId: true,
      productTitle: true,
      status: true,
      notifiedAt: true,
    },
  });

  const byProduct = new Map<string, WaitlistDemandRow>();

  for (const entry of entries) {
    const key = entry.productId;
    const row = byProduct.get(key) ?? {
      productId: entry.productId,
      productTitle: entry.productTitle || `Product ${entry.productId}`,
      waiting: 0,
      contacted: 0,
      notified: 0,
      total: 0,
    };

    row.total += 1;
    if (entry.status === "contacted") {
      row.contacted += 1;
    } else if (entry.notifiedAt) {
      row.notified += 1;
    } else if (entry.status === "waiting") {
      row.waiting += 1;
    }

    if (entry.productTitle && !row.productTitle.startsWith("Product ")) {
      row.productTitle = entry.productTitle;
    }

    byProduct.set(key, row);
  }

  const all = [...byProduct.values()].sort((a, b) => b.total - a.total);
  const skip = options?.skip ?? 0;
  const take = options?.take;

  if (take != null) {
    return { rows: all.slice(skip, skip + take), total: all.length };
  }

  return { rows: all.slice(skip), total: all.length };
}

export async function validateWaitlistClaim(
  shop: string,
  claimToken: string,
) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: {
      shop,
      claimToken,
      status: { in: ["waiting", "contacted"] },
    },
  });

  if (!entry?.claimExpiresAt) {
    return null;
  }

  if (entry.claimExpiresAt.getTime() < Date.now()) {
    return null;
  }

  return entry;
}
