import { addDays, formatDateIso, toDateOnly } from "./booking/availability";

export type BlockKind = "range" | "weekly";
export type BlockScope = "hire" | "try_on";

export type BlockedDateRule = {
  blockKind: BlockKind;
  startDate: Date;
  endDate: Date;
  weekdayMask: number | null;
  appliesToHire: boolean;
  appliesToTryOn: boolean;
  productId?: string | null;
  variantId?: string | null;
  reason?: string | null;
};

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayBit(dayIndex: number): number {
  if (dayIndex < 0 || dayIndex > 6) return 0;
  return 1 << dayIndex;
}

export function parseWeekdayMaskFromForm(formData: FormData): number {
  let mask = 0;
  const values = formData.getAll("weekdays");
  for (const raw of values) {
    const day = Number(raw);
    if (Number.isInteger(day) && day >= 0 && day <= 6) {
      mask |= weekdayBit(day);
    }
  }
  return mask;
}

export function maskToWeekdayList(mask: number): number[] {
  const days: number[] = [];
  for (let d = 0; d <= 6; d += 1) {
    if ((mask & weekdayBit(d)) !== 0) {
      days.push(d);
    }
  }
  return days;
}

export function formatWeekdayMask(mask: number): string {
  const days = maskToWeekdayList(mask);
  if (!days.length) return "No days";
  return days.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

function isWithinValidity(date: Date, rule: BlockedDateRule): boolean {
  const d = toDateOnly(date).getTime();
  const start = toDateOnly(rule.startDate).getTime();
  const end = toDateOnly(rule.endDate).getTime();
  return d >= start && d <= end;
}

export function ruleAppliesToScope(
  rule: BlockedDateRule,
  scope: BlockScope,
): boolean {
  return scope === "hire" ? rule.appliesToHire : rule.appliesToTryOn;
}

export function isDateBlockedByRule(
  date: Date,
  rule: BlockedDateRule,
  scope: BlockScope,
): boolean {
  if (!ruleAppliesToScope(rule, scope)) {
    return false;
  }

  if (!isWithinValidity(date, rule)) {
    return false;
  }

  if (rule.blockKind === "weekly") {
    const mask = rule.weekdayMask ?? 0;
    if (mask === 0) return false;
    const day = toDateOnly(date).getUTCDay();
    return (mask & weekdayBit(day)) !== 0;
  }

  const d = toDateOnly(date).getTime();
  const start = toDateOnly(rule.startDate).getTime();
  const end = toDateOnly(rule.endDate).getTime();
  return d >= start && d <= end;
}

export function dateRangeOverlapsBlockedRule(
  rangeStart: Date,
  rangeEnd: Date,
  rule: BlockedDateRule,
  scope: BlockScope,
): boolean {
  if (!ruleAppliesToScope(rule, scope)) {
    return false;
  }

  let cursor = toDateOnly(rangeStart);
  const last = toDateOnly(rangeEnd);

  while (cursor.getTime() <= last.getTime()) {
    if (isDateBlockedByRule(cursor, rule, scope)) {
      return true;
    }
    cursor = addDays(cursor, 1);
  }

  return false;
}

export function expandRangeToIsoDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  let current = toDateOnly(start);
  const last = toDateOnly(end);

  while (current.getTime() <= last.getTime()) {
    dates.push(formatDateIso(current));
    current = addDays(current, 1);
  }

  return dates;
}

/** Expand shop-wide weekly hire blocks into ISO dates for buffer holiday sets. */
export function expandWeeklyHireHolidays(
  rules: BlockedDateRule[],
  from: Date,
  through: Date,
): string[] {
  const holidays: string[] = [];
  let cursor = toDateOnly(from);
  const last = toDateOnly(through);

  while (cursor.getTime() <= last.getTime()) {
    for (const rule of rules) {
      if (rule.blockKind !== "weekly") continue;
      if (rule.productId != null || rule.variantId != null) continue;
      if (isDateBlockedByRule(cursor, rule, "hire")) {
        holidays.push(formatDateIso(cursor));
        break;
      }
    }
    cursor = addDays(cursor, 1);
  }

  return holidays;
}

export const WEEKLY_BLOCK_VALID_FROM = "1970-01-01";
export const WEEKLY_BLOCK_VALID_UNTIL = "2099-12-31";