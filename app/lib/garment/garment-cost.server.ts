/**
 * Fetches garment acquisition cost from Shopify InventoryItem.unitCost.
 *
 * Requires read_inventory scope. Shopify also gates this behind the staff
 * "View product costs" permission — if the merchant's account lacks it, the
 * API returns null and we show "Not set" rather than erroring.
 *
 * Profit = totalRevenue − purchase cost − (cleaning cost per hire × times rented).
 * Purchase cost uses the garment override when set, otherwise Shopify unit cost.
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

export function resolvePurchaseCost(
  unitCost: VariantUnitCost,
  purchaseCostOverride: number | null | undefined,
): number | null {
  if (purchaseCostOverride != null && !Number.isNaN(purchaseCostOverride)) {
    return purchaseCostOverride;
  }

  return unitCost.amount;
}

export function computeGarmentProfit(
  totalRevenue: number,
  timesRented: number,
  unitCost: VariantUnitCost,
  options: {
    purchaseCostOverride?: number | null;
    cleaningCostPerHire?: number | null;
  } = {},
): { profit: number | null; profitLabel: string; purchaseCost: number | null } {
  const purchaseCost = resolvePurchaseCost(
    unitCost,
    options.purchaseCostOverride ?? null,
  );
  const cleaningCost = options.cleaningCostPerHire ?? 0;

  if (purchaseCost == null && cleaningCost <= 0) {
    return {
      profit: null,
      purchaseCost: null,
      profitLabel: unitCost.available ? "Cost not set" : "Cost unavailable",
    };
  }

  const totalCosts = (purchaseCost ?? 0) + cleaningCost * timesRented;
  const profit = totalRevenue - totalCosts;

  return {
    profit,
    purchaseCost,
    profitLabel: formatMoney(profit, unitCost.currencyCode),
  };
}

export function formatRevenue(amount: number): string {
  return formatMoney(amount, "AUD");
}
