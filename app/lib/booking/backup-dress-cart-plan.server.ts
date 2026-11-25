import {
  BACKUP_HIRE_TIER,
  cleanupBackupDressProperties,
  computeBackupDressAssignments,
  type BackupDressLineInput,
} from "./backup-dress-pricing";
import {
  getBackupVariantMapFromDatabase,
  type BackupVariantMapResponse,
} from "./backup-dress-variant.server";
import { getShopBackupDressDiscountConfig } from "../shop-settings.server";

export type CartPlanLineInput = BackupDressLineInput;

export type CartPlanAction = {
  lineKey: string;
  tier: "main" | "backup";
  targetVariantId: string;
  displayProperties: Record<string, string>;
};

export type CartPlanResponse = {
  enabled: boolean;
  actions: CartPlanAction[];
};

function targetVariantForTier(
  variantId: string,
  tier: string,
  map: BackupVariantMapResponse,
): string | null {
  const entry = map.variants[variantId];
  if (!entry) {
    return null;
  }
  if (tier === BACKUP_HIRE_TIER) {
    return entry.backupVariantId;
  }
  return entry.mainVariantId;
}

export async function buildBackupCartPlan(
  shop: string,
  lines: CartPlanLineInput[],
): Promise<CartPlanResponse> {
  const discountConfig = await getShopBackupDressDiscountConfig(shop);
  if (!discountConfig.enabled) {
    return { enabled: false, actions: [] };
  }

  const variantIds = [
    ...new Set(lines.map((line) => String(line.variantId ?? "")).filter(Boolean)),
  ];
  const map = await getBackupVariantMapFromDatabase(shop, variantIds);
  const assignments = computeBackupDressAssignments(lines);

  const actions: CartPlanAction[] = [];

  for (const row of assignments) {
    const line = lines.find((candidate) => candidate.key === row.key);
    const variantId = String(line?.variantId ?? "");
    if (!variantId) {
      continue;
    }
    const targetVariantId = targetVariantForTier(variantId, row.tier, map);
    if (!targetVariantId) {
      continue;
    }
    actions.push({
      lineKey: row.key,
      tier: row.tier,
      targetVariantId,
      displayProperties: cleanupBackupDressProperties({
        ...(line?.properties ?? {}),
        ...row.properties,
      }),
    });
  }

  return { enabled: true, actions };
}