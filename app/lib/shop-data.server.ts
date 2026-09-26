import prisma from "../db.server";

/** Remove all app data for a shop (GDPR shop/redact, optional full cleanup). */
export async function purgeShopData(shop: string) {
  await prisma.$transaction(async (tx) => {
    await tx.notificationSend.deleteMany({ where: { shop } });
    await tx.waitlistEntry.deleteMany({ where: { shop } });
    await tx.blockedDate.deleteMany({ where: { shop } });
    await tx.tryOnCredit.deleteMany({ where: { shop } });
    await tx.appointmentHold.deleteMany({ where: { shop } });
    await tx.appointmentBooking.deleteMany({ where: { shop } });
    await tx.appointmentSlot.deleteMany({ where: { shop } });
    await tx.booking.deleteMany({ where: { shop } });
    await tx.garment.deleteMany({ where: { shop } });
    await tx.rentalProductVariant.deleteMany({ where: { shop } });
    await tx.rentalProduct.deleteMany({ where: { shop } });
    await tx.shopSettings.deleteMany({ where: { shop } });
    await tx.session.deleteMany({ where: { shop } });
  });
}

/** Redact customer PII for a single email address on one shop. */
export async function redactCustomerData(shop: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.updateMany({
      where: { shop, customerEmail: { equals: normalized, mode: "insensitive" } },
      data: {
        customerEmail: null,
        customerName: null,
        deliveryAddressJson: null,
        rentalNotes: null,
      },
    });

    await tx.appointmentBooking.updateMany({
      where: { shop, customerEmail: { equals: normalized, mode: "insensitive" } },
      data: {
        customerEmail: null,
        customerName: null,
        itemsToTryOn: null,
        instagram: null,
      },
    });

    await tx.waitlistEntry.updateMany({
      where: { shop, email: normalized },
      data: {
        email: "redacted@example.com",
        name: null,
        notes: null,
      },
    });

    await tx.tryOnCredit.updateMany({
      where: { shop, customerEmail: normalized },
      data: { customerEmail: "redacted@example.com" },
    });
  });
}

export async function listShopsWithAppData(): Promise<string[]> {
  const [settings, sessions] = await Promise.all([
    prisma.shopSettings.findMany({ select: { shop: true } }),
    prisma.session.findMany({ select: { shop: true }, distinct: ["shop"] }),
  ]);

  return [...new Set([...settings.map((row) => row.shop), ...sessions.map((row) => row.shop)])];
}
