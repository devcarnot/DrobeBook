export type AppointmentDurationOption = {
  minutes: number;
  label: string;
};

export const MIN_APPOINTMENT_DURATION_MINUTES = 5;
export const MAX_APPOINTMENT_DURATION_MINUTES = 240;
export const MAX_APPOINTMENT_DURATION_OPTIONS = 8;

export const DEFAULT_APPOINTMENT_DURATIONS: AppointmentDurationOption[] = [
  {
    minutes: 50,
    label: "50 minute Appointment (recommended)",
  },
  {
    minutes: 30,
    label: "30 minute Appointment",
  },
  {
    minutes: 20,
    label: "20 minute (Cocktail wear & re-try only)",
  },
];

export function formatAppointmentDurationLabel(minutes: number): string {
  return `${minutes} minute appointment`;
}

function isValidDurationMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_APPOINTMENT_DURATION_MINUTES &&
    minutes <= MAX_APPOINTMENT_DURATION_MINUTES
  );
}

export function normalizeAppointmentDurations(
  value: unknown,
): AppointmentDurationOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_APPOINTMENT_DURATIONS.map((entry) => ({ ...entry }));
  }

  const seen = new Set<number>();
  const durations: AppointmentDurationOption[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Partial<AppointmentDurationOption> & {
      days?: number;
    };
    const minutes = Number(record.minutes ?? record.days);
    if (!isValidDurationMinutes(minutes) || seen.has(minutes)) {
      continue;
    }

    const label = String(record.label ?? "").trim() || formatAppointmentDurationLabel(minutes);
    seen.add(minutes);
    durations.push({ minutes, label });

    if (durations.length >= MAX_APPOINTMENT_DURATION_OPTIONS) {
      break;
    }
  }

  return durations.length > 0
    ? durations
    : DEFAULT_APPOINTMENT_DURATIONS.map((entry) => ({ ...entry }));
}

export function parseAppointmentDurationMinutes(
  value: string | null,
  allowed: number[] = DEFAULT_APPOINTMENT_DURATIONS.map((entry) => entry.minutes),
): number | null {
  const parsed = Number.parseInt(value || "", 10);
  if (allowed.includes(parsed)) {
    return parsed;
  }

  for (const minutes of allowed) {
    if (new RegExp(String(minutes)).test(value || "")) {
      return minutes;
    }
  }

  return null;
}

export function allowedAppointmentDurationMinutes(
  durations: AppointmentDurationOption[],
): number[] {
  return normalizeAppointmentDurations(durations).map((entry) => entry.minutes);
}

export function syncLegacyDurationLabels(
  durations: AppointmentDurationOption[],
): {
  duration50Label: string;
  duration30Label: string;
  duration20Label: string;
} {
  const normalized = normalizeAppointmentDurations(durations);
  const labelFor = (minutes: number, fallback: string) =>
    normalized.find((entry) => entry.minutes === minutes)?.label ?? fallback;

  return {
    duration50Label: labelFor(50, DEFAULT_APPOINTMENT_DURATIONS[0].label),
    duration30Label: labelFor(30, DEFAULT_APPOINTMENT_DURATIONS[1].label),
    duration20Label: labelFor(20, DEFAULT_APPOINTMENT_DURATIONS[2].label),
  };
}
