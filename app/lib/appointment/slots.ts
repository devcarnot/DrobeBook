import { addDays, formatDateIso, toDateOnly } from "../booking/availability";

export type DayType = "weekday" | "weekend";
export type AppointmentDuration = 50 | 20;

export type AppointmentSlotView = {
  time: string;
  endTime: string;
  label: string;
  durationMinutes: AppointmentDuration;
  capacity: number;
  bookedCount: number;
  available: number;
  soldOut: boolean;
};

function parseTimeParts(value: string): { hours: number; minutes: number } {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function formatTimeLabel(hours: number, minutes: number): string {
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minuteText = minutes ? `:${String(minutes).padStart(2, "0")}` : "";
  return `${hour12}${minuteText} ${period}`;
}

function addMinutes(hours: number, minutes: number, add: number) {
  const total = hours * 60 + minutes + add;
  return {
    hours: Math.floor(total / 60),
    minutes: total % 60,
  };
}

function toMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

export function getDayTypeForDate(date: Date): DayType | null {
  const day = date.getUTCDay();
  if (day >= 1 && day <= 5) {
    return "weekday";
  }
  if (day === 0 || day === 6) {
    return "weekend";
  }
  return null;
}

export function dateMatchesDayType(date: Date, dayType: DayType): boolean {
  const actual = getDayTypeForDate(date);
  return actual === dayType;
}

export function getHoursForDate(
  date: Date,
  config: {
    weekdayStart: string;
    weekdayEnd: string;
    saturdayStart: string;
    saturdayEnd: string;
    sundayStart: string;
    sundayEnd: string;
  },
): { start: string; end: string } | null {
  const day = date.getUTCDay();
  if (day >= 1 && day <= 5) {
    return { start: config.weekdayStart, end: config.weekdayEnd };
  }
  if (day === 6) {
    return { start: config.saturdayStart, end: config.saturdayEnd };
  }
  if (day === 0) {
    return { start: config.sundayStart, end: config.sundayEnd };
  }
  return null;
}

export function generateSlotTemplates(
  date: Date,
  durationMinutes: AppointmentDuration,
  config: {
    weekdayStart: string;
    weekdayEnd: string;
    saturdayStart: string;
    saturdayEnd: string;
    sundayStart: string;
    sundayEnd: string;
    capacity50: number;
    capacity20: number;
    slotInterval50?: number;
    slotInterval20?: number;
  },
): Array<{ time: string; endTime: string; label: string; capacity: number }> {
  const hours = getHoursForDate(date, config);
  if (!hours) {
    return [];
  }

  const start = parseTimeParts(hours.start);
  const end = parseTimeParts(hours.end);
  const startMinutes = toMinutes(start.hours, start.minutes);
  const endMinutes = toMinutes(end.hours, end.minutes);
  const step =
    durationMinutes === 50
      ? config.slotInterval50 ?? 60
      : config.slotInterval20 ?? 30;
  const capacity =
    durationMinutes === 50 ? config.capacity50 : config.capacity20;
  const slots: Array<{ time: string; endTime: string; label: string; capacity: number }> =
    [];

  for (
    let cursor = startMinutes;
    cursor + durationMinutes <= endMinutes;
    cursor += step
  ) {
    const slotStart = {
      hours: Math.floor(cursor / 60),
      minutes: cursor % 60,
    };
    const slotEnd = addMinutes(slotStart.hours, slotStart.minutes, durationMinutes);
    const time = `${String(slotStart.hours).padStart(2, "0")}:${String(slotStart.minutes).padStart(2, "0")}`;
    const endTime = `${String(slotEnd.hours).padStart(2, "0")}:${String(slotEnd.minutes).padStart(2, "0")}`;
    const label = `${formatTimeLabel(slotStart.hours, slotStart.minutes)} - ${formatTimeLabel(slotEnd.hours, slotEnd.minutes)}`;

    slots.push({ time, endTime, label, capacity });
  }

  return slots;
}

export function formatSlotOptionLabel(
  slot: AppointmentSlotView,
): string {
  if (slot.soldOut) {
    return `${slot.label} / Sold out`;
  }

  const spaces =
    slot.available === 1 ? "1 Space Available" : `${slot.available} Spaces Available`;
  return `${slot.label} / ${spaces}`;
}

export function isPastDate(date: Date, today = new Date()): boolean {
  return toDateOnly(date).getTime() < toDateOnly(today).getTime();
}

export function earliestAppointmentDate(today = new Date()): Date {
  return addDays(toDateOnly(today), 1);
}

export function formatIsoDate(date: Date): string {
  return formatDateIso(date);
}
