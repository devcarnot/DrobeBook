import prisma from "../../db.server";
import { parseIsoDate } from "../booking/availability.server";
import type { AppointmentConfig } from "../shop-config";
import {
  capacityPerChangeRoom,
  getChangeRoomIds,
} from "./change-rooms";
import { parseDisplayDate } from "../order-booking.server";
import { appointmentOccupiesSlot } from "./slots";
import {
  appointmentBookingToNotificationContext,
  sendAppointmentNotification,
} from "../notifications/notification.server";

export type AdminAppointmentBookingInput = {
  shop: string;
  date: string;
  time: string;
  durationMinutes: number;
  customerName: string;
  customerEmail?: string | null;
  eventDate?: string | null;
  itemsToTryOn?: string | null;
  instagram?: string | null;
  gownProductId?: string | null;
  gownVariantId?: string | null;
  config: AppointmentConfig;
};

async function findAvailableChangeRoom(
  shop: string,
  date: Date,
  time: string,
  durationMinutes: number,
  changeRoomCount: number,
): Promise<string | null> {
  const roomCapacity = capacityPerChangeRoom();
  const bookings = await prisma.appointmentBooking.findMany({
    where: { shop, date },
    select: {
      time: true,
      durationMinutes: true,
      changeRoomId: true,
    },
  });

  for (const changeRoomId of getChangeRoomIds(changeRoomCount)) {
    const overlapping = bookings.filter(
      (entry) =>
        entry.changeRoomId === changeRoomId &&
        appointmentOccupiesSlot(
          entry.time,
          entry.durationMinutes,
          time,
          durationMinutes,
        ),
    ).length;

    if (overlapping < roomCapacity) {
      return changeRoomId;
    }
  }

  return null;
}

export async function createAdminAppointmentBooking(
  input: AdminAppointmentBookingInput,
): Promise<{ appointmentId: string } | { error: string }> {
  const date = parseIsoDate(input.date);
  if (!date) {
    return { error: "Choose a valid appointment date." };
  }

  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    return { error: "Choose a valid appointment time." };
  }

  const customerName = input.customerName.trim();
  if (!customerName) {
    return { error: "Customer name is required." };
  }

  const changeRoomId = await findAvailableChangeRoom(
    input.shop,
    date,
    input.time,
    input.durationMinutes,
    input.config.changeRoomCount,
  );

  if (!changeRoomId) {
    return {
      error: "That time slot is no longer available. Please choose another.",
    };
  }

  const appointmentId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `admin-${Date.now()}`;

  const eventDate = input.eventDate
    ? parseIsoDate(input.eventDate) ?? parseDisplayDate(input.eventDate)
    : null;
  const orderId = `admin-${appointmentId}`;

  await prisma.$transaction(async (tx) => {
    await tx.appointmentBooking.create({
      data: {
        id: appointmentId,
        shop: input.shop,
        orderId,
        date,
        time: input.time,
        durationMinutes: input.durationMinutes,
        changeRoomId,
        source: "admin",
        customerName,
        customerEmail: input.customerEmail?.trim() || null,
        eventDate,
        itemsToTryOn: input.itemsToTryOn?.trim() || null,
        instagram: input.instagram?.trim() || null,
        gownProductId: input.gownProductId?.trim() || null,
        gownVariantId: input.gownVariantId?.trim() || null,
      },
    });

    const slot = await tx.appointmentSlot.findFirst({
      where: {
        shop: input.shop,
        date,
        time: input.time,
        durationMinutes: input.durationMinutes,
        changeRoomId,
      },
    });

    if (slot) {
      await tx.appointmentSlot.update({
        where: { id: slot.id },
        data: {
          bookedCount: { increment: 1 },
          orderId,
        },
      });
      return;
    }

    await tx.appointmentSlot.create({
      data: {
        shop: input.shop,
        date,
        time: input.time,
        durationMinutes: input.durationMinutes,
        changeRoomId,
        capacity: capacityPerChangeRoom(),
        bookedCount: 1,
        orderId,
      },
    });
  });

  const booking = await prisma.appointmentBooking.findUniqueOrThrow({
    where: { id: appointmentId },
  });

  void sendAppointmentNotification(
    input.shop,
    appointmentBookingToNotificationContext(booking),
  ).catch(() => undefined);

  return { appointmentId };
}
