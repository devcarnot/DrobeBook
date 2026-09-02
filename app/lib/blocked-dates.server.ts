import prisma from "../db.server";

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
};

export async function listBlockedDates(shop: string): Promise<BlockedDateRecord[]> {
  const rows = await prisma.blockedDate.findMany({
    where: { shop },
    orderBy: { startDate: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    startDate: formatDateOnly(row.startDate),
    endDate: formatDateOnly(row.endDate),
    reason: row.reason,
    productId: row.productId,
    variantId: row.variantId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
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
  },
): Promise<BlockedDateRecord> {
  const row = await prisma.blockedDate.create({
    data: {
      shop,
      startDate: parseDateOnly(input.startDate),
      endDate: parseDateOnly(input.endDate),
      reason: input.reason?.trim() || null,
      productId: input.productId ?? null,
      variantId: input.variantId ?? null,
      createdBy: input.createdBy ?? null,
    },
  });

  return {
    id: row.id,
    startDate: formatDateOnly(row.startDate),
    endDate: formatDateOnly(row.endDate),
    reason: row.reason,
    productId: row.productId,
    variantId: row.variantId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteBlockedDate(shop: string, id: string): Promise<void> {
  await prisma.blockedDate.deleteMany({
    where: { id, shop },
  });
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

  return createBlockedDate(shop, input);
}
