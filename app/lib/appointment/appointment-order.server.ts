import prisma from "../../db.server";
import { getShopConfig } from "../shop-settings.server";
import { parseDisplayDate } from "../order-booking.server";
import { parseIsoDate } from "../booking/availability.server";
import type { OrderLineItem } from "../order-booking.server";
import { parseAppointmentDurationMinutes } from "./appointment-durations";
import { consumeAppointmentHold } from "./appointment-hold.server";
import {
  capacityPerChangeRoom,
  getChangeRoomIds,
} from "./change-rooms";
import { appointmentOccupiesSlot } from "./slots";
import {
  appointmentBookingToNotificationContext,
  sendAppointmentNotification,
} from "../notifications/notification.server";

function getLineProperty(
  properties: OrderLineItem["properties"],
  name: string,
): string | null {
  if (!properties?.length) {
    return null;
  }

  const match = properties.find(
    (property) => property.name?.toLowerCase() === name.toLowerCase(),
  );
  return match?.value?.trim() || null;
}

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

export function isAppointmentLineItem(lineItem: OrderLineItem): boolean {
  const properties = lineItem.properties ?? [];
  return properties.some(
    (property) => property.name?.toLowerCase() === "appointment date",
  );
}

export type ParsedAppointmentLine = {
  appointmentId: string;
  date: Date;
  time: string;
  durationMinutes: number;
};

export function parseAppointmentLineItem(
  lineItem: OrderLineItem,
): ParsedAppointmentLine | null {
  const properties = lineItem.properties ?? [];
  const appointmentId =
    getLineProperty(properties, "_gk_appointment_id") ??
    getLineProperty(properties, "_gk_appointmentId");

  const dateRaw = getLineProperty(properties, "Appointment Date");
  const timeRaw =
    getLineProperty(properties, "_gk_appointment_time") ??
    getLineProperty(properties, "Appointment Time");
  const durationRaw =
    getLineProperty(properties, "_gk_appointment_duration") ??
    getLineProperty(properties, "Duration");

  const date = parseDisplayDate(dateRaw);
  const durationMinutes = parseAppointmentDurationMinutes(durationRaw);

  if (!appointmentId || !date || !timeRaw || !durationMinutes) {
    return null;
  }

  const time = /^\d{2}:\d{2}$/.test(timeRaw)
    ? timeRaw
    : parseIsoDate(timeRaw)
      ? formatTimeFromIso(timeRaw)
      : null;

  if (!time) {
    return null;
  }

  return {
    appointmentId,
    date,
    time,
    durationMinutes,
  };
}

function formatTimeFromIso(value: string): string | null {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return null;
  }

  return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}`;
}

export async function confirmAppointmentFromOrder(
  shop: string,
  orderId: string,
  lineItem: OrderLineItem,
  customer?: { email?: string | null; name?: string | null },
): Promise<{ created: boolean; appointmentId: string } | null> {
  const parsed = parseAppointmentLineItem(lineItem);
  if (!parsed) {
    return null;
  }

  const existing = await prisma.appointmentBooking.findUnique({
    where: { id: parsed.appointmentId },
    select: { id: true },
  });

  if (existing) {
    return { created: false, appointmentId: existing.id };
  }

  const shopConfig = await getShopConfig(shop);
  const heldRoomId = await consumeAppointmentHold(shop, parsed.appointmentId);
  const changeRoomId =
    heldRoomId ??
    (await findAvailableChangeRoom(
      shop,
      parsed.date,
      parsed.time,
      parsed.durationMinutes,
      shopConfig.appointment.changeRoomCount,
    ));

  if (!changeRoomId) {
    return null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointmentBooking.create({
      data: {
        id: parsed.appointmentId,
        shop,
        orderId,
        date: parsed.date,
        time: parsed.time,
        durationMinutes: parsed.durationMinutes,
        changeRoomId,
        customerEmail: customer?.email?.trim() || null,
        customerName: customer?.name?.trim() || null,
      },
    });

    const slot = await tx.appointmentSlot.findFirst({
      where: {
        shop,
        date: parsed.date,
        time: parsed.time,
        durationMinutes: parsed.durationMinutes,
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
        shop,
        date: parsed.date,
        time: parsed.time,
        durationMinutes: parsed.durationMinutes,
        changeRoomId,
        capacity: capacityPerChangeRoom(),
        bookedCount: 1,
        orderId,
      },
    });
  });

  const booking = await prisma.appointmentBooking.findUniqueOrThrow({
    where: { id: parsed.appointmentId },
  });

  void sendAppointmentNotification(
    shop,
    appointmentBookingToNotificationContext(booking),
  ).catch(() => undefined);

  return { created: true, appointmentId: parsed.appointmentId };
}

export async function processOrderAppointments(
  shop: string,
  orderId: string,
  lineItems: OrderLineItem[],
  customer?: { email?: string | null; name?: string | null },
): Promise<{ confirmed: number; skipped: number }> {
  let confirmed = 0;
  let skipped = 0;

  for (const lineItem of lineItems) {
    if (!isAppointmentLineItem(lineItem)) {
      continue;
    }

    const result = await confirmAppointmentFromOrder(
      shop,
      orderId,
      lineItem,
      customer,
    );
    if (result) {
      confirmed += result.created ? 1 : 0;
      skipped += result.created ? 0 : 1;
    } else {
      skipped += 1;
    }
  }

  return { confirmed, skipped };
}

export async function cancelAppointmentsForOrder(shop: string, orderId: string) {
  const bookings = await prisma.appointmentBooking.findMany({
    where: { shop, orderId },
  });

  for (const booking of bookings) {
    const slot = await prisma.appointmentSlot.findFirst({
      where: {
        shop,
        date: booking.date,
        time: booking.time,
        durationMinutes: booking.durationMinutes,
        changeRoomId: booking.changeRoomId,
      },
    });

    if (slot && slot.bookedCount > 0) {
      await prisma.appointmentSlot.update({
        where: { id: slot.id },
        data: { bookedCount: { decrement: 1 } },
      });
    }

    await prisma.appointmentBooking.delete({
      where: { id: booking.id },
    });
  }

  return bookings.length;
}
