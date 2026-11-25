export const HIRE_TIER_PROPERTY = "_gk_hire_tier";
export const HIRE_GROUP_PROPERTY = "_gk_hire_group";
export const HIRE_TYPE_PROPERTY = "Hire type";
export const ORIGINAL_HIRE_PRICE_PROPERTY = "Original hire price";
export const BACKUP_DISCOUNT_PROPERTY = "Backup discount";

/** Storefront display (cart line properties). */
export const MAIN_HIRE_LABEL = "Main Hire";
export const BACKUP_HIRE_LABEL = "Backup Dress · 80% OFF";

export const MIN_BACKUP_GROUP_SIZE = 2;

export const MAIN_HIRE_TIER = "main";
export const BACKUP_HIRE_TIER = "backup";

/** Customer pays 20% of catalog hire price (80% off). */
export const BACKUP_PAY_FRACTION = 0.2;
export const BACKUP_DISCOUNT_PERCENT = 80;

export type BackupDressLineInput = {
  key: string;
  variantId?: string;
  quantity?: number;
  /** Unix ms or ISO string — used for stable tie-break. */
  createdAt?: number | string;
  priceCents: number;
  properties: Record<string, string>;
};

export function roundBackupPriceCents(standardCents: number): number {
  return Math.round(standardCents * BACKUP_PAY_FRACTION);
}

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

function parseCreatedAtMs(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) {
      return ms;
    }
  }
  return 0;
}

export function compareLinesForAllocation(
  a: BackupDressLineInput,
  b: BackupDressLineInput,
): number {
  if (b.priceCents !== a.priceCents) {
    return b.priceCents - a.priceCents;
  }
  const aCreated = parseCreatedAtMs(a.createdAt);
  const bCreated = parseCreatedAtMs(b.createdAt);
  if (aCreated !== bCreated) {
    return aCreated - bCreated;
  }
  const aVariant = String(a.variantId ?? "");
  const bVariant = String(b.variantId ?? "");
  if (aVariant !== bVariant) {
    return aVariant.localeCompare(bVariant);
  }
  return String(a.key).localeCompare(String(b.key));
}

/** Each unit in qty counts as one gown in the group (synthetic keys). */
export function expandLinesByQuantity(lines: BackupDressLineInput[]): BackupDressLineInput[] {
  const expanded: BackupDressLineInput[] = [];
  for (const line of lines) {
    const qty = Math.max(1, Math.min(99, Math.floor(line.quantity ?? 1)));
    for (let unit = 0; unit < qty; unit += 1) {
      expanded.push({
        ...line,
        key: qty > 1 ? `${line.key}#unit=${unit + 1}` : line.key,
        quantity: 1,
      });
    }
  }
  return expanded;
}

export type ComputeBackupDressOptions = {
  /** Order webhooks: count each qty unit separately. Storefront cart: false (qty 1 per line). */
  expandQuantity?: boolean;
};

export function computeBackupDressAssignments(
  lines: BackupDressLineInput[],
  options?: ComputeBackupDressOptions,
): BackupDressAssignment[] {
  const expanded = options?.expandQuantity
    ? expandLinesByQuantity(lines)
    : lines.map((line) => ({ ...line, quantity: 1 }));
  const eligible = expanded.filter((line) => isGownHireLine(line.properties));
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
    if (groupLines.length < MIN_BACKUP_GROUP_SIZE) {
      continue;
    }
    const sorted = [...groupLines].sort(compareLinesForAllocation);
    const { fullPriceCount, backupCount } = allocateHireTierCounts(sorted.length);

    sorted.forEach((line, index) => {
      const isBackup = index >= fullPriceCount && backupCount > 0;
      const tier = isBackup ? BACKUP_HIRE_TIER : MAIN_HIRE_TIER;
      const originalCents = line.priceCents;
      const chargedCents = isBackup ? roundBackupPriceCents(originalCents) : originalCents;
      const discountCents = isBackup ? originalCents - chargedCents : 0;

      const tierProperties = buildTierProperties({
        tier,
        groupKey,
        originalCents,
        chargedCents,
        discountCents,
      });

      const baseKey = line.key.replace(/#unit=\d+$/, "");

      assignments.push({
        key: baseKey,
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

export function cleanupBackupDressProperties(
  properties: Record<string, string>,
): Record<string, string> {
  const next = { ...properties };
  delete next[HIRE_TIER_PROPERTY];
  delete next[HIRE_GROUP_PROPERTY];
  return next;
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