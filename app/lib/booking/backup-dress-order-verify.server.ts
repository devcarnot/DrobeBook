import prisma from "../../db.server";
import {
  BACKUP_HIRE_TIER,
  BACKUP_PAY_FRACTION,
  computeBackupDressAssignments,
  isGownHireLine,
  MAIN_HIRE_TIER,
  roundBackupPriceCents,
  type BackupDressLineInput,
} from "./backup-dress-pricing";
import { isBackupCatalogVariantTitle } from "./backup-dress-variant.logic";
import { extractNumericId } from "../shopify-ids";

const VIOLATION_TAG = "BACKUP-VIOLATION";

export type OrderLineSnapshot = {
  variantId: string;
  quantity: number;
  priceCents: number;
  properties: Record<string, string>;
};

export type BackupOrderViolationDetail = {
  variantId: string;
  expectedTier: string;
  actualTier: string;
  expectedPriceCents: number;
  actualPriceCents: number;
  reason: string;
};

function parseLineProperties(
  properties: Array<{ name: string; value: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of properties ?? []) {
    if (row?.name != null) {
      out[String(row.name)] = row.value == null ? "" : String(row.value);
    }
  }
  return out;
}

function priceToCents(price: string | number | null | undefined): number {
  const amount = Number.parseFloat(String(price ?? "0"));
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100);
}

export async function buildVariantCatalogMaps(shop: string) {
  const rows = await prisma.rentalProductVariant.findMany({
    where: {
      shop,
      availableInShopify: true,
      rentalProduct: { rentalEnabled: true, removedAt: null },
    },
    select: {
      shopifyVariantId: true,
      backupShopifyVariantId: true,
      title: true,
      price: true,
    },
  });

  const mainById = new Map<string, (typeof rows)[number]>();
  const backupToMain = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    if (isBackupCatalogVariantTitle(row.title)) {
      continue;
    }
    mainById.set(row.shopifyVariantId, row);
    if (row.backupShopifyVariantId) {
      backupToMain.set(row.backupShopifyVariantId, row);
    }
  }

  return { mainById, backupToMain, rows };
}

function resolveMainPriceCents(
  variantId: string,
  paidCents: number,
  mainById: Map<string, { price: string | null }>,
  backupToMain: Map<string, { price: string | null }>,
): number {
  const mainRow = mainById.get(variantId) ?? backupToMain.get(variantId);
  if (mainRow?.price) {
    return priceToCents(mainRow.price);
  }
  if (backupToMain.has(variantId)) {
    return Math.round(paidCents / BACKUP_PAY_FRACTION);
  }
  return paidCents;
}

function unitKeysForLine(lineKey: string, quantity: number): string[] {
  const qty = Math.max(1, Math.min(99, Math.floor(quantity)));
  if (qty === 1) {
    return [lineKey];
  }
  return Array.from({ length: qty }, (_, index) => `${lineKey}#unit=${index + 1}`);
}

function pushLineViolation(
  violations: BackupOrderViolationDetail[],
  input: {
    variantId: string;
    expectedTier: string;
    actualTier: string;
    expectedPriceCents: number;
    actualPriceCents: number;
    reason: string;
  },
) {
  violations.push({
    variantId: input.variantId,
    expectedTier: input.expectedTier,
    actualTier: input.actualTier,
    expectedPriceCents: input.expectedPriceCents,
    actualPriceCents: input.actualPriceCents,
    reason: input.reason,
  });
}

export function verifyBackupDressOrderLines(params: {
  lines: OrderLineSnapshot[];
  mainById: Map<string, { shopifyVariantId: string; backupShopifyVariantId: string | null }>;
  backupToMain: Map<string, { shopifyVariantId: string }>;
  discountEnabled: boolean;
}): BackupOrderViolationDetail[] {
  if (!params.discountEnabled) {
    return [];
  }

  const gownLines: BackupDressLineInput[] = [];

  params.lines.forEach((line, lineIndex) => {
    const props = line.properties;
    if (!isGownHireLine(props)) {
      return;
    }
    const variantId = extractNumericId(line.variantId);
    const standardCents = resolveMainPriceCents(
      variantId,
      line.priceCents,
      params.mainById as Map<string, { price: string | null }>,
      params.backupToMain as Map<string, { price: string | null }>,
    );
    gownLines.push({
      key: `line-${lineIndex}`,
      variantId,
      quantity: line.quantity,
      priceCents: standardCents,
      createdAt: lineIndex,
      properties: props,
    });
  });

  const expected = computeBackupDressAssignments(gownLines, { expandQuantity: true });
  const expectedByKey = new Map(expected.map((row) => [row.key, row]));
  const violations: BackupOrderViolationDetail[] = [];

  params.lines.forEach((line, lineIndex) => {
    const props = line.properties;
    if (!isGownHireLine(props)) {
      return;
    }
    const variantId = extractNumericId(line.variantId);
    const isBackupVariant = params.backupToMain.has(variantId);
    const standardCents = resolveMainPriceCents(
      variantId,
      line.priceCents,
      params.mainById as Map<string, { price: string | null }>,
      params.backupToMain as Map<string, { price: string | null }>,
    );
    const actualTier = isBackupVariant ? BACKUP_HIRE_TIER : MAIN_HIRE_TIER;
    const lineKey = `line-${lineIndex}`;
    const unitKeys = unitKeysForLine(lineKey, line.quantity);

    for (const unitKey of unitKeys) {
      const match = expectedByKey.get(unitKey);
      if (!match) {
        if (isBackupVariant) {
          pushLineViolation(violations, {
            variantId,
            expectedTier: MAIN_HIRE_TIER,
            actualTier: BACKUP_HIRE_TIER,
            expectedPriceCents: standardCents,
            actualPriceCents: line.priceCents,
            reason: "Backup variant purchased without an eligible multi-gown group",
          });
        }
        continue;
      }

      const expectedTier = match.tier;
      const expectedPrice =
        expectedTier === BACKUP_HIRE_TIER
          ? roundBackupPriceCents(standardCents)
          : standardCents;
      const priceDelta = Math.abs(line.priceCents - expectedPrice);

      if (actualTier !== expectedTier) {
        pushLineViolation(violations, {
          variantId,
          expectedTier,
          actualTier,
          expectedPriceCents: expectedPrice,
          actualPriceCents: line.priceCents,
          reason: "Variant tier does not match server allocation",
        });
      } else if (priceDelta > 1) {
        pushLineViolation(violations, {
          variantId,
          expectedTier,
          actualTier,
          expectedPriceCents: expectedPrice,
          actualPriceCents: line.priceCents,
          reason: "Paid price does not match expected hire tier price",
        });
      }
    }
  });

  return violations;
}

export async function recordBackupOrderViolations(
  shop: string,
  orderId: string,
  orderName: string | null,
  violations: BackupOrderViolationDetail[],
): Promise<void> {
  if (!violations.length) {
    return;
  }

  await prisma.backupOrderFlag.upsert({
    where: {
      shop_shopifyOrderId: { shop, shopifyOrderId: orderId },
    },
    create: {
      shop,
      shopifyOrderId: orderId,
      orderName,
      status: "open",
      detailJson: JSON.stringify(violations),
    },
    update: {
      orderName,
      status: "open",
      detailJson: JSON.stringify(violations),
    },
  });
}

export async function tagOrderBackupViolation(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  orderGid: string,
  note: string,
): Promise<void> {
  const tagsMutation = `#graphql
    mutation TagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { message }
      }
    }
  `;
  try {
    await admin.graphql(tagsMutation, {
      variables: { id: orderGid, tags: [VIOLATION_TAG] },
    });
    const noteMutation = `#graphql
      mutation OrderNote($id: ID!, $note: String!) {
        orderUpdate(input: { id: $id, note: $note }) {
          userErrors { message }
        }
      }
    `;
    await admin.graphql(noteMutation, {
      variables: { id: orderGid, note: `Backup dress verification:\n${note}` },
    });
  } catch (error) {
    console.warn("[backup-order-verify] tag failed", error);
  }
}

export { VIOLATION_TAG };