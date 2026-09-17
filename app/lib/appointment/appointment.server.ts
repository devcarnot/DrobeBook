import prisma from "../../db.server";
import { parseAppointmentDurationMinutes } from "./appointment-durations";
import { getHoldCountsByTimeForDate } from "./appointment-hold.server";
import type { AppointmentConfig } from "../shop-config";
import {
  capacityPerChangeRoom,
  getChangeRoomIds,
} from "./change-rooms";
import {
  type AppointmentDuration,
  type AppointmentSlotView,
  type DayType,
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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

type BookedByTimeAndRoom = Map<string, Map<string, number>>;

async function getBookedCountsByRoom(
  shop: string,
  dateIso: string,
  durationMinutes: AppointmentDuration,
): Promise<BookedByTimeAndRoom> {
  const date = parseIsoDate(dateIso);
  if (!date) {
    return new Map();
  }

  const records = await prisma.appointmentSlot.findMany({
    where: {
      shop,
      date,
      durationMinutes,
    },
    select: {
      time: true,
      changeRoomId: true,
      bookedCount: true,
    },
  });

  const byTime = new Map<string, Map<string, number>>();
  for (const record of records) {
    const rooms = byTime.get(record.time) ?? new Map<string, number>();
    rooms.set(record.changeRoomId, record.bookedCount);
    byTime.set(record.time, rooms);
  }

  return byTime;
}

async function getBookedCountsForMonth(
  shop: string,
  year: number,
  month: number,
  durationMinutes: AppointmentDuration,
): Promise<Map<string, BookedByTimeAndRoom>> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const records = await prisma.appointmentSlot.findMany({
    where: {
      shop,
      durationMinutes,
      date: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
    select: {
      date: true,
      time: true,
      changeRoomId: true,
      bookedCount: true,
    },
  });

  const byDate = new Map<string, BookedByTimeAndRoom>();
  for (const record of records) {
    const dateIso = formatIsoDate(record.date);
    const byTime = byDate.get(dateIso) ?? new Map<string, Map<string, number>>();
    const rooms = byTime.get(record.time) ?? new Map<string, number>();
    rooms.set(record.changeRoomId, record.bookedCount);
    byTime.set(record.time, rooms);
    byDate.set(dateIso, byTime);
  }

  return byDate;
}

function aggregateSlotAvailability(
  template: { time: string; endTime: string; label: string; capacity: number },
  bookedByRoom: Map<string, number> | undefined,
  holdByRoom: Map<string, number> | undefined,
  changeRoomCount: number,
  durationMinutes: AppointmentDuration,
): AppointmentSlotView {
  const roomIds = getChangeRoomIds(changeRoomCount);
  const roomCapacity = capacityPerChangeRoom();
  let available = 0;
  let bookedCount = 0;

  for (const roomId of roomIds) {
    const roomBooked = bookedByRoom?.get(roomId) ?? 0;
    const roomHeld = holdByRoom?.get(roomId) ?? 0;
    const roomOccupied = roomBooked + roomHeld;
    bookedCount += roomOccupied;
    if (roomOccupied < roomCapacity) {
      available += roomCapacity - roomOccupied;
    }
  }

  return {
    time: template.time,
    endTime: template.endTime,
    label: template.label,
    durationMinutes,
    capacity: roomIds.length * roomCapacity,
    bookedCount,
    available,
    soldOut: available <= 0,
  };
}

async function buildAppointmentSlots(
  params: AppointmentSlotsParams,
  bookedByTime: BookedByTimeAndRoom,
): Promise<AppointmentSlotView[]> {
  const date = parseIsoDate(params.date);
  if (!date || isPastDate(date, params.today)) {
    return [];
  }

  const templates = generateSlotTemplates(
    date,
    params.durationMinutes,
    params.config,
  );
  const holdByTime = await getHoldCountsByTimeForDate(
    params.shop,
    params.date,
    params.durationMinutes,
  );

  return templates.map((template) =>
    aggregateSlotAvailability(
      template,
      bookedByTime.get(template.time),
      holdByTime.get(template.time),
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
  const bookedByDate = await getBookedCountsForMonth(
    params.shop,
    params.year,
    params.month,
    params.durationMinutes,
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

    const slots = await buildAppointmentSlots(
      {
        shop: params.shop,
        date: dateIso,
        durationMinutes: params.durationMinutes,
        config: params.config,
        today,
      },
      bookedByDate.get(dateIso) ?? new Map(),
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
  const bookedByTime = await getBookedCountsByRoom(
    params.shop,
    params.date,
    params.durationMinutes,
  );

  return await buildAppointmentSlots(params, bookedByTime);
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

export { getDayTypeForDate, dateMatchesDayType };
