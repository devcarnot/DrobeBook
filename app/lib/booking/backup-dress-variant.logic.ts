export const HIRE_PRICING_OPTION_NAME = "Hire pricing";
export const HIRE_PRICING_STANDARD = "Standard";
export const HIRE_PRICING_BACKUP = "Backup (80% off)";
export const BACKUP_DURATION_SUFFIX = " · Backup";

export type ProductOptionRow = {
  id?: string | null;
  name?: unknown;
  position?: number | null;
  optionValues?: Array<{ name?: unknown }> | null;
  linkedMetafield?: { namespace?: string; key?: string } | null;
};

export function isCustomerFacingHireVariant(
  selectedOptions: SelectedOptionRow[],
): boolean {
  return !isBackupSelectedOption(selectedOptions);
}

export type SelectedOptionRow = { name: string; value: string };

export function safeText(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (typeof value === "object" && "name" in (value as object)) {
    return safeText((value as { name: unknown }).name);
  }
  return String(value).trim();
}

export function normalizeProductOption(option: ProductOptionRow) {
  return {
    ...option,
    name: safeText(option.name),
    optionValues: (option.optionValues ?? []).map((row) => ({
      name: safeText(row?.name),
    })),
  };
}

export function normalizeProductOptions(options: ProductOptionRow[] | undefined | null) {
  return (options ?? []).map((row) => normalizeProductOption(row));
}

export function isHirePricingOption(name: unknown): boolean {
  return safeText(name).toLowerCase() === HIRE_PRICING_OPTION_NAME.toLowerCase();
}

export function normalizeSelectedOption(row: { name?: unknown; value?: unknown }): {
  name: string;
  value: string;
} {
  return {
    name: safeText(row.name),
    value: safeText(row.value),
  };
}

export function isBackupSelectedOption(
  selectedOptions: Array<{ name: string; value: string }>,
): boolean {
  if (
    selectedOptions.some(
      (row) =>
        isHirePricingOption(row.name) &&
        safeText(row.value).toLowerCase() === HIRE_PRICING_BACKUP.toLowerCase(),
    )
  ) {
    return true;
  }
  return selectedOptions.some((row) => isBackupDurationValue(row.value));
}

export function isBackupDurationValue(value: unknown): boolean {
  const normalized = safeText(value).toLowerCase();
  return (
    normalized.endsWith("· backup") ||
    normalized.endsWith("(backup") ||
    /backup.*80%/.test(normalized)
  );
}

/** Shopify variant title when selected options are not stored locally (import / coverage). */
export function isBackupCatalogVariantTitle(title: unknown): boolean {
  const normalized = safeText(title).toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes(HIRE_PRICING_BACKUP.toLowerCase())) {
    return true;
  }
  if (normalized.includes("· backup")) {
    return true;
  }
  const parts = normalized.split("/").map((part) => part.trim());
  return parts.some((part) => isBackupDurationValue(part));
}

export function backupSuffixLabel(mainValue: unknown): string {
  const trimmed = safeText(mainValue);
  if (isBackupDurationValue(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${BACKUP_DURATION_SUFFIX}`;
}

export function nonHireProductOptions(
  productOptions: Array<ProductOptionRow & { name: string }>,
) {
  return productOptions.filter((option) => !isHirePricingOption(option.name));
}

export function shouldUseHirePricingBackupPath(
  productOptions: Array<ProductOptionRow & { name: string }>,
): boolean {
  if (productOptions.some((option) => isHirePricingOption(option.name))) {
    return false;
  }
  const nonHire = nonHireProductOptions(productOptions);
  return nonHire.length > 0 && nonHire.length < 3 && productOptions.length < 3;
}

function isLinkedMetafieldOption(option: ProductOptionRow): boolean {
  return Boolean(option.linkedMetafield?.namespace && option.linkedMetafield?.key);
}

export function listAlterationCandidates(
  selectedOptions: SelectedOptionRow[],
  productOptions: Array<ProductOptionRow & { name: string }>,
): Array<{ option: ProductOptionRow & { name: string }; mainValue: string }> {
  const eligibleOptions = nonHireProductOptions(productOptions).filter(
    (option) => !isLinkedMetafieldOption(option),
  );
  const eligibleSelected = selectedOptions.filter((row) => !isHirePricingOption(row.name));
  const candidates: Array<{
    option: ProductOptionRow & { name: string };
    mainValue: string;
  }> = [];

  for (const row of eligibleSelected) {
    if (!/duration/i.test(safeText(row.name))) {
      continue;
    }
    const option = eligibleOptions.find(
      (opt) => safeText(opt.name).toLowerCase() === safeText(row.name).toLowerCase(),
    );
    if (option?.id) {
      candidates.push({ option, mainValue: safeText(row.value) });
    }
  }

  const sorted = [...eligibleOptions].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  for (const option of sorted) {
    if (candidates.some((row) => row.option.id === option.id)) {
      continue;
    }
    const selected = eligibleSelected.find(
      (row) => safeText(row.name).toLowerCase() === safeText(option.name).toLowerCase(),
    );
    if (option.id && selected?.value) {
      candidates.push({ option, mainValue: safeText(selected.value) });
    }
  }

  return candidates;
}

export function buildCompleteBackupOptionValues(
  selectedOptions: SelectedOptionRow[],
  productOptions: Array<ProductOptionRow & { name: string }>,
  alteration: { option: ProductOptionRow & { name: string }; mainValue: string },
): Array<{ optionName: string; name: string }> {
  const selectedByName = new Map(
    selectedOptions.map((row) => [
      safeText(row.name).toLowerCase(),
      safeText(row.value),
    ]),
  );
  const backupValue = backupSuffixLabel(alteration.mainValue);
  const alterationKey = safeText(alteration.option.name).toLowerCase();

  return productOptions.map((option) => {
    const key = safeText(option.name).toLowerCase();
    let currentValue = selectedByName.get(key);
    if (currentValue == null && isHirePricingOption(option.name)) {
      currentValue = HIRE_PRICING_STANDARD;
    }
    if (currentValue == null) {
      throw new Error(`Option does not exist on variant: ${safeText(option.name)}`);
    }
    return {
      optionName: safeText(option.name),
      name: key === alterationKey ? backupValue : currentValue,
    };
  });
}

export function buildHirePricingBackupOptionValues(
  selectedOptions: SelectedOptionRow[],
  productOptions: Array<ProductOptionRow & { name: string }>,
): Array<{ optionName: string; name: string }> {
  const selectedByName = new Map(
    selectedOptions.map((row) => [
      safeText(row.name).toLowerCase(),
      safeText(row.value),
    ]),
  );

  const core = productOptions.filter((row) => !isHirePricingOption(row.name));
  const rows = core.map((option) => ({
    optionName: safeText(option.name),
    name: selectedByName.get(safeText(option.name).toLowerCase()) ?? "",
  }));

  return [
    ...rows,
    { optionName: HIRE_PRICING_OPTION_NAME, name: HIRE_PRICING_BACKUP },
  ];
}

export function buildHirePricingSiblingOptionValues(
  selectedOptions: SelectedOptionRow[],
  productOptions: Array<ProductOptionRow & { name: string }>,
): Array<{ optionName: string; name: string }> | null {
  const hireOption = productOptions.find((row) => isHirePricingOption(row.name));
  if (!hireOption || isLinkedMetafieldOption(hireOption)) {
    return null;
  }

  const selectedByName = new Map(
    selectedOptions.map((row) => [
      safeText(row.name).toLowerCase(),
      safeText(row.value),
    ]),
  );

  const rows: Array<{ optionName: string; name: string }> = [];
  for (const option of productOptions) {
    const key = safeText(option.name).toLowerCase();
    if (isHirePricingOption(option.name)) {
      rows.push({ optionName: safeText(option.name), name: HIRE_PRICING_BACKUP });
      continue;
    }
    const value = selectedByName.get(key);
    if (value == null) {
      throw new Error(`Option does not exist on variant: ${safeText(option.name)}`);
    }
    rows.push({ optionName: safeText(option.name), name: value });
  }

  return rows.length ? rows : null;
}

export function buildBackupOptionValuePlans(
  selectedOptions: SelectedOptionRow[],
  productOptions: Array<ProductOptionRow & { name: string }>,
): Array<Array<{ optionName: string; name: string }>> {
  const plans: Array<Array<{ optionName: string; name: string }>> = [];

  try {
    const hireSibling = buildHirePricingSiblingOptionValues(
      selectedOptions,
      productOptions,
    );
    if (hireSibling) {
      plans.push(hireSibling);
    }
  } catch {
    /* fall back to suffix plans */
  }

  if (shouldUseHirePricingBackupPath(productOptions)) {
    plans.push(buildHirePricingBackupOptionValues(selectedOptions, productOptions));
  }

  for (const alteration of listAlterationCandidates(selectedOptions, productOptions)) {
    try {
      plans.push(
        buildCompleteBackupOptionValues(selectedOptions, productOptions, alteration),
      );
    } catch {
      /* try next candidate */
    }
  }
  return plans;
}

export function isRetryableBackupCreateError(message: string): boolean {
  return /option does not exist|metafield linked|hire pricing|nonlinked option/i.test(
    message,
  );
}