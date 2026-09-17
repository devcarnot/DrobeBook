import { addDays, formatDateIso, toDateOnly } from "../booking/availability";

export type DayType = "weekday" | "weekend";
export type AppointmentDuration = number;

export function getSlotSettingsForDuration(
  durationMinutes: number,
  config: {
    slotInterval50?: number;
    slotInterval30?: number;
    slotInterval20?: number;
    capacity50: number;
    capacity30: number;
    capacity20: number;
  },
): { step: number; perRoomCapacity: number } {
  if (durationMinutes === 50) {
    return {
      step: config.slotInterval50 ?? 60,
      perRoomCapacity: config.capacity50,
    };
  }
  if (durationMinutes === 30) {
    return {
      step: config.slotInterval30 ?? 30,
      perRoomCapacity: config.capacity30,
    };
  }
  if (durationMinutes === 20) {
    return {
      step: config.slotInterval20 ?? 30,
      perRoomCapacity: config.capacity20,
    };
  }

  return {
    step: Math.min(30, durationMinutes),
    perRoomCapacity: 1,
  };
}

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

/** Convert "HH:MM" to minutes from midnight. */
export function timeToMinutes(value: string): number {
  const parts = parseTimeParts(value);
  return toMinutes(parts.hours, parts.minutes);
}

/** Half-open range overlap: [startA, endA) overlaps [startB, endB). */
export function timeRangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

export function appointmentOccupiesSlot(
  bookingTime: string,
  bookingDurationMinutes: number,
  slotTime: string,
  slotDurationMinutes: number,
): boolean {
  const bookingStart = timeToMinutes(bookingTime);
  const bookingEnd = bookingStart + bookingDurationMinutes;
  const slotStart = timeToMinutes(slotTime);
  const slotEnd = slotStart + slotDurationMinutes;
  return timeRangesOverlap(bookingStart, bookingEnd, slotStart, slotEnd);
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
    capacity30: number;
    capacity20: number;
    slotInterval50?: number;
    slotInterval30?: number;
    slotInterval20?: number;
    changeRoomCount?: number;
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
  const { step, perRoomCapacity } = getSlotSettingsForDuration(durationMinutes, config);
  const roomCount = Math.max(1, config.changeRoomCount ?? 2);
  const capacity = perRoomCapacity * roomCount;
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
