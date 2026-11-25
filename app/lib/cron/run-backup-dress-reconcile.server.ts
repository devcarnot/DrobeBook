import { getShopBackupDressDiscountConfig } from "../shop-settings.server";
import { listShopsWithAppData } from "../shop-data.server";
import { ensureAllBackupVariantsForShop } from "../booking/backup-dress-variant.server";
import { processBackupDressOrderWebhook } from "../booking/backup-dress-order-process.server";
import { unauthenticated } from "../../shopify.server";

const RECENT_ORDERS_QUERY = `#graphql
  query BackupDressReconcileOrders($query: String!) {
    orders(first: 50, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        legacyResourceId
        name
        lineItems(first: 50) {
          nodes {
            variant {
              legacyResourceId
            }
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            customAttributes {
              key
              value
            }
          }
        }
      }
    }
  }
`;

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function runBackupDressReconcileForAllShops(options?: {
  orderLookbackDays?: number;
}) {
  const lookback = options?.orderLookbackDays ?? 14;
  const shops = await listShopsWithAppData();
  let shopsProcessed = 0;
  let variantsSynced = 0;
  let ordersChecked = 0;
  let violationHits = 0;

  for (const shop of shops) {
    const config = await getShopBackupDressDiscountConfig(shop);
    if (!config.enabled) {
      continue;
    }

    let admin: AdminGraphql | null = null;
    try {
      ({ admin } = await unauthenticated.admin(shop));
    } catch (error) {
      console.warn(`[cron-backup-dress] admin session ${shop}:`, error);
      continue;
    }

    const sync = await ensureAllBackupVariantsForShop(admin, shop).catch((error) => {
      console.warn(`[cron-backup-dress] variant sync ${shop}:`, error);
      return null;
    });
    if (sync) {
      variantsSynced += sync.variantsAttempted ?? 0;
    }

    const query = `created_at:>=${daysAgoIso(lookback)}`;
    const response = await admin.graphql(RECENT_ORDERS_QUERY, { variables: { query } });
    const json = (await response.json()) as {
      data?: {
        orders?: {
          nodes?: Array<{
            legacyResourceId?: string;
            name?: string | null;
            lineItems?: {
              nodes?: Array<{
                variant?: { legacyResourceId?: string } | null;
                quantity?: number | null;
                originalUnitPriceSet?: { shopMoney?: { amount?: string } };
                customAttributes?: Array<{ key?: string; value?: string }>;
              }>;
            };
          }>;
        };
      };
    };

    const orders = json.data?.orders?.nodes ?? [];
    for (const order of orders) {
      const orderId = String(order.legacyResourceId ?? "");
      if (!orderId) {
        continue;
      }
      ordersChecked += 1;
      const lineItems =
        order.lineItems?.nodes?.map((row) => ({
          variant_id: row.variant?.legacyResourceId,
          quantity: row.quantity,
          price: row.originalUnitPriceSet?.shopMoney?.amount,
          properties: (row.customAttributes ?? []).map((attr) => ({
            name: attr.key,
            value: attr.value,
          })),
        })) ?? [];

      const result = await processBackupDressOrderWebhook({
        shop,
        topic: "reconcile/orders",
        orderId,
        orderName: order.name ?? null,
        lineItems,
        admin,
      }).catch((error) => {
        console.warn(`[cron-backup-dress] verify ${shop} ${orderId}:`, error);
        return { violations: 0 };
      });
      violationHits += result.violations;
    }

    shopsProcessed += 1;
  }

  return {
    shops: shops.length,
    shopsProcessed,
    ordersChecked,
    violationHits,
    variantsSynced,
    lookbackDays: lookback,
  };
}