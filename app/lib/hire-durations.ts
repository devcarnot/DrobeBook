export type HireDurationOption = {
  days: number;
  label: string;
};

export const DEFAULT_HIRE_DURATIONS: HireDurationOption[] = [
  { days: 4, label: "4 Days" },
  { days: 8, label: "8 Days" },
];

export const MIN_HIRE_DURATION_DAYS = 1;
export const MAX_HIRE_DURATION_DAYS = 30;
export const MAX_HIRE_DURATION_OPTIONS = 6;

export function formatHireDurationLabel(days: number): string {
  return `${days} Day${days === 1 ? "" : "s"}`;
}

export function normalizeHireDurations(
  value: unknown,
  fallback: HireDurationOption[] = DEFAULT_HIRE_DURATIONS,
): HireDurationOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback.map((entry) => ({ ...entry }));
  }

  const seen = new Set<number>();
  const normalized: HireDurationOption[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const days = Number.parseInt(String((entry as HireDurationOption).days ?? ""), 10);
    if (
      !Number.isFinite(days) ||
      days < MIN_HIRE_DURATION_DAYS ||
      days > MAX_HIRE_DURATION_DAYS ||
      seen.has(days)
    ) {
      continue;
    }

    const rawLabel = String((entry as HireDurationOption).label ?? "").trim();
    normalized.push({
      days,
      label: rawLabel || formatHireDurationLabel(days),
    });
    seen.add(days);

    if (normalized.length >= MAX_HIRE_DURATION_OPTIONS) {
      break;
    }
  }

  return normalized.length > 0
    ? normalized
    : fallback.map((entry) => ({ ...entry }));
}

export function hireDurationsFromFormData(formData: FormData): HireDurationOption[] {
  const jsonValue = formData.get("hireDurations");
  if (typeof jsonValue === "string" && jsonValue.trim()) {
    try {
      return normalizeHireDurations(JSON.parse(jsonValue));
    } catch {
      return DEFAULT_HIRE_DURATIONS.map((entry) => ({ ...entry }));
    }
  }

  return DEFAULT_HIRE_DURATIONS.map((entry) => ({ ...entry }));
}

export function allowedHireDurationDays(
  durations: HireDurationOption[] = DEFAULT_HIRE_DURATIONS,
): number[] {
  return normalizeHireDurations(durations).map((entry) => entry.days);
}

export function parseAllowedHireDuration(
  value: string | null,
  allowedDays: number[] = allowedHireDurationDays(),
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || !allowedDays.includes(parsed)) {
    return null;
  }

  return parsed;
}
