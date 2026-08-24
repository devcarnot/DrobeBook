import prisma from "../db.server";

function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type BlockedDateRecord = {
  id: string;
  date: string;
  reason: string | null;
  productId: string | null;
  variantId: string | null;
};

export async function listBlockedDates(shop: string): Promise<BlockedDateRecord[]> {
  const rows = await prisma.blockedDate.findMany({
    where: { shop },
    orderBy: { date: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    date: formatDateOnly(row.date),
    reason: row.reason,
    productId: row.productId,
    variantId: row.variantId,
  }));
}

export async function createBlockedDate(
  shop: string,
  input: { date: string; reason?: string },
): Promise<BlockedDateRecord> {
  const row = await prisma.blockedDate.create({
    data: {
      shop,
      date: parseDateOnly(input.date),
      reason: input.reason?.trim() || null,
    },
  });

  return {
    id: row.id,
    date: formatDateOnly(row.date),
    reason: row.reason,
    productId: row.productId,
    variantId: row.variantId,
  };
}

export async function deleteBlockedDate(shop: string, id: string): Promise<void> {
  await prisma.blockedDate.deleteMany({
    where: { id, shop },
  });
}
