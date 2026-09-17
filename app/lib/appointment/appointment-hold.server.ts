import prisma from "../../db.server";
import { parseIsoDate } from "../booking/availability.server";
import type { AppointmentConfig } from "../shop-config";
import {
  capacityPerChangeRoom,
  getChangeRoomIds,
} from "./change-rooms";
import { appointmentOccupiesSlot } from "./slots";

export const APPOINTMENT_HOLD_MINUTES = 15;

function holdsAvailable() {
  return typeof (prisma as { appointmentHold?: unknown }).appointmentHold !== "undefined";
}

export async function cleanupExpiredAppointmentHolds(shop: string) {
  if (!holdsAvailable()) {
    return;
  }

  await prisma.appointmentHold.deleteMany({
    where: {
      shop,
      expiresAt: { lt: new Date() },
    },
  });
}

/** Exact-time hold counts (same duration). Prefer overlap-aware occupancy for display. */
export async function getHoldCountsByTimeForDate(
  shop: string,
  dateIso: string,
  durationMinutes: number,
): Promise<Map<string, Map<string, number>>> {
  if (!holdsAvailable()) {
    return new Map();
  }

  await cleanupExpiredAppointmentHolds(shop);

  const date = parseIsoDate(dateIso);
  if (!date) {
    return new Map();
  }

  const holds = await prisma.appointmentHold.findMany({
    where: {
      shop,
      date,
      durationMinutes,
      expiresAt: { gt: new Date() },
    },
    select: {
      time: true,
      changeRoomId: true,
    },
  });

  const byTime = new Map<string, Map<string, number>>();
  for (const hold of holds) {
    const rooms = byTime.get(hold.time) ?? new Map<string, number>();
    rooms.set(hold.changeRoomId, (rooms.get(hold.changeRoomId) ?? 0) + 1);
    byTime.set(hold.time, rooms);
  }

  return byTime;
}

async function getOccupiedRoomsForSlot(
  shop: string,
  date: Date,
  time: string,
  durationMinutes: number,
  changeRoomCount: number,
): Promise<Set<string>> {
  await cleanupExpiredAppointmentHolds(shop);

  const roomIds = getChangeRoomIds(changeRoomCount);
  const roomCapacity = capacityPerChangeRoom();
  const occupied = new Set<string>();

  const [holds, bookings] = await Promise.all([
    holdsAvailable()
      ? prisma.appointmentHold.findMany({
          where: {
            shop,
            date,
            expiresAt: { gt: new Date() },
          },
          select: {
            time: true,
            durationMinutes: true,
            changeRoomId: true,
          },
        })
      : Promise.resolve([]),
    prisma.appointmentBooking.findMany({
      where: { shop, date },
      select: {
        time: true,
        durationMinutes: true,
        changeRoomId: true,
      },
    }),
  ]);

  const occupancies = [...bookings, ...holds];

  for (const roomId of roomIds) {
    const roomBusy = occupancies.filter(
      (entry) =>
        entry.changeRoomId === roomId &&
        appointmentOccupiesSlot(
          entry.time,
          entry.durationMinutes,
          time,
          durationMinutes,
        ),
    ).length;

    if (roomBusy >= roomCapacity) {
      occupied.add(roomId);
    }
  }

  return occupied;
}

export async function reserveAppointmentRoom(input: {
  shop: string;
  appointmentId: string;
  date: string;
  time: string;
  durationMinutes: number;
  config: AppointmentConfig;
}): Promise<{ changeRoomId: string; expiresAt: string } | null> {
  if (!holdsAvailable()) {
    const fallbackRoom = getChangeRoomIds(input.config.changeRoomCount)[0];
    if (!fallbackRoom) {
      return null;
    }

    const expiresAt = new Date();
    expiresAt.setUTCMinutes(expiresAt.getUTCMinutes() + APPOINTMENT_HOLD_MINUTES);
    return {
      changeRoomId: fallbackRoom,
      expiresAt: expiresAt.toISOString(),
    };
  }

  const date = parseIsoDate(input.date);
  if (!date || !input.appointmentId.trim()) {
    return null;
  }

  await cleanupExpiredAppointmentHolds(input.shop);

  const existingHold = await prisma.appointmentHold.findUnique({
    where: { id: input.appointmentId },
  });

  if (existingHold && existingHold.expiresAt > new Date()) {
    return {
      changeRoomId: existingHold.changeRoomId,
      expiresAt: existingHold.expiresAt.toISOString(),
    };
  }

  const occupied = await getOccupiedRoomsForSlot(
    input.shop,
    date,
    input.time,
    input.durationMinutes,
    input.config.changeRoomCount,
  );

  const changeRoomId = getChangeRoomIds(input.config.changeRoomCount).find(
    (roomId) => !occupied.has(roomId),
  );

  if (!changeRoomId) {
    return null;
  }

  const expiresAt = new Date();
  expiresAt.setUTCMinutes(expiresAt.getUTCMinutes() + APPOINTMENT_HOLD_MINUTES);

  await prisma.appointmentHold.upsert({
    where: { id: input.appointmentId },
    create: {
      id: input.appointmentId,
      shop: input.shop,
      date,
      time: input.time,
      durationMinutes: input.durationMinutes,
      changeRoomId,
      expiresAt,
    },
    update: {
      date,
      time: input.time,
      durationMinutes: input.durationMinutes,
      changeRoomId,
      expiresAt,
    },
  });

  return {
    changeRoomId,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function releaseAppointmentHold(appointmentId: string) {
  if (!holdsAvailable()) {
    return;
  }

  await prisma.appointmentHold.deleteMany({
    where: { id: appointmentId },
  });
}

export async function consumeAppointmentHold(
  shop: string,
  appointmentId: string,
): Promise<string | null> {
  if (!holdsAvailable()) {
    return null;
  }

  const hold = await prisma.appointmentHold.findUnique({
    where: { id: appointmentId },
  });

  if (!hold || hold.shop !== shop) {
    return null;
  }

  if (hold.expiresAt <= new Date()) {
    await releaseAppointmentHold(appointmentId);
    return null;
  }

  await releaseAppointmentHold(appointmentId);
  return hold.changeRoomId;
}
