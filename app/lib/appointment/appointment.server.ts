import prisma from "../../db.server";
import type { AppointmentConfig } from "../shop-config";
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

async function getBookedCounts(
  shop: string,
  dateIso: string,
  durationMinutes: AppointmentDuration,
): Promise<Map<string, number>> {
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
      bookedCount: true,
    },
  });

  return new Map(records.map((record) => [record.time, record.bookedCount]));
}

export async function getUnavailableAppointmentDates(
  params: AppointmentCalendarParams,
): Promise<string[]> {
  const today = params.today ?? new Date();
  const unavailable: string[] = [];
  const totalDays = daysInMonth(params.year, params.month);

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(Date.UTC(params.year, params.month - 1, day));

    if (
      isPastDate(date, today) ||
      date.getTime() < earliestAppointmentDate(today).getTime()
    ) {
      unavailable.push(formatIsoDate(date));
      continue;
    }

    if (!dateMatchesDayType(date, params.dayType)) {
      unavailable.push(formatIsoDate(date));
      continue;
    }

    const slots = await getAppointmentSlots({
      shop: params.shop,
      date: formatIsoDate(date),
      durationMinutes: params.durationMinutes,
      config: params.config,
      today,
    });

    if (!slots.length || slots.every((slot) => slot.soldOut)) {
      unavailable.push(formatIsoDate(date));
    }
  }

  return unavailable;
}

export async function getAppointmentSlots(
  params: AppointmentSlotsParams,
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
  const bookedCounts = await getBookedCounts(
    params.shop,
    params.date,
    params.durationMinutes,
  );

  return templates.map((template) => {
    const bookedCount = bookedCounts.get(template.time) ?? 0;
    const available = Math.max(template.capacity - bookedCount, 0);

    return {
      time: template.time,
      endTime: template.endTime,
      label: template.label,
      durationMinutes: params.durationMinutes,
      capacity: template.capacity,
      bookedCount,
      available,
      soldOut: available <= 0,
    };
  });
}

export function parseAppointmentDuration(
  value: string | null,
): AppointmentDuration | null {
  const parsed = Number.parseInt(value || "", 10);
  if (parsed === 50 || parsed === 20) {
    return parsed;
  }
  return null;
}

export function parseDayType(value: string | null): DayType | null {
  if (value === "weekday" || value === "weekend") {
    return value;
  }
  return null;
}

export { getDayTypeForDate, dateMatchesDayType };
