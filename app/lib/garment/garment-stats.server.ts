import { Prisma } from "@prisma/client";

import prisma from "../../db.server";

export async function recordGarmentHire(
  shop: string,
  productId: string,
  variantId: string,
  pricePaid: Prisma.Decimal | null | undefined,
) {
  const amount = pricePaid ?? new Prisma.Decimal(0);

  await prisma.garment.upsert({
    where: {
      shop_productId_variantId: { shop, productId, variantId },
    },
    create: {
      shop,
      productId,
      variantId,
      timesRented: 1,
      totalRevenue: amount,
    },
    update: {
      timesRented: { increment: 1 },
      totalRevenue: { increment: amount },
    },
  });
}

export async function reverseGarmentHire(
  shop: string,
  productId: string,
  variantId: string,
  pricePaid: Prisma.Decimal | null | undefined,
) {
  const garment = await prisma.garment.findUnique({
    where: {
      shop_productId_variantId: { shop, productId, variantId },
    },
  });

  if (!garment) {
    return;
  }

  const amount = pricePaid ?? new Prisma.Decimal(0);
  const nextTimesRented = Math.max(garment.timesRented - 1, 0);
  const nextRevenue = Prisma.Decimal.max(
    garment.totalRevenue.minus(amount),
    new Prisma.Decimal(0),
  );

  await prisma.garment.update({
    where: { id: garment.id },
    data: {
      timesRented: nextTimesRented,
      totalRevenue: nextRevenue,
    },
  });
}

export async function saveGarmentCostSettings(
  shop: string,
  productId: string,
  variantId: string,
  input: {
    purchaseCostOverride?: string | null;
    cleaningCostPerHire?: string | null;
  },
) {
  const purchaseCostOverride = parseOptionalDecimal(input.purchaseCostOverride);
  const cleaningCostPerHire = parseOptionalDecimal(input.cleaningCostPerHire);

  await prisma.garment.upsert({
    where: {
      shop_productId_variantId: { shop, productId, variantId },
    },
    create: {
      shop,
      productId,
      variantId,
      purchaseCostOverride,
      cleaningCostPerHire,
    },
    update: {
      purchaseCostOverride,
      cleaningCostPerHire,
    },
  });
}

function parseOptionalDecimal(value: string | null | undefined) {
  if (value == null || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Prisma.Decimal(parsed);
}
