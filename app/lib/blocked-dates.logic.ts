import {
  addDays,
  dateRangesOverlap,
  formatDateIso,
  toDateOnly,
} from "./booking/availability";

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

/** @deprecated Use hireWindowBlockedByRule for hire availability */
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

/**
 * Hire calendar: weekly rules block delivery/return/buffer edges on closed weekdays
 * (not every day the dress is at home during the hire).
 * Date ranges block delivery/return on closed days and any overlapping hire window.
 */
export function hireWindowBlockedByRule(
  deliveryDate: Date,
  returnDate: Date,
  effectiveStart: Date,
  effectiveEnd: Date,
  rule: BlockedDateRule,
): boolean {
  if (!ruleAppliesToScope(rule, "hire")) {
    return false;
  }

  const delivery = toDateOnly(deliveryDate);
  const returns = toDateOnly(returnDate);
  const effStart = toDateOnly(effectiveStart);
  const effEnd = toDateOnly(effectiveEnd);

  if (rule.blockKind === "weekly") {
    const checkpoints = [delivery, returns, effStart, effEnd];
    return checkpoints.some((d) => isDateBlockedByRule(d, rule, "hire"));
  }

  if (
    isDateBlockedByRule(delivery, rule, "hire") ||
    isDateBlockedByRule(returns, rule, "hire")
  ) {
    return true;
  }

  const closedStart = toDateOnly(rule.startDate);
  const closedEnd = toDateOnly(rule.endDate);

  return dateRangesOverlap(
    { start: effStart, end: effEnd },
    { start: closedStart, end: closedEnd },
  );
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

export const WEEKLY_BLOCK_VALID_FROM = "1970-01-01";
export const WEEKLY_BLOCK_VALID_UNTIL = "2099-12-31";