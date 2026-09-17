import prisma from "../../db.server";
import { sendWaitlistNotification } from "../notifications/notification.server";
import { getShopConfig } from "../shop-settings.server";

const DEFAULT_CLAIM_WINDOW_HOURS = 48;

function generateClaimToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `claim-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function notifyNextWaitlistForGarment(
  shop: string,
  productId: string,
  variantId?: string | null,
) {
  const config = await getShopConfig(shop);
  const claimWindowHours =
    config.waitlist?.claimWindowHours ?? DEFAULT_CLAIM_WINDOW_HOURS;
  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + claimWindowHours * 60 * 60 * 1000);

  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      shop,
      productId,
      status: "waiting",
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
      ...(variantId ? { variantId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 1,
  });

  const entry = candidates[0];
  if (!entry) {
    return null;
  }

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

  void sendWaitlistNotification(shop, {
    email: updated.email,
    name: updated.name,
    productTitle: updated.productTitle,
    claimUrl: claimToken
      ? `https://${shop}/apps/gk-drobe/api/waitlist-claim?token=${encodeURIComponent(claimToken)}`
      : null,
  }).catch(() => undefined);

  return updated;
}

export async function getWaitlistForGarment(
  shop: string,
  productId: string,
  variantId: string,
) {
  return prisma.waitlistEntry.findMany({
    where: {
      shop,
      productId,
      OR: [{ variantId }, { variantId: null }],
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
): Promise<WaitlistDemandRow[]> {
  const entries = await prisma.waitlistEntry.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
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

  return [...byProduct.values()].sort((a, b) => b.total - a.total);
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

export function buildStorefrontClaimUrl(
  shop: string,
  productHandle: string,
  claimToken: string,
) {
  return `https://${shop}/products/${productHandle}?gk_claim=${encodeURIComponent(claimToken)}`;
}
