import prisma from "../db.server";

export async function claimWebhookEvent(
  shop: string,
  topic: string,
  externalId: string,
): Promise<boolean> {
  try {
    await prisma.webhookProcessLog.create({
      data: { shop, topic, externalId },
    });
    return true;
  } catch {
    return false;
  }
}