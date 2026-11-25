import prisma from "../../db.server";
import { BACKUP_PAY_FRACTION } from "./backup-dress-pricing";
import { extractNumericId, toProductGid, toVariantGid } from "../shopify-ids";

export const HIRE_PRICING_OPTION_NAME = "Hire pricing";
export const HIRE_PRICING_STANDARD = "Standard";
export const HIRE_PRICING_BACKUP = "Backup (80% off)";
export const BACKUP_DURATION_SUFFIX = " · Backup";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type BackupVariantMapEntry = {
  mainVariantId: string;
  backupVariantId: string | null;
  mainPriceCents: number;
  backupPriceCents: number | null;
  isBackupVariant: boolean;
};

export type BackupVariantMapResponse = {
  variants: Record<string, BackupVariantMapEntry>;
};

const PRODUCT_VARIANTS_QUERY = `#graphql
  query ProductVariantsForBackup($id: ID!) {
    product(id: $id) {
      id
      options {
        id
        name
        position
        optionValues {
          name
        }
      }
      variants(first: 250) {
        nodes {
          id
          price
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

const VARIANT_DETAIL_QUERY = `#graphql
  query BackupVariantDetail($id: ID!) {
    productVariant(id: $id) {
      id
      price
      sku
      selectedOptions {
        name
        value
      }
      product {
        id
        options {
          id
          name
          position
          optionValues {
            name
          }
        }
      }
    }
  }
`;

const PRODUCT_OPTIONS_CREATE = `#graphql
  mutation EnsureHirePricingOption($productId: ID!, $options: [OptionCreateInput!]!) {
    productOptionsCreate(productId: $productId, options: $options) {
      userErrors {
        field
        message
      }
    }
  }
`;

const VARIANTS_BULK_CREATE = `#graphql
  mutation CreateBackupVariants(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_OPTION_UPDATE = `#graphql
  mutation AddProductOptionValue(
    $productId: ID!
    $option: OptionUpdateInput!
    $optionValuesToAdd: [OptionValueCreateInput!]
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToAdd: $optionValuesToAdd
    ) {
      userErrors {
        field
        message
      }
    }
  }
`;

const VARIANT_PRICE_UPDATE = `#graphql
  mutation UpdateBackupVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        message
      }
    }
  }
`;

function safeText(value: unknown): string {
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

function priceToCents(price: string | null | undefined): number {
  const amount = Number.parseFloat(String(price ?? "0"));
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100);
}

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isHirePricingOption(name: unknown): boolean {
  return safeText(name).toLowerCase() === HIRE_PRICING_OPTION_NAME.toLowerCase();
}

function isBackupDurationValue(value: unknown): boolean {
  const normalized = safeText(value).toLowerCase();
  return (
    normalized.endsWith("· backup") ||
    normalized.endsWith("(backup") ||
    /backup.*80%/.test(normalized)
  );
}

function isBackupSelectedOption(selectedOptions: Array<{ name: string; value: string }>): boolean {
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

function normalizeSelectedOption(row: { name?: unknown; value?: unknown }): {
  name: string;
  value: string;
} {
  return {
    name: safeText(row.name),
    value: safeText(row.value),
  };
}

type ProductOptionRow = {
  id?: string | null;
  name?: unknown;
  position?: number | null;
  optionValues?: Array<{ name?: unknown }> | null;
};

function normalizeProductOption(option: ProductOptionRow): ProductOptionRow & {
  name: string;
  optionValues: Array<{ name: string }>;
} {
  return {
    ...option,
    name: safeText(option.name),
    optionValues: (option.optionValues ?? []).map((row) => ({
      name: safeText(row?.name),
    })),
  };
}

function normalizeProductOptions(options: ProductOptionRow[] | undefined | null) {
  return (options ?? []).map((row) => normalizeProductOption(row));
}

function backupDurationLabel(mainValue: unknown): string {
  const trimmed = safeText(mainValue);
  if (isBackupDurationValue(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${BACKUP_DURATION_SUFFIX}`;
}

function nonHireProductOptions(productOptions: ProductOptionRow[]): ProductOptionRow[] {
  return productOptions.filter((option) => !isHirePricingOption(option.name));
}

/** Only create a new Hire pricing option when the product does not already have one. */
function shouldUseHirePricingBackupPath(productOptions: ProductOptionRow[]): boolean {
  if (productOptions.some((option) => isHirePricingOption(option.name))) {
    return false;
  }
  const nonHire = nonHireProductOptions(productOptions);
  return nonHire.length > 0 && nonHire.length < 3 && productOptions.length < 3;
}

function isRetryableBackupCreateError(message: string): boolean {
  return /option does not exist|metafield linked|hire pricing|nonlinked option/i.test(
    message,
  );
}

function alignOptionValuesToProduct(
  optionValues: Array<{ optionName: string; name: string }>,
  productOptions: ProductOptionRow[],
): Array<{ optionName: string; name: string }> {
  const available = new Map(
    productOptions.map((row) => [safeText(row.name).toLowerCase(), safeText(row.name)]),
  );

  return optionValues.map((row) => {
    const officialName = available.get(safeText(row.optionName).toLowerCase());
    if (!officialName) {
      throw new Error(`Option does not exist: ${safeText(row.optionName)}`);
    }
    return {
      optionName: officialName,
      name: safeText(row.name),
    };
  });
}

function buildSuffixBackupOptionValues(
  selectedOptions: Array<{ name: string; value: string }>,
  productOptions: ProductOptionRow[],
): Array<{ optionName: string; name: string }> | null {
  const alteration = pickAlterationOption(selectedOptions, productOptions);
  if (!alteration) {
    return null;
  }

  const backupValue = backupDurationLabel(alteration.mainValue);
  return selectedOptions.map((option) => ({
    optionName: safeText(option.name),
    name:
      safeText(option.name).toLowerCase() ===
      safeText(alteration.option.name).toLowerCase()
        ? backupValue
        : safeText(option.value),
  }));
}

function pickAlterationOption(
  selectedOptions: Array<{ name: string; value: string }>,
  productOptions: ProductOptionRow[],
): { option: ProductOptionRow; mainValue: string } | null {
  const eligibleOptions = nonHireProductOptions(productOptions);
  if (!eligibleOptions.length) {
    return null;
  }

  const eligibleSelected = selectedOptions.filter(
    (row) => !isHirePricingOption(row.name),
  );

  const durationPick = eligibleSelected.find((row) =>
    /duration/i.test(safeText(row.name)),
  );
  if (durationPick) {
    const option = eligibleOptions.find(
      (row) =>
        safeText(row.name).toLowerCase() === safeText(durationPick.name).toLowerCase(),
    );
    if (option?.id) {
      return { option, mainValue: durationPick.value };
    }
  }

  const sorted = [...eligibleOptions].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const fallback = sorted[sorted.length - 1];
  const selected = eligibleSelected.find(
    (row) =>
      safeText(row.name).toLowerCase() === safeText(fallback.name).toLowerCase(),
  );
  if (fallback?.id && selected?.value) {
    return { option: fallback, mainValue: selected.value };
  }

  return null;
}

async function ensureOptionValueOnProduct(
  admin: AdminGraphql,
  productGid: string,
  optionId: string,
  valueName: string,
  existingValues: string[],
): Promise<void> {
  const normalizedExisting = new Set(
    existingValues.map((value) => safeText(value).toLowerCase()),
  );
  if (normalizedExisting.has(safeText(valueName).toLowerCase())) {
    return;
  }

  const response = await admin.graphql(PRODUCT_OPTION_UPDATE, {
    variables: {
      productId: productGid,
      option: { id: optionId },
      optionValuesToAdd: [{ name: valueName }],
    },
  });

  const json = (await response.json()) as {
    data?: {
      productOptionUpdate?: { userErrors?: Array<{ message: string }> };
    };
    errors?: Array<{ message: string }>;
  };

  const errors = [
    ...(json.errors?.map((error) => error.message) ?? []),
    ...(json.data?.productOptionUpdate?.userErrors?.map((error) => error.message) ?? []),
  ];

  if (errors.length) {
    const ignorable = errors.every((message) =>
      /already exists|duplicate|taken/i.test(message),
    );
    if (!ignorable) {
      throw new Error(errors.join("; "));
    }
  }
}

async function createBackupProductVariant(
  admin: AdminGraphql,
  productGid: string,
  optionValues: Array<{ optionName: string; name: string }>,
  backupPriceCents: number,
  sku?: string | null,
): Promise<string | null> {
  const createResponse = await admin.graphql(VARIANTS_BULK_CREATE, {
    variables: {
      productId: productGid,
      variants: [
        {
          price: centsToPrice(backupPriceCents),
          optionValues,
          inventoryItem: sku ? { sku: `${sku}-BKP` } : undefined,
        },
      ],
    },
  });

  const createJson = (await createResponse.json()) as {
    data?: {
      productVariantsBulkCreate?: {
        productVariants?: Array<{ id: string }>;
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  const createErrors = [
    ...(createJson.errors?.map((error) => error.message) ?? []),
    ...(createJson.data?.productVariantsBulkCreate?.userErrors?.map(
      (error) => error.message,
    ) ?? []),
  ];
  if (createErrors.length) {
    throw new Error(createErrors.join("; "));
  }

  const createdId = createJson.data?.productVariantsBulkCreate?.productVariants?.[0]?.id;
  return createdId ? extractNumericId(createdId) : null;
}

async function ensureHirePricingValuesOnProduct(
  admin: AdminGraphql,
  productGid: string,
  productOptions: ProductOptionRow[],
): Promise<void> {
  const hireOption = productOptions.find((option) => isHirePricingOption(option.name));
  if (!hireOption?.id) {
    return;
  }

  const existing =
    hireOption.optionValues?.map((row) => safeText(row?.name)) ?? [];
  await ensureOptionValueOnProduct(
    admin,
    productGid,
    hireOption.id,
    HIRE_PRICING_STANDARD,
    existing,
  );
  await ensureOptionValueOnProduct(
    admin,
    productGid,
    hireOption.id,
    HIRE_PRICING_BACKUP,
    [...existing, HIRE_PRICING_STANDARD],
  );
}

async function refreshProductOptions(
  admin: AdminGraphql,
  productGid: string,
): Promise<ProductOptionRow[]> {
  const response = await admin.graphql(PRODUCT_VARIANTS_QUERY, {
    variables: { id: productGid },
  });
  const json = (await response.json()) as {
    data?: { product?: { options?: ProductOptionRow[] } };
  };
  return normalizeProductOptions(json.data?.product?.options);
}

function findExistingBackupVariantId(
  variants: Array<{
    id: string;
    selectedOptions?: Array<{ name: string; value: string }>;
  }>,
  optionValues: Array<{ optionName: string; name: string }>,
  mainVariantId: string,
): string | null {
  const mainGid = toVariantGid(mainVariantId);
  for (const variant of variants) {
    if (variant.id === mainGid) {
      continue;
    }
    const selected = variant.selectedOptions ?? [];
    if (!isBackupSelectedOption(selected)) {
      continue;
    }
    const normalizedSelected = selected.map((row) => normalizeSelectedOption(row));
    const matches = optionValues.every((target) =>
      normalizedSelected.some(
        (row) =>
          row.name.toLowerCase() === safeText(target.optionName).toLowerCase() &&
          row.value.toLowerCase() === safeText(target.name).toLowerCase(),
      ),
    );
    if (matches) {
      return extractNumericId(variant.id);
    }
  }
  return null;
}

function buildBackupOptionValues(
  selectedOptions: Array<{ name: string; value: string }>,
  productOptions: ProductOptionRow[],
): Array<{ optionName: string; name: string }> | null {
  const baseOptions = selectedOptions.filter((option) => !isHirePricingOption(option.name));

  if (shouldUseHirePricingBackupPath(productOptions)) {
    return [
      ...baseOptions.map((option) => ({
        optionName: safeText(option.name),
        name: safeText(option.value),
      })),
      { optionName: HIRE_PRICING_OPTION_NAME, name: HIRE_PRICING_BACKUP },
    ];
  }

  return buildSuffixBackupOptionValues(selectedOptions, productOptions);
}

async function ensureHirePricingOption(
  admin: AdminGraphql,
  productGid: string,
  existingOptionNames: string[],
): Promise<void> {
  if (
    existingOptionNames.some((name) => isHirePricingOption(name))
  ) {
    return;
  }

  const response = await admin.graphql(PRODUCT_OPTIONS_CREATE, {
    variables: {
      productId: productGid,
      options: [
        {
          name: HIRE_PRICING_OPTION_NAME,
          values: [{ name: HIRE_PRICING_STANDARD }, { name: HIRE_PRICING_BACKUP }],
        },
      ],
    },
  });

  const json = (await response.json()) as {
    data?: {
      productOptionsCreate?: { userErrors?: Array<{ message: string }> };
    };
    errors?: Array<{ message: string }>;
  };

  const errors = [
    ...(json.errors?.map((error) => error.message) ?? []),
    ...(json.data?.productOptionsCreate?.userErrors?.map((error) => error.message) ?? []),
  ];

  if (errors.length) {
    throw new Error(errors.join("; "));
  }
}

async function ensureBackupVariantForMain(
  admin: AdminGraphql,
  shop: string,
  mainShopifyVariantId: string,
): Promise<string | null> {
  const row = await prisma.rentalProductVariant.findUnique({
    where: {
      shop_shopifyVariantId: {
        shop,
        shopifyVariantId: mainShopifyVariantId,
      },
    },
    include: {
      rentalProduct: true,
    },
  });

  if (!row?.rentalProduct?.rentalEnabled) {
    return null;
  }

  const detailResponse = await admin.graphql(VARIANT_DETAIL_QUERY, {
    variables: { id: toVariantGid(mainShopifyVariantId) },
  });
  const detailJson = (await detailResponse.json()) as {
    data?: {
      productVariant?: {
        id: string;
        price?: string | null;
        sku?: string | null;
        selectedOptions?: Array<{ name: string; value: string }>;
        product?: {
          id: string;
          options?: Array<{ name: string }>;
        };
      };
    };
    errors?: Array<{ message: string }>;
  };

  const variant = detailJson.data?.productVariant;
  if (!variant?.product?.id) {
    return null;
  }

  const selectedOptions = (variant.selectedOptions ?? []).map((row) =>
    normalizeSelectedOption(row),
  );
  if (isBackupSelectedOption(selectedOptions)) {
    return extractNumericId(variant.id);
  }

  const mainPriceCents = priceToCents(variant.price);
  const backupPriceCents = Math.round(mainPriceCents * BACKUP_PAY_FRACTION);

  if (row.backupShopifyVariantId) {
    const backupResponse = await admin.graphql(VARIANT_DETAIL_QUERY, {
      variables: { id: toVariantGid(row.backupShopifyVariantId) },
    });
    const backupJson = (await backupResponse.json()) as {
      data?: { productVariant?: { id: string; price?: string | null } };
    };
    if (backupJson.data?.productVariant?.id) {
      const currentBackupCents = priceToCents(backupJson.data.productVariant.price);
      if (currentBackupCents !== backupPriceCents) {
        await admin.graphql(VARIANT_PRICE_UPDATE, {
          variables: {
            productId: variant.product.id,
            variants: [
              {
                id: toVariantGid(row.backupShopifyVariantId),
                price: centsToPrice(backupPriceCents),
              },
            ],
          },
        });
      }
      return row.backupShopifyVariantId;
    }
  }

  let productOptions = normalizeProductOptions(
    variant.product.options as ProductOptionRow[] | undefined,
  );

  if (shouldUseHirePricingBackupPath(productOptions) && !productOptions.some(isHirePricingOption)) {
    try {
      await ensureHirePricingOption(
        admin,
        variant.product.id,
        productOptions.map((option) => safeText(option.name)),
      );
      productOptions = await refreshProductOptions(admin, variant.product.id);
    } catch (error) {
      console.warn("[backup-dress-variant] hire pricing option failed:", error);
    }
  }

  const refreshed = await admin.graphql(VARIANT_DETAIL_QUERY, {
    variables: { id: toVariantGid(mainShopifyVariantId) },
  });
  const refreshedVariant = ((await refreshed.json()) as {
    data?: {
      productVariant?: {
        selectedOptions?: Array<{ name: string; value: string }>;
        product?: { options?: ProductOptionRow[] };
      };
    };
  }).data?.productVariant;

  let refreshedOptions = normalizeProductOptions(
    (refreshedVariant?.product?.options ?? productOptions) as ProductOptionRow[],
  );
  const refreshedSelected = (refreshedVariant?.selectedOptions ?? selectedOptions).map(
    (row) => normalizeSelectedOption(row),
  );

  if (shouldUseHirePricingBackupPath(refreshedOptions)) {
    await ensureHirePricingValuesOnProduct(
      admin,
      variant.product.id,
      refreshedOptions,
    );
    refreshedOptions = await refreshProductOptions(admin, variant.product.id);
  }

  let optionValues = buildBackupOptionValues(refreshedSelected, refreshedOptions);

  if (!optionValues?.length) {
    throw new Error("Could not determine backup variant options for this product.");
  }

  const alteration = pickAlterationOption(refreshedSelected, refreshedOptions);
  const usesSuffix = optionValues.some((row) => isBackupDurationValue(row.name));
  if (alteration?.option.id && usesSuffix) {
    const existingValues =
      alteration.option.optionValues?.map((row) => safeText(row.name)) ?? [];
    const backupValue = backupDurationLabel(alteration.mainValue);
    await ensureOptionValueOnProduct(
      admin,
      variant.product.id,
      alteration.option.id,
      backupValue,
      existingValues,
    );
    refreshedOptions = await refreshProductOptions(admin, variant.product.id);
    optionValues = buildSuffixBackupOptionValues(refreshedSelected, refreshedOptions);
    if (!optionValues?.length) {
      throw new Error("Could not build backup suffix options after adding option value.");
    }
  }

  optionValues = alignOptionValuesToProduct(optionValues, refreshedOptions);

  const productSnapshot = await admin.graphql(PRODUCT_VARIANTS_QUERY, {
    variables: { id: variant.product.id },
  });
  const productJson = (await productSnapshot.json()) as {
    data?: {
      product?: {
        variants?: {
          nodes?: Array<{
            id: string;
            selectedOptions?: Array<{ name: string; value: string }>;
          }>;
        };
      };
    };
  };
  const existingNodes = productJson.data?.product?.variants?.nodes ?? [];

  let backupNumericId = findExistingBackupVariantId(
    existingNodes,
    optionValues,
    mainShopifyVariantId,
  );

  if (!backupNumericId) {
    try {
      backupNumericId = await createBackupProductVariant(
        admin,
        variant.product.id,
        optionValues,
        backupPriceCents,
        variant.sku,
      );
    } catch (error) {
      const refetch = await admin.graphql(PRODUCT_VARIANTS_QUERY, {
        variables: { id: variant.product.id },
      });
      const refetchJson = (await refetch.json()) as {
        data?: {
          product?: {
            variants?: {
              nodes?: Array<{
                id: string;
                selectedOptions?: Array<{ name: string; value: string }>;
              }>;
            };
          };
        };
      };
      backupNumericId = findExistingBackupVariantId(
        refetchJson.data?.product?.variants?.nodes ?? [],
        optionValues,
        mainShopifyVariantId,
      );
      if (!backupNumericId && isRetryableBackupCreateError(String(error))) {
        const suffixValues = buildSuffixBackupOptionValues(
          refreshedSelected,
          refreshedOptions,
        );
        if (suffixValues?.length) {
          const alterationRetry = pickAlterationOption(
            refreshedSelected,
            refreshedOptions,
          );
          if (alterationRetry?.option.id) {
            const backupValue = backupDurationLabel(alterationRetry.mainValue);
            const existingValues =
              alterationRetry.option.optionValues?.map((row) =>
                safeText(row.name),
              ) ?? [];
            try {
              await ensureOptionValueOnProduct(
                admin,
                variant.product.id,
                alterationRetry.option.id,
                backupValue,
                existingValues,
              );
              refreshedOptions = await refreshProductOptions(
                admin,
                variant.product.id,
              );
            } catch (optionError) {
              console.warn("[backup-dress-variant] suffix option add", optionError);
            }
          }
          const alignedSuffix = alignOptionValuesToProduct(
            suffixValues,
            refreshedOptions,
          );
          backupNumericId = await createBackupProductVariant(
            admin,
            variant.product.id,
            alignedSuffix,
            backupPriceCents,
            variant.sku,
          );
        }
      }

      if (!backupNumericId) {
        const message = error instanceof Error ? error.message : String(error);
        const accessHint = /access|permission|denied|scope/i.test(message)
          ? " Approve DrobeBook “Edit products” in Shopify admin (Apps → DrobeBook), then sync again."
          : "";
        throw new Error(`Create backup variant failed: ${message}${accessHint}`);
      }
    }
  }

  if (!backupNumericId) {
    throw new Error("Create backup variant returned no variant id.");
  }
  await prisma.rentalProductVariant.update({
    where: { id: row.id },
    data: { backupShopifyVariantId: backupNumericId },
  });

  return backupNumericId;
}

function buildMapEntry(
  mainVariantId: string,
  backupVariantId: string | null,
  mainPriceCents: number,
  isBackupVariant: boolean,
): BackupVariantMapEntry {
  const backupPriceCents =
    backupVariantId != null ? Math.round(mainPriceCents * BACKUP_PAY_FRACTION) : null;
  return {
    mainVariantId,
    backupVariantId,
    mainPriceCents,
    backupPriceCents,
    isBackupVariant,
  };
}

export async function getBackupVariantMapForShop(
  admin: AdminGraphql,
  shop: string,
  variantIds: string[],
): Promise<BackupVariantMapResponse> {
  const uniqueIds = [...new Set(variantIds.map((id) => extractNumericId(id)).filter(Boolean))];
  const variants: BackupVariantMapResponse["variants"] = {};

  if (!uniqueIds.length) {
    return { variants };
  }

  const dbRows = await prisma.rentalProductVariant.findMany({
    where: {
      shop,
      OR: [
        { shopifyVariantId: { in: uniqueIds } },
        { backupShopifyVariantId: { in: uniqueIds } },
      ],
    },
  });

  const mainByBackup = new Map<string, (typeof dbRows)[number]>();
  const mainById = new Map<string, (typeof dbRows)[number]>();
  for (const row of dbRows) {
    mainById.set(row.shopifyVariantId, row);
    if (row.backupShopifyVariantId) {
      mainByBackup.set(row.backupShopifyVariantId, row);
    }
  }

  for (const requestedId of uniqueIds) {
    let mainRow = mainById.get(requestedId);
    let isBackupVariant = false;

    if (!mainRow && mainByBackup.has(requestedId)) {
      mainRow = mainByBackup.get(requestedId);
      isBackupVariant = true;
    }

    if (!mainRow) {
      continue;
    }

    let backupId = mainRow.backupShopifyVariantId;
    if (!backupId && !isBackupVariant) {
      try {
        backupId = await ensureBackupVariantForMain(admin, shop, mainRow.shopifyVariantId);
      } catch (error) {
        console.warn("[backup-dress-variant]", error);
      }
    }

    const mainPriceCents = priceToCents(mainRow.price);

    variants[requestedId] = buildMapEntry(
      mainRow.shopifyVariantId,
      backupId,
      mainPriceCents,
      isBackupVariant || requestedId === backupId,
    );

    if (backupId) {
      variants[mainRow.shopifyVariantId] = buildMapEntry(
        mainRow.shopifyVariantId,
        backupId,
        mainPriceCents,
        false,
      );
      variants[backupId] = buildMapEntry(
        mainRow.shopifyVariantId,
        backupId,
        mainPriceCents,
        true,
      );
    }
  }

  return { variants };
}

export type BackupVariantCoverage = {
  enabledRentalProducts: number;
  variantRows: number;
  withBackupVariant: number;
  missingBackupVariant: number;
};

export async function getBackupVariantCoverageForShop(
  shop: string,
): Promise<BackupVariantCoverage> {
  const enabledRentalProducts = await prisma.rentalProduct.count({
    where: {
      shop,
      rentalEnabled: true,
      removedAt: null,
    },
  });

  const variantRows = await prisma.rentalProductVariant.count({
    where: {
      shop,
      availableInShopify: true,
      rentalProduct: {
        rentalEnabled: true,
        removedAt: null,
      },
    },
  });

  const withBackupVariant = await prisma.rentalProductVariant.count({
    where: {
      shop,
      availableInShopify: true,
      backupShopifyVariantId: { not: null },
      rentalProduct: {
        rentalEnabled: true,
        removedAt: null,
      },
    },
  });

  return {
    enabledRentalProducts,
    variantRows,
    withBackupVariant,
    missingBackupVariant: Math.max(0, variantRows - withBackupVariant),
  };
}

export async function ensureAllBackupVariantsForShop(
  admin: AdminGraphql,
  shop: string,
): Promise<{
  ok: boolean;
  productsProcessed: number;
  variantsAttempted: number;
  errors: string[];
  coverage: BackupVariantCoverage;
}> {
  const products = await prisma.rentalProduct.findMany({
    where: {
      shop,
      rentalEnabled: true,
      removedAt: null,
    },
    select: { id: true },
  });

  const variantRows = await prisma.rentalProductVariant.findMany({
    where: {
      shop,
      availableInShopify: true,
      rentalProduct: {
        rentalEnabled: true,
        removedAt: null,
      },
    },
    select: {
      shopifyVariantId: true,
      title: true,
      rentalProduct: { select: { title: true } },
    },
  });

  const errors: string[] = [];
  const maxErrors = 8;

  for (const row of variantRows) {
    const label =
      row.rentalProduct?.title && row.title
        ? `${row.rentalProduct.title} — ${row.title}`
        : row.shopifyVariantId;
    try {
      const backupId = await ensureBackupVariantForMain(
        admin,
        shop,
        row.shopifyVariantId,
      );
      if (!backupId) {
        errors.push(`${label}: backup variant not created.`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      errors.push(`${label}: ${message}`);
    }

    if (errors.length >= maxErrors) {
      errors.push(
        `…and ${variantRows.length - maxErrors} more. Fix the errors above, then sync again.`,
      );
      break;
    }
  }

  const coverage = await getBackupVariantCoverageForShop(shop);

  return {
    ok: errors.length === 0 && coverage.missingBackupVariant === 0,
    productsProcessed: products.length,
    variantsAttempted: variantRows.length,
    errors,
    coverage,
  };
}

export async function ensureBackupVariantsForRentalProduct(
  admin: AdminGraphql,
  shop: string,
  rentalProductId: string,
): Promise<void> {
  const rows = await prisma.rentalProductVariant.findMany({
    where: {
      shop,
      rentalProductId,
      availableInShopify: true,
    },
    include: { rentalProduct: true },
  });

  if (!rows.length || !rows[0]?.rentalProduct?.rentalEnabled) {
    return;
  }

  for (const row of rows) {
    try {
      await ensureBackupVariantForMain(admin, shop, row.shopifyVariantId);
    } catch (error) {
      console.warn("[backup-dress-variant] ensure row", row.shopifyVariantId, error);
    }
  }
}