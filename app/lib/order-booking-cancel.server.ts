import prisma from "../db.server";
import { reverseGarmentHire } from "./garment/garment-stats.server";
import { notifyNextWaitlistForGarment } from "./waitlist/waitlist-notify.server";

export async function cancelBookingsForOrder(shop: string, orderId: string) {
  const bookings = await prisma.booking.findMany({
    where: {
      shop,
      orderId,
      status: { in: ["confirmed", "pending"] },
    },
  });

  for (const booking of bookings) {
    if (booking.status === "confirmed") {
      await reverseGarmentHire(
        shop,
        booking.productId,
        booking.variantId,
        booking.pricePaid,
      );
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "cancelled",
        workflowStatus: "cancelled",
      },
    });

    await notifyNextWaitlistForGarment(
      shop,
      booking.productId,
      booking.variantId,
    );
  }

  return bookings.length;
}
