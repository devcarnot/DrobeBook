export const HIRE_TIER_PROPERTY = "_gk_hire_tier";
export const HIRE_GROUP_PROPERTY = "_gk_hire_group";
export const HIRE_TYPE_PROPERTY = "Hire type";
export const ORIGINAL_HIRE_PRICE_PROPERTY = "Original hire price";
export const BACKUP_DISCOUNT_PROPERTY = "Backup discount";

export const MAIN_HIRE_LABEL = "Main Hire — Full Price";
export const BACKUP_HIRE_LABEL = "Backup Dress — 80% Discount";

export const MAIN_HIRE_TIER = "main";
export const BACKUP_HIRE_TIER = "backup";

/** Customer pays 20% of catalog hire price (80% off). */
export const BACKUP_PAY_FRACTION = 0.2;
export const BACKUP_DISCOUNT_PERCENT = 80;

export type BackupDressLineInput = {
  key: string;
  priceCents: number;
  properties: Record<string, string>;
};

export type BackupDressAssignment = {
  key: string;
  tier: typeof MAIN_HIRE_TIER | typeof BACKUP_HIRE_TIER;
  groupKey: string;
  originalCents: number;
  chargedCents: number;
  discountCents: number;
  properties: Record<string, string>;
};

function normalizeToken(value: string | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGownHireLine(properties: Record<string, string>): boolean {
  if (properties._gk_clutch_upsell === "true") {
    return false;
  }

  if (properties["For item"] && !properties["Delivery Date"]) {
    return false;
  }

  const size = properties._Size ?? properties.Size;
  const duration = properties._Duration ?? properties.Duration;
  if (!size || !duration) {
    return false;
  }

  return Boolean(properties["Delivery Date"] && properties["Return Date"]);
}

export function hirePeriodGroupKey(properties: Record<string, string>): string | null {
  const delivery = normalizeToken(properties["Delivery Date"]);
  const returnDate = normalizeToken(properties["Return Date"]);
  const duration = normalizeToken(properties._Duration ?? properties.Duration);
  if (!delivery || !returnDate) {
    return null;
  }
  return `${delivery.toLowerCase()}|${returnDate.toLowerCase()}|${duration.toLowerCase()}`;
}

export function allocateHireTierCounts(totalDresses: number): {
  fullPriceCount: number;
  backupCount: number;
} {
  if (totalDresses <= 0) {
    return { fullPriceCount: 0, backupCount: 0 };
  }

  return {
    fullPriceCount: Math.ceil(totalDresses / 2),
    backupCount: Math.floor(totalDresses / 2),
  };
}

function formatMoneyFromCents(cents: number): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildTierProperties(input: {
  tier: typeof MAIN_HIRE_TIER | typeof BACKUP_HIRE_TIER;
  groupKey: string;
  originalCents: number;
  chargedCents: number;
  discountCents: number;
}): Record<string, string> {
  const hireLabel =
    input.tier === BACKUP_HIRE_TIER ? BACKUP_HIRE_LABEL : MAIN_HIRE_LABEL;

  const next: Record<string, string> = {
    [HIRE_TIER_PROPERTY]: input.tier,
    [HIRE_GROUP_PROPERTY]: input.groupKey,
    [HIRE_TYPE_PROPERTY]: hireLabel,
    [ORIGINAL_HIRE_PRICE_PROPERTY]: formatMoneyFromCents(input.originalCents),
  };

  if (input.tier === BACKUP_HIRE_TIER && input.discountCents > 0) {
    next[BACKUP_DISCOUNT_PROPERTY] = `-${formatMoneyFromCents(input.discountCents)}`;
  }

  return next;
}

export function computeBackupDressAssignments(
  lines: BackupDressLineInput[],
): BackupDressAssignment[] {
  const eligible = lines.filter((line) => isGownHireLine(line.properties));
  const byGroup = new Map<string, BackupDressLineInput[]>();

  for (const line of eligible) {
    const groupKey = hirePeriodGroupKey(line.properties);
    if (!groupKey) {
      continue;
    }
    const bucket = byGroup.get(groupKey) ?? [];
    bucket.push(line);
    byGroup.set(groupKey, bucket);
  }

  const assignments: BackupDressAssignment[] = [];

  for (const [groupKey, groupLines] of byGroup) {
    const sorted = [...groupLines].sort((a, b) => b.priceCents - a.priceCents);
    const { fullPriceCount, backupCount } = allocateHireTierCounts(sorted.length);

    sorted.forEach((line, index) => {
      const isBackup = index >= fullPriceCount && backupCount > 0;
      const tier = isBackup ? BACKUP_HIRE_TIER : MAIN_HIRE_TIER;
      const originalCents = line.priceCents;
      const chargedCents = isBackup
        ? Math.round(originalCents * BACKUP_PAY_FRACTION)
        : originalCents;
      const discountCents = isBackup ? originalCents - chargedCents : 0;

      const tierProperties = buildTierProperties({
        tier,
        groupKey,
        originalCents,
        chargedCents,
        discountCents,
      });

      assignments.push({
        key: line.key,
        tier,
        groupKey,
        originalCents,
        chargedCents,
        discountCents,
        properties: {
          ...line.properties,
          ...tierProperties,
        },
      });
    });
  }

  return assignments;
}

export function computeBackupDressSummary(assignments: BackupDressAssignment[]): {
  originalSubtotalCents: number;
  chargedSubtotalCents: number;
  savingsCents: number;
  gownCount: number;
  backupCount: number;
} {
  const originalSubtotalCents = assignments.reduce(
    (sum, row) => sum + row.originalCents,
    0,
  );
  const chargedSubtotalCents = assignments.reduce(
    (sum, row) => sum + row.chargedCents,
    0,
  );

  return {
    originalSubtotalCents,
    chargedSubtotalCents,
    savingsCents: originalSubtotalCents - chargedSubtotalCents,
    gownCount: assignments.length,
    backupCount: assignments.filter((row) => row.tier === BACKUP_HIRE_TIER).length,
  };
}