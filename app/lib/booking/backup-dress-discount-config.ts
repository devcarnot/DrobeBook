export type BackupDressDiscountConfig = {
  /** Storefront cart swaps backup-priced variants when 2+ gowns share a hire window. */
  enabled: boolean;
};

export const DEFAULT_BACKUP_DRESS_DISCOUNT_CONFIG: BackupDressDiscountConfig = {
  enabled: true,
};

export function normalizeBackupDressDiscountConfig(
  value: Partial<BackupDressDiscountConfig> | null | undefined,
): BackupDressDiscountConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_BACKUP_DRESS_DISCOUNT_CONFIG };
  }
  return {
    enabled:
      typeof value.enabled === "boolean"
        ? value.enabled
        : DEFAULT_BACKUP_DRESS_DISCOUNT_CONFIG.enabled,
  };
}