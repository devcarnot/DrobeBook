import prisma from "../../db.server";
import { parseAppointmentDurationMinutes } from "./appointment-durations";
import { cleanupExpiredAppointmentHolds } from "./appointment-hold.server";
import type { AppointmentConfig } from "../shop-config";
import {
  capacityPerChangeRoom,
  getChangeRoomIds,
} from "./change-rooms";
import {
  type AppointmentDuration,
  type AppointmentSlotView,
  type DayType,
  appointmentOccupiesSlot,
  dateMatchesDayType,
  earliestAppointmentDate,
  formatIsoDate,
  generateSlotTemplates,
  getDayTypeForDate,
  isPastDate,
} from "./slots";
import { parseIsoDate } from "../booking/availability.server";

export type AppointmentCalendarParams = {
  shop: string;
  year: number;
  month: number;
  dayType: DayType;
  durationMinutes: AppointmentDuration;
  config: AppointmentConfig;
  today?: Date;
};

export type AppointmentSlotsParams = {
  shop: string;
  date: string;
  durationMinutes: AppointmentDuration;
  config: AppointmentConfig;
  today?: Date;
};

export type RoomOccupancy = {
  time: string;
  durationMinutes: number;
  changeRoomId: string;
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function holdsAvailable() {
  return typeof (prisma as { appointmentHold?: unknown }).appointmentHold !== "undefined";
}

async function getOccupanciesForDate(
  shop: string,
  dateIso: string,
): Promise<RoomOccupancy[]> {
  const date = parseIsoDate(dateIso);
  if (!date) {
    return [];
  }

  if (holdsAvailable()) {
    await cleanupExpiredAppointmentHolds(shop);
  }

  const [bookings, holds] = await Promise.all([
    prisma.appointmentBooking.findMany({
      where: { shop, date },
      select: {
        time: true,
        durationMinutes: true,
        changeRoomId: true,
      },
    }),
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
  ]);

  return [
    ...bookings.map((entry) => ({
      time: entry.time,
      durationMinutes: entry.durationMinutes,
      changeRoomId: entry.changeRoomId,
    })),
    ...holds.map((entry) => ({
      time: entry.time,
      durationMinutes: entry.durationMinutes,
      changeRoomId: entry.changeRoomId,
    })),
  ];
}

async function getOccupanciesForMonth(
  shop: string,
  year: number,
  month: number,
): Promise<Map<string, RoomOccupancy[]>> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  if (holdsAvailable()) {
    await cleanupExpiredAppointmentHolds(shop);
  }

  const [bookings, holds] = await Promise.all([
    prisma.appointmentBooking.findMany({
      where: {
        shop,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: {
        date: true,
        time: true,
        durationMinutes: true,
        changeRoomId: true,
      },
    }),
    holdsAvailable()
      ? prisma.appointmentHold.findMany({
          where: {
            shop,
            date: { gte: monthStart, lte: monthEnd },
            expiresAt: { gt: new Date() },
          },
          select: {
            date: true,
            time: true,
            durationMinutes: true,
            changeRoomId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const byDate = new Map<string, RoomOccupancy[]>();

  function push(
    dateValue: Date,
    entry: { time: string; durationMinutes: number; changeRoomId: string },
  ) {
    const dateIso = formatIsoDate(dateValue);
    const list = byDate.get(dateIso) ?? [];
    list.push({
      time: entry.time,
      durationMinutes: entry.durationMinutes,
      changeRoomId: entry.changeRoomId,
    });
    byDate.set(dateIso, list);
  }

  for (const booking of bookings) {
    push(booking.date, booking);
  }
  for (const hold of holds) {
    push(hold.date, hold);
  }

  return byDate;
}

export function getOccupiedRoomsForWindow(
  occupancies: RoomOccupancy[],
  slotTime: string,
  slotDurationMinutes: number,
  changeRoomCount: number,
): Set<string> {
  const roomIds = getChangeRoomIds(changeRoomCount);
  const roomCapacity = capacityPerChangeRoom();
  const occupied = new Set<string>();

  for (const roomId of roomIds) {
    const roomOccupancies = occupancies.filter(
      (entry) =>
        entry.changeRoomId === roomId &&
        appointmentOccupiesSlot(
          entry.time,
          entry.durationMinutes,
          slotTime,
          slotDurationMinutes,
        ),
    );

    if (roomOccupancies.length >= roomCapacity) {
      occupied.add(roomId);
    }
  }

  return occupied;
}

function aggregateSlotAvailability(
  template: { time: string; endTime: string; label: string; capacity: number },
  occupancies: RoomOccupancy[],
  changeRoomCount: number,
  durationMinutes: AppointmentDuration,
): AppointmentSlotView {
  const roomIds = getChangeRoomIds(changeRoomCount);
  const occupied = getOccupiedRoomsForWindow(
    occupancies,
    template.time,
    durationMinutes,
    changeRoomCount,
  );
  const available = roomIds.filter((roomId) => !occupied.has(roomId)).length;
  const bookedCount = roomIds.length - available;

  return {
    time: template.time,
    endTime: template.endTime,
    label: template.label,
    durationMinutes,
    capacity: roomIds.length * capacityPerChangeRoom(),
    bookedCount,
    available,
    soldOut: available <= 0,
  };
}

function buildAppointmentSlotsFromOccupancies(
  params: AppointmentSlotsParams,
  occupancies: RoomOccupancy[],
): AppointmentSlotView[] {
  const date = parseIsoDate(params.date);
  if (!date || isPastDate(date, params.today)) {
    return [];
  }

  const templates = generateSlotTemplates(
    date,
    params.durationMinutes,
    params.config,
  );

  return templates.map((template) =>
    aggregateSlotAvailability(
      template,
      occupancies,
      params.config.changeRoomCount,
      params.durationMinutes,
    ),
  );
}

export async function getUnavailableAppointmentDates(
  params: AppointmentCalendarParams,
): Promise<string[]> {
  const today = params.today ?? new Date();
  const unavailable: string[] = [];
  const totalDays = daysInMonth(params.year, params.month);
  const occupanciesByDate = await getOccupanciesForMonth(
    params.shop,
    params.year,
    params.month,
  );

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(Date.UTC(params.year, params.month - 1, day));
    const dateIso = formatIsoDate(date);

    if (
      isPastDate(date, today) ||
      date.getTime() < earliestAppointmentDate(today).getTime()
    ) {
      unavailable.push(dateIso);
      continue;
    }

    if (!dateMatchesDayType(date, params.dayType)) {
      unavailable.push(dateIso);
      continue;
    }

    const slots = buildAppointmentSlotsFromOccupancies(
      {
        shop: params.shop,
        date: dateIso,
        durationMinutes: params.durationMinutes,
        config: params.config,
        today,
      },
      occupanciesByDate.get(dateIso) ?? [],
    );

    if (!slots.length || slots.every((slot) => slot.soldOut)) {
      unavailable.push(dateIso);
    }
  }

  return unavailable;
}

export async function getAppointmentSlots(
  params: AppointmentSlotsParams,
): Promise<AppointmentSlotView[]> {
  const occupancies = await getOccupanciesForDate(params.shop, params.date);
  return buildAppointmentSlotsFromOccupancies(params, occupancies);
}

export function parseAppointmentDuration(
  value: string | null,
  allowed?: number[],
): AppointmentDuration | null {
  return parseAppointmentDurationMinutes(value, allowed);
}

export function parseDayType(value: string | null): DayType | null {
  if (value === "weekday" || value === "weekend") {
    return value;
  }
  return null;
}

export { getDayTypeForDate, dateMatchesDayType, getOccupanciesForDate };
