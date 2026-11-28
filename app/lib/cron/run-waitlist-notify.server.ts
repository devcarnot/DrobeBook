import prisma from "../../db.server";
import { listShopsWithAppData } from "../shop-data.server";
import { extractNumericId } from "../shopify-ids";
import { notifyNextWaitlistForGarment } from "../waitlist/waitlist-notify.server";

export async function runWaitlistAutoNotifyForShop(shop: string) {
  const waiting = await prisma.waitlistEntry.findMany({
    where: {
      shop,
      kind: "garment",
      status: "waiting",
      eventDate: { not: null },
      variantId: { not: null },
    },
    select: {
      productId: true,
      variantId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Set<string>();
  let notified = 0;

  for (const row of waiting) {
    if (!row.variantId) {
      continue;
    }
    const key = `${extractNumericId(row.productId)}:${extractNumericId(row.variantId)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const result = await notifyNextWaitlistForGarment(
      shop,
      row.productId,
      row.variantId,
    );
    if (result) {
      notified += 1;
    }
  }

  return { shop, notified, scanned: seen.size };
}

export async function runWaitlistAutoNotifyForAllShops() {
  const shops = await listShopsWithAppData();

  const results = [];
  for (const shop of shops) {
    results.push(await runWaitlistAutoNotifyForShop(shop));
  }

  const notified = results.reduce((sum, row) => sum + row.notified, 0);
  return { shops: results.length, notified, results };
}