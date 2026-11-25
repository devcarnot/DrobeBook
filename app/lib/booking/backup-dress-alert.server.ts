import type { BackupOrderViolationDetail } from "./backup-dress-order-verify.server";

export async function notifyBackupDressViolation(params: {
  shop: string;
  orderId: string;
  orderName: string | null;
  violations: BackupOrderViolationDetail[];
}): Promise<void> {
  const url = process.env.BACKUP_VIOLATION_WEBHOOK_URL?.trim();
  if (!url || !params.violations.length) {
    return;
  }

  const payload = {
    shop: params.shop,
    orderId: params.orderId,
    orderName: params.orderName,
    violationCount: params.violations.length,
    violations: params.violations.map((row) => ({
      variantId: row.variantId,
      expectedTier: row.expectedTier,
      actualTier: row.actualTier,
      expectedPriceCents: row.expectedPriceCents,
      actualPriceCents: row.actualPriceCents,
      reason: row.reason,
    })),
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("[backup-dress-alert]", error);
  }
}