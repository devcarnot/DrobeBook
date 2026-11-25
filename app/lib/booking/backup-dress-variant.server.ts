import prisma from "../../db.server";
import { BACKUP_PAY_FRACTION } from "./backup-dress-pricing";
import { extractNumericId, toProductGid, toVariantGid } from "../shopify-ids";

export const HIRE_PRICING_OPTION_NAME = "Hire pricing";
export const HIRE_PRICING_STANDARD = "Standard";
export const HIRE_PRICING_BACKUP = "Backup (80% off)";

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
          name
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

function isBackupSelectedOption(selectedOptions: Array<{ name: string; value: string }>): boolean {
  return selectedOptions.some(
    (row) =>
      isHirePricingOption(row.name) &&
      row.value.trim().toLowerCase() === HIRE_PRICING_BACKUP.toLowerCase(),
  );
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

  await ensureHirePricingOption(
    admin,
    variant.product.id,
    (variant.product.options ?? []).map((option) => option.name),
  );

  const refreshed = await admin.graphql(VARIANT_DETAIL_QUERY, {
    variables: { id: toVariantGid(mainShopifyVariantId) },
  });
  const refreshedVariant = ((await refreshed.json()) as {
    data?: { productVariant?: { selectedOptions?: Array<{ name: string; value: string }> } };
  }).data?.productVariant;

  const baseOptions = (refreshedVariant?.selectedOptions ?? selectedOptions).filter(
    (option) => !isHirePricingOption(option.name),
  );

  const optionValues = [
    ...baseOptions.map((option) => ({
      optionName: option.name,
      name: option.value,
    })),
    { optionName: HIRE_PRICING_OPTION_NAME, name: HIRE_PRICING_BACKUP },
  ];

  const createResponse = await admin.graphql(VARIANTS_BULK_CREATE, {
    variables: {
      productId: variant.product.id,
      variants: [
        {
          price: centsToPrice(backupPriceCents),
          optionValues,
          inventoryItem: variant.sku ? { sku: `${variant.sku}-BKP` } : undefined,
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
    console.warn("[backup-dress-variant] create failed:", createErrors.join("; "));
    return null;
  }

  const createdId = createJson.data?.productVariantsBulkCreate?.productVariants?.[0]?.id;
  if (!createdId) {
    return null;
  }

  const backupNumericId = extractNumericId(createdId);
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