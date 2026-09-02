/**
 * Fetches garment acquisition cost from Shopify InventoryItem.unitCost.
 *
 * Requires read_inventory scope. Shopify also gates this behind the staff
 * "View product costs" permission — if the merchant's account lacks it, the
 * API returns null and we show "Not set" rather than erroring.
 *
 * PROFIT ASSUMPTION (confirm with client): profit = totalRevenue − unitCost once
 * per garment (acquisition cost), NOT per-rental cleaning/maintenance costs.
 */

export type VariantUnitCost = {
  amount: number | null;
  currencyCode: string | null;
  available: boolean;
};

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const VARIANT_COST_QUERY = `#graphql
  query VariantUnitCost($id: ID!) {
    productVariant(id: $id) {
      id
      inventoryItem {
        unitCost {
          amount
          currencyCode
        }
      }
    }
  }
`;

function toVariantGid(variantId: string): string {
  if (variantId.startsWith("gid://")) {
    return variantId;
  }
  return `gid://shopify/ProductVariant/${variantId}`;
}

function formatMoney(amount: number, currencyCode: string | null): string {
  if (currencyCode === "AUD" || !currencyCode) {
    return `$${amount.toFixed(2)}`;
  }
  return `${currencyCode} ${amount.toFixed(2)}`;
}

export async function fetchVariantUnitCost(
  admin: AdminGraphqlClient,
  variantId: string,
): Promise<VariantUnitCost> {
  try {
    const response = await admin.graphql(VARIANT_COST_QUERY, {
      variables: { id: toVariantGid(variantId) },
    });
    const json = (await response.json()) as {
      data?: {
        productVariant?: {
          inventoryItem?: {
            unitCost?: { amount?: string; currencyCode?: string } | null;
          } | null;
        } | null;
      };
      errors?: Array<{ message?: string }>;
    };

    if (json.errors?.length) {
      console.warn("Variant unit cost query failed:", json.errors[0]?.message);
      return { amount: null, currencyCode: null, available: false };
    }

    const unitCost = json.data?.productVariant?.inventoryItem?.unitCost;
    if (!unitCost?.amount) {
      return { amount: null, currencyCode: unitCost?.currencyCode ?? null, available: true };
    }

    const amount = Number.parseFloat(unitCost.amount);
    if (Number.isNaN(amount)) {
      return { amount: null, currencyCode: unitCost.currencyCode ?? null, available: true };
    }

    return {
      amount,
      currencyCode: unitCost.currencyCode ?? null,
      available: true,
    };
  } catch (error) {
    console.warn("Unable to fetch variant unit cost:", error);
    return { amount: null, currencyCode: null, available: false };
  }
}

export function computeGarmentProfit(
  totalRevenue: number,
  unitCost: VariantUnitCost,
): { profit: number | null; profitLabel: string } {
  if (unitCost.amount == null) {
    return {
      profit: null,
      profitLabel: unitCost.available ? "Cost not set" : "Cost unavailable",
    };
  }

  const profit = totalRevenue - unitCost.amount;
  return {
    profit,
    profitLabel: formatMoney(profit, unitCost.currencyCode),
  };
}

export function formatRevenue(amount: number): string {
  return formatMoney(amount, "AUD");
}
