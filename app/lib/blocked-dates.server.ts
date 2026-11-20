import prisma from "../db.server";
import {
  type BlockKind,
  WEEKLY_BLOCK_VALID_FROM,
  WEEKLY_BLOCK_VALID_UNTIL,
} from "./blocked-dates.logic";

function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type BlockedDateRecord = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  productId: string | null;
  variantId: string | null;
  createdBy: string | null;
  createdAt: string;
  blockKind: BlockKind;
  weekdayMask: number | null;
  appliesToHire: boolean;
  appliesToTryOn: boolean;
  appliesToPost: boolean;
  appliesToPickup: boolean;
};

function mapRow(row: {
  id: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  productId: string | null;
  variantId: string | null;
  createdBy: string | null;
  createdAt: Date;
  blockKind: string;
  weekdayMask: number | null;
  appliesToHire: boolean;
  appliesToTryOn: boolean;
  appliesToPost: boolean;
  appliesToPickup: boolean;
}): BlockedDateRecord {
  return {
    id: row.id,
    startDate: formatDateOnly(row.startDate),
    endDate: formatDateOnly(row.endDate),
    reason: row.reason,
    productId: row.productId,
    variantId: row.variantId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    blockKind: row.blockKind === "weekly" ? "weekly" : "range",
    weekdayMask: row.weekdayMask,
    appliesToHire: row.appliesToHire,
    appliesToTryOn: row.appliesToTryOn,
    appliesToPost: row.appliesToPost,
    appliesToPickup: row.appliesToPickup,
  };
}

export async function listBlockedDates(shop: string): Promise<BlockedDateRecord[]> {
  const rows = await prisma.blockedDate.findMany({
    where: { shop },
    orderBy: [{ blockKind: "asc" }, { startDate: "asc" }],
  });

  return rows.map(mapRow);
}

export async function listShopWideBlockRules(shop: string) {
  const rows = await prisma.blockedDate.findMany({
    where: { shop, productId: null, variantId: null },
  });

  return rows.map((row) => ({
    blockKind: row.blockKind === "weekly" ? ("weekly" as const) : ("range" as const),
    startDate: row.startDate,
    endDate: row.endDate,
    weekdayMask: row.weekdayMask,
    appliesToHire: row.appliesToHire,
    appliesToTryOn: row.appliesToTryOn,
    appliesToPost: row.appliesToPost,
    appliesToPickup: row.appliesToPickup,
    productId: row.productId,
    variantId: row.variantId,
    reason: row.reason,
  }));
}

export async function createBlockedDate(
  shop: string,
  input: {
    startDate: string;
    endDate: string;
    reason?: string;
    productId?: string;
    variantId?: string;
    createdBy?: string;
    blockKind?: BlockKind;
    weekdayMask?: number;
    appliesToHire?: boolean;
    appliesToTryOn?: boolean;
    appliesToPost?: boolean;
    appliesToPickup?: boolean;
  },
): Promise<BlockedDateRecord> {
  const blockKind = input.blockKind ?? "range";

  const row = await prisma.blockedDate.create({
    data: {
      shop,
      startDate: parseDateOnly(input.startDate),
      endDate: parseDateOnly(input.endDate),
      reason: input.reason?.trim() || null,
      productId: input.productId ?? null,
      variantId: input.variantId ?? null,
      createdBy: input.createdBy ?? null,
      blockKind,
      weekdayMask: blockKind === "weekly" ? (input.weekdayMask ?? 0) : null,
      appliesToHire: input.appliesToHire ?? true,
      appliesToTryOn: input.appliesToTryOn ?? true,
      appliesToPost: input.appliesToPost ?? true,
      appliesToPickup: input.appliesToPickup ?? true,
    },
  });

  return mapRow(row);
}

export async function createWeeklyBlockedDays(
  shop: string,
  input: {
    weekdayMask: number;
    reason?: string;
    appliesToHire?: boolean;
    appliesToTryOn?: boolean;
    appliesToPost?: boolean;
    appliesToPickup?: boolean;
    validFrom?: string;
    validUntil?: string;
    createdBy?: string;
  },
): Promise<BlockedDateRecord> {
  if (input.weekdayMask === 0) {
    throw new Error("Select at least one weekday.");
  }

  const appliesToHire = input.appliesToHire ?? true;
  const appliesToTryOn = input.appliesToTryOn ?? true;
  if (!appliesToHire && !appliesToTryOn) {
    throw new Error("Select at least one booking type (hire or try-on).");
  }

  return createBlockedDate(shop, {
    startDate: input.validFrom ?? WEEKLY_BLOCK_VALID_FROM,
    endDate: input.validUntil ?? WEEKLY_BLOCK_VALID_UNTIL,
    reason: input.reason,
    blockKind: "weekly",
    weekdayMask: input.weekdayMask,
    appliesToHire,
    appliesToTryOn,
    appliesToPost: input.appliesToPost ?? true,
    appliesToPickup: input.appliesToPickup ?? false,
    createdBy: input.createdBy,
  });
}

export async function deleteBlockedDate(
  shop: string,
  id: string,
): Promise<BlockedDateRecord | null> {
  const existing = await prisma.blockedDate.findFirst({
    where: { id, shop },
  });

  if (!existing) {
    return null;
  }

  await prisma.blockedDate.deleteMany({
    where: { id, shop },
  });

  return mapRow(existing);
}

export async function createGarmentBlockedDate(
  shop: string,
  input: {
    productId: string;
    variantId: string;
    startDate: string;
    endDate: string;
    reason?: string;
    createdBy?: string;
  },
): Promise<BlockedDateRecord> {
  await prisma.garment.upsert({
    where: {
      shop_productId_variantId: {
        shop,
        productId: input.productId,
        variantId: input.variantId,
      },
    },
    create: {
      shop,
      productId: input.productId,
      variantId: input.variantId,
    },
    update: {},
  });

  return createBlockedDate(shop, {
    ...input,
    blockKind: "range",
    appliesToHire: true,
    appliesToTryOn: false,
    appliesToPost: true,
    appliesToPickup: true,
  });
}