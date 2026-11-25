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

function isHirePricingOption(name: string): boolean {
  return name.trim().toLowerCase() === HIRE_PRICING_OPTION_NAME.toLowerCase();
}

function isBackupDurationValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
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
        row.value.trim().toLowerCase() === HIRE_PRICING_BACKUP.toLowerCase(),
    )
  ) {
    return true;
  }
  return selectedOptions.some((row) => isBackupDurationValue(row.value));
}

type ProductOptionRow = {
  id?: string | null;
  name: string;
  position?: number | null;
  optionValues?: Array<{ name: string }> | null;
};

function backupDurationLabel(mainValue: string): string {
  const trimmed = mainValue.trim();
  if (isBackupDurationValue(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${BACKUP_DURATION_SUFFIX}`;
}

function pickAlterationOption(
  selectedOptions: Array<{ name: string; value: string }>,
  productOptions: ProductOptionRow[],
): { option: ProductOptionRow; mainValue: string } | null {
  if (!productOptions.length) {
    return null;
  }

  const durationPick = selectedOptions.find((row) => /duration/i.test(row.name));
  if (durationPick) {
    const option = productOptions.find(
      (row) => row.name.trim().toLowerCase() === durationPick.name.trim().toLowerCase(),
    );
    if (option?.id) {
      return { option, mainValue: durationPick.value };
    }
  }

  const sorted = [...productOptions].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const fallback = sorted[sorted.length - 1];
  const selected = selectedOptions.find(
    (row) => row.name.trim().toLowerCase() === fallback.name.trim().toLowerCase(),
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
    existingValues.map((value) => value.trim().toLowerCase()),
  );
  if (normalizedExisting.has(valueName.trim().toLowerCase())) {
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

function buildBackupOptionValues(
  selectedOptions: Array<{ name: string; value: string }>,
  productOptions: ProductOptionRow[],
): Array<{ optionName: string; name: string }> | null {
  const optionCount = productOptions.length;
  const hasHirePricing = productOptions.some((option) => isHirePricingOption(option.name));
  const baseOptions = selectedOptions.filter((option) => !isHirePricingOption(option.name));

  if (optionCount < 3 && !hasHirePricing) {
    return [
      ...baseOptions.map((option) => ({
        optionName: option.name,
        name: option.value,
      })),
      { optionName: HIRE_PRICING_OPTION_NAME, name: HIRE_PRICING_BACKUP },
    ];
  }

  const alteration = pickAlterationOption(selectedOptions, productOptions);
  if (!alteration) {
    return null;
  }

  const backupValue = backupDurationLabel(alteration.mainValue);
  return selectedOptions
    .filter((option) => !isHirePricingOption(option.name))
    .map((option) => ({
      optionName: option.name,
      name:
        option.name.trim().toLowerCase() === alteration.option.name.trim().toLowerCase()
          ? backupValue
          : option.value,
    }));
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

  const selectedOptions = variant.selectedOptions ?? [];
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

  const productOptions = (variant.product.options ?? []) as ProductOptionRow[];
  const optionCount = productOptions.length;
  const hasHirePricing = productOptions.some((option) => isHirePricingOption(option.name));

  let optionValues = buildBackupOptionValues(selectedOptions, productOptions);

  if (optionCount < 3 && !hasHirePricing) {
    try {
      await ensureHirePricingOption(
        admin,
        variant.product.id,
        productOptions.map((option) => option.name),
      );
    } catch (error) {
      console.warn("[backup-dress-variant] hire pricing option failed:", error);
      optionValues = buildBackupOptionValues(selectedOptions, productOptions);
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

  const refreshedOptions = (refreshedVariant?.product?.options ??
    productOptions) as ProductOptionRow[];
  const refreshedSelected = refreshedVariant?.selectedOptions ?? selectedOptions;
  optionValues = buildBackupOptionValues(refreshedSelected, refreshedOptions);

  if (!optionValues?.length) {
    console.warn("[backup-dress-variant] could not build backup option values");
    return null;
  }

  const alteration = pickAlterationOption(refreshedSelected, refreshedOptions);
  const usesDurationSuffix = optionValues.some((row) => isBackupDurationValue(row.name));
  if (alteration?.option.id && usesDurationSuffix) {
    const existingValues =
      alteration.option.optionValues?.map((row) => row.name) ?? [];
    const backupValue = backupDurationLabel(alteration.mainValue);
    try {
      await ensureOptionValueOnProduct(
        admin,
        variant.product.id,
        alteration.option.id,
        backupValue,
        existingValues,
      );
    } catch (error) {
      console.warn("[backup-dress-variant] option value add failed:", error);
    }
  }

  let backupNumericId: string | null = null;
  try {
    backupNumericId = await createBackupProductVariant(
      admin,
      variant.product.id,
      optionValues,
      backupPriceCents,
      variant.sku,
    );
  } catch (error) {
    console.warn("[backup-dress-variant] create failed:", error);
    return null;
  }

  if (!backupNumericId) {
    return null;
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

  const errors: string[] = [];
  for (const product of products) {
    try {
      await ensureBackupVariantsForRentalProduct(admin, shop, product.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      errors.push(message);
    }
  }

  const coverage = await getBackupVariantCoverageForShop(shop);

  return {
    ok: errors.length === 0 && coverage.missingBackupVariant === 0,
    productsProcessed: products.length,
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