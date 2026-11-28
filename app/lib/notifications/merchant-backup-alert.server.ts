import type { BackupOrderViolationDetail } from "../booking/backup-dress-order-verify.server";
import { adminAppBaseUrl, sendMerchantNotifications } from "./merchant-notify.server";

export async function sendBackupDressAdminAlert(params: {
  shop: string;
  orderId: string;
  violations: BackupOrderViolationDetail[];
}) {
  if (!params.violations.length) {
    return { sent: 0, skipped: 0 };
  }

  const first = params.violations[0];
  const issue = params.violations
    .map((row) => row.reason)
    .filter(Boolean)
    .join("; ");

  return sendMerchantNotifications(params.shop, {
    trigger: "on_backup_dress_issue",
    bookingId: params.orderId,
    tokens: {
      productName: `Order ${params.orderId}`,
      variantId: first.variantId,
      issueDescription: issue || "Backup dress pricing mismatch",
      detectedAt: new Date().toLocaleString("en-AU"),
      adminBackupUrl: `${adminAppBaseUrl()}/app/backup-discount`,
    },
  });
}