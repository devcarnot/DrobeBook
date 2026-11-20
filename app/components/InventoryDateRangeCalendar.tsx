import { useEffect, useMemo, useRef, useState } from "react";

import { formatIsoDate, parseIsoDateOnly } from "../lib/booking/rental-calendar";
import { resolveDatePresetRange } from "../lib/rental/date-range";
import type { RentalDatePreset } from "../lib/rental/rental.types";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

const SIDEBAR_PRESETS: Array<{ preset: RentalDatePreset | "clear"; label: string }> = [
  { preset: "today", label: "Today" },
  { preset: "yesterday", label: "Yesterday" },
  { preset: "last7", label: "Last 7 days" },
  { preset: "last30", label: "Last 30 days" },
  { preset: "last60", label: "Last 60 days" },
  { preset: "last90", label: "Last 90 days" },
  { preset: "thisMonth", label: "This month" },
  { preset: "lastMonth", label: "Last month" },
  { preset: "clear", label: "Clear" },
];

function isoTodayUtc(): string {
  return formatIsoDate(new Date());
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

function formatMonthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatFieldDisplay(iso: string) {
  if (!iso) {
    return "";
  }
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function normalizeRange(from: string, to: string): { from: string; to: string } {
  if (!from || !to) {
    return { from, to };
  }
  return compareIso(from, to) <= 0 ? { from, to } : { from: to, to: from };
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

type InventoryDateRangeCalendarProps = {
  initialFrom: string;
  initialTo: string;
  onClear?: () => void;
};

export function InventoryDateRangeCalendar({
  initialFrom,
  initialTo,
  onClear,
}: InventoryDateRangeCalendarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [pickerOpen, setPickerOpen] = useState(false);
  const anchorIso = from || to || isoTodayUtc();
  const anchor = parseIsoDateOnly(anchorIso);
  const [year, setYear] = useState(anchor.getUTCFullYear());
  const [month, setMonth] = useState(anchor.getUTCMonth() + 1);

  const secondMonth = useMemo(() => shiftMonth(year, month, 1), [year, month]);

  const hasRange = Boolean(from && to);
  const datePreset = hasRange ? "custom" : "all";

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pickerOpen]);

  function openPicker() {
    const focusIso = from || to || isoTodayUtc();
    const parsed = parseIsoDateOnly(focusIso);
    setYear(parsed.getUTCFullYear());
    setMonth(parsed.getUTCMonth() + 1);
    setPickerOpen(true);
  }

  function applyPreset(preset: RentalDatePreset) {
    const range = resolveDatePresetRange(preset);
    const fromIso = formatIsoDate(range.from);
    const toIso = formatIsoDate(range.to);
    setFrom(fromIso);
    setTo(toIso);
    const focus = parseIsoDateOnly(fromIso);
    setYear(focus.getUTCFullYear());
    setMonth(focus.getUTCMonth() + 1);
    setPickerOpen(false);
  }

  function clearRange() {
    setFrom("");
    setTo("");
    setPickerOpen(false);
    onClear?.();
  }

  function handleDayClick(iso: string) {
    if (!from || (from && to)) {
      setFrom(iso);
      setTo("");
      return;
    }
    const next = normalizeRange(from, iso);
    setFrom(next.from);
    setTo(next.to);
    setPickerOpen(false);
  }

  return (
    <div ref={rootRef} className="gk-inventory-range-calendar">
      <input type="hidden" name="datePreset" value={datePreset} />
      <input type="hidden" name="dateFrom" value={from} />
      <input type="hidden" name="dateTo" value={to} />

      <div className="gk-inventory-date-range-inputs">
        <div className="gk-inventory-date-range-inputs__row">
          <label className="gk-inventory-date-range-inputs__label" htmlFor="inventory-date-from">
            From
          </label>
          <span className="gk-inventory-date-range-inputs__mid" aria-hidden="true" />
          <label className="gk-inventory-date-range-inputs__label" htmlFor="inventory-date-to">
            To
          </label>
        </div>
        <div className="gk-inventory-date-range-inputs__fields">
          <button
            id="inventory-date-from"
            type="button"
            className="gk-inventory-date-trigger"
            onClick={openPicker}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
          >
            <span className="gk-inventory-date-trigger__icon" aria-hidden="true">
              <CalendarIcon />
            </span>
            <span
              className={`gk-inventory-date-trigger__value${from ? "" : " gk-inventory-date-trigger__value--placeholder"}`}
            >
              {from ? formatFieldDisplay(from) : "Start date"}
            </span>
          </button>
          <span className="gk-inventory-date-arrow" aria-hidden="true">
            →
          </span>
          <button
            id="inventory-date-to"
            type="button"
            className="gk-inventory-date-trigger"
            onClick={openPicker}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
          >
            <span className="gk-inventory-date-trigger__icon" aria-hidden="true">
              <CalendarIcon />
            </span>
            <span
              className={`gk-inventory-date-trigger__value${to ? "" : " gk-inventory-date-trigger__value--placeholder"}`}
            >
              {to ? formatFieldDisplay(to) : "End date"}
            </span>
          </button>
        </div>

        {pickerOpen ? (
          <div className="gk-inventory-date-popover" role="dialog" aria-label="Choose date range">
            <aside className="gk-inventory-date-presets">
              {SIDEBAR_PRESETS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="gk-inventory-date-presets__item"
                  onClick={() =>
                    item.preset === "clear" ? clearRange() : applyPreset(item.preset)
                  }
                >
                  {item.label}
                </button>
              ))}
            </aside>
            <div className="gk-inventory-date-calendars">
              <div className="gk-inventory-date-calendars__nav">
                <button
                  type="button"
                  className="gk-inventory-range-nav"
                  aria-label="Previous month"
                  onClick={() => {
                    const next = shiftMonth(year, month, -1);
                    setYear(next.year);
                    setMonth(next.month);
                  }}
                >
                  ‹
                </button>
                <span className="gk-inventory-date-calendars__spacer" />
                <button
                  type="button"
                  className="gk-inventory-range-nav"
                  aria-label="Next month"
                  onClick={() => {
                    const next = shiftMonth(year, month, 1);
                    setYear(next.year);
                    setMonth(next.month);
                  }}
                >
                  ›
                </button>
              </div>
              <div className="gk-inventory-date-calendars__months">
                <MonthGrid
                  year={year}
                  month={month}
                  label={formatMonthLabel(year, month)}
                  from={from}
                  to={to}
                  onDayClick={handleDayClick}
                />
                <MonthGrid
                  year={secondMonth.year}
                  month={secondMonth.month}
                  label={formatMonthLabel(secondMonth.year, secondMonth.month)}
                  from={from}
                  to={to}
                  onDayClick={handleDayClick}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MonthGrid({
  year,
  month,
  label,
  from,
  to,
  onDayClick,
}: {
  year: number;
  month: number;
  label: string;
  from: string;
  to: string;
  onDayClick: (iso: string) => void;
}) {
  const cells = useMemo(() => {
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const result: Array<{ iso: string | null; day: number | null }> = [];
    for (let index = 0; index < mondayOffset; index += 1) {
      result.push({ iso: null, day: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      result.push({ iso, day });
    }
    return result;
  }, [month, year]);

  function dayClass(iso: string): string {
    const classes = ["gk-inventory-range-day"];
    const inRange =
      from && to && compareIso(iso, from) >= 0 && compareIso(iso, to) <= 0;
    const isStart = from === iso;
    const isEnd = to === iso;
    if (inRange) {
      classes.push("gk-inventory-range-day--in-range");
    }
    if (isStart) {
      classes.push("gk-inventory-range-day--start");
    }
    if (isEnd) {
      classes.push("gk-inventory-range-day--end");
    }
    if (isStart || isEnd) {
      classes.push("gk-inventory-range-day--selected");
    }
    return classes.join(" ");
  }

  return (
    <div className="gk-inventory-date-month">
      <div className="gk-inventory-range-month gk-inventory-date-month__title">{label}</div>
      <div className="gk-inventory-range-grid">
        {WEEKDAYS.map((day) => (
          <span key={day} className="gk-inventory-range-weekday">
            {day}
          </span>
        ))}
        {cells.map((cell, index) => {
          if (!cell.iso || cell.day == null) {
            return (
              <span
                key={`empty-${index}`}
                className="gk-inventory-range-day gk-inventory-range-day--empty"
                aria-hidden="true"
              />
            );
          }
          return (
            <button
              key={cell.iso}
              type="button"
              className={dayClass(cell.iso)}
              onClick={() => onDayClick(cell.iso!)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6 2v2M14 2v2M3.5 7h13M5 4.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V6A1.5 1.5 0 0 1 5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
