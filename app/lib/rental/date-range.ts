import { toDateOnly } from "../booking/availability";
import type { RentalDatePreset } from "./rental.types";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfDayUtc(iso: string): Date {
  return toDateOnly(new Date(`${iso}T12:00:00.000Z`));
}

function endOfDayUtc(iso: string): Date {
  const date = startOfDayUtc(iso);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function startOfWeekMondayUtc(date: Date): Date {
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return toDateOnly(monday);
}

function rollingRangeFromToday(
  today: Date,
  daysInclusive: number,
  label: string,
): { from: Date; to: Date; label: string } {
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (daysInclusive - 1));
  return {
    from: startOfDayUtc(isoDate(from)),
    to: endOfDayUtc(isoDate(today)),
    label,
  };
}

export function resolveDatePresetRange(
  preset: RentalDatePreset,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const today = toDateOnly(now);

  if (preset === "custom" && customFrom && customTo) {
    return {
      from: startOfDayUtc(customFrom),
      to: endOfDayUtc(customTo),
      label: `${customFrom} – ${customTo}`,
    };
  }

  switch (preset) {
    case "today":
      return { from: startOfDayUtc(isoDate(today)), to: endOfDayUtc(isoDate(today)), label: "Today" };
    case "yesterday": {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      const iso = isoDate(y);
      return { from: startOfDayUtc(iso), to: endOfDayUtc(iso), label: "Yesterday" };
    }
    case "last7":
      return rollingRangeFromToday(today, 7, "Last 7 days");
    case "last30":
      return rollingRangeFromToday(today, 30, "Last 30 days");
    case "last60":
      return rollingRangeFromToday(today, 60, "Last 60 days");
    case "last90":
      return rollingRangeFromToday(today, 90, "Last 90 days");
    case "thisWeek": {
      const from = startOfWeekMondayUtc(today);
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "This week",
      };
    }
    case "lastWeek": {
      const thisMonday = startOfWeekMondayUtc(today);
      const from = new Date(thisMonday);
      from.setUTCDate(from.getUTCDate() - 7);
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 6);
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(to)),
        label: "Last week",
      };
    }
    case "thisMonth": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "This month to date",
      };
    }
    case "lastMonth": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(to)),
        label: "Last month",
      };
    }
    case "last6Months": {
      const from = new Date(today);
      from.setUTCMonth(from.getUTCMonth() - 6);
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "Last 6 months",
      };
    }
    case "last3Months":
    default: {
      const from = new Date(today);
      from.setUTCMonth(from.getUTCMonth() - 3);
      return {
        from: startOfDayUtc(isoDate(from)),
        to: endOfDayUtc(isoDate(today)),
        label: "Last 3 months",
      };
    }
  }
}
