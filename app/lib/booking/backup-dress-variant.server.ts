import prisma from "../../db.server";
import { BACKUP_PAY_FRACTION } from "./backup-dress-pricing";
import {
  BACKUP_DURATION_SUFFIX,
  buildBackupOptionValuePlans,
  HIRE_PRICING_BACKUP,
  HIRE_PRICING_OPTION_NAME,
  HIRE_PRICING_STANDARD,
  isBackupCatalogVariantTitle,
  isBackupSelectedOption,
  isHirePricingOption,
  isRetryableBackupCreateError,
  normalizeProductOptions,
  normalizeSelectedOption,
  safeText,
  shouldUseHirePricingBackupPath,
  type ProductOptionRow,
} from "./backup-dress-variant.logic";
import { extractNumericId, toProductGid, toVariantGid } from "../shopify-ids";

export {
  BACKUP_DURATION_SUFFIX,
  HIRE_PRICING_BACKUP,
  HIRE_PRICING_OPTION_NAME,
  HIRE_PRICING_STANDARD,
};

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
          linkedMetafield {
            namespace
            key
          }
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
    await prisma.rentalProductVariant.update({
      where: { id: row.id },
      data: { availableInShopify: false },
    });
    return null;
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

  const optionValuePlans = buildBackupOptionValuePlans(
    refreshedSelected,
    refreshedOptions as Array<ProductOptionRow & { name: string }>,
  );

  if (!optionValuePlans.length) {
    throw new Error(
      "Could not determine backup variant options. If every option is metafield-linked in Shopify, unlink one option (e.g. Duration) or contact support.",
    );
  }

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

  let backupNumericId: string | null = null;
  for (const plan of optionValuePlans) {
    backupNumericId =
      backupNumericId ??
      findExistingBackupVariantId(existingNodes, plan, mainShopifyVariantId);
  }

  let lastCreateError: unknown = null;
  if (!backupNumericId) {
    for (const plan of optionValuePlans) {
      try {
        backupNumericId = await createBackupProductVariant(
          admin,
          variant.product.id,
          plan,
          backupPriceCents,
          variant.sku,
        );
        if (backupNumericId) {
          break;
        }
      } catch (error) {
        lastCreateError = error;
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
          plan,
          mainShopifyVariantId,
        );
        if (backupNumericId) {
          break;
        }
        if (!isRetryableBackupCreateError(String(error))) {
          break;
        }
      }
    }
  }

  if (!backupNumericId) {
    const message =
      lastCreateError instanceof Error
        ? lastCreateError.message
        : String(lastCreateError ?? "Unknown error");
    const accessHint = /access|permission|denied|scope/i.test(message)
      ? " Approve DrobeBook “Edit products” in Shopify admin (Apps → DrobeBook), then sync again."
      : "";
    throw new Error(`Create backup variant failed: ${message}${accessHint}`);
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

  const enabledVariantRows = await prisma.rentalProductVariant.findMany({
    where: {
      shop,
      availableInShopify: true,
      rentalProduct: {
        rentalEnabled: true,
        removedAt: null,
      },
    },
    select: {
      title: true,
      backupShopifyVariantId: true,
    },
  });

  const mainHireRows = enabledVariantRows.filter(
    (row) => !isBackupCatalogVariantTitle(row.title),
  );
  const variantRows = mainHireRows.length;
  const withBackupVariant = mainHireRows.filter(
    (row) => row.backupShopifyVariantId != null,
  ).length;

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

  const allVariantRows = await prisma.rentalProductVariant.findMany({
    where: {
      shop,
      rentalProduct: {
        rentalEnabled: true,
        removedAt: null,
      },
    },
    select: {
      id: true,
      title: true,
      availableInShopify: true,
    },
  });

  const backupCatalogIds = allVariantRows
    .filter((row) => isBackupCatalogVariantTitle(row.title))
    .map((row) => row.id);
  if (backupCatalogIds.length) {
    await prisma.rentalProductVariant.updateMany({
      where: { id: { in: backupCatalogIds } },
      data: { availableInShopify: false },
    });
  }

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

  const mainVariantRows = variantRows.filter(
    (row) => !isBackupCatalogVariantTitle(row.title),
  );

  const errors: string[] = [];
  const maxErrors = 8;

  for (const row of mainVariantRows) {
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
        `…and ${mainVariantRows.length - maxErrors} more. Fix the errors above, then sync again.`,
      );
      break;
    }
  }

  const coverage = await getBackupVariantCoverageForShop(shop);

  return {
    ok: errors.length === 0 && coverage.missingBackupVariant === 0,
    productsProcessed: products.length,
    variantsAttempted: mainVariantRows.length,
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
    if (isBackupCatalogVariantTitle(row.title)) {
      continue;
    }
    try {
      await ensureBackupVariantForMain(admin, shop, row.shopifyVariantId);
    } catch (error) {
      console.warn("[backup-dress-variant] ensure row", row.shopifyVariantId, error);
    }
  }
}