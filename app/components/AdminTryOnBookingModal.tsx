import { useCallback, useEffect, useMemo, useState } from "react";
import { Form } from "react-router";

import type { AppointmentConfig } from "../lib/shop-config";
import type { AppointmentSlotView } from "../lib/appointment/slots";

type DayType = "weekday" | "weekend";

type AdminTryOnBookingModalProps = {
  open: boolean;
  onClose: () => void;
  config: AppointmentConfig;
  productId: string;
  variantId: string;
  gownTitle: string;
  sizeLabel: string;
  isSubmitting: boolean;
};

type SelectedSlot = {
  time: string;
  endTime: string;
  label: string;
};

function formatDisplayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getDurationOptions(config: AppointmentConfig) {
  if (config.appointmentDurations?.length) {
    return config.appointmentDurations.map((entry) => ({
      minutes: entry.minutes,
      label: entry.label,
    }));
  }

  return [
    { minutes: 50, label: config.duration50Label },
    { minutes: 30, label: config.duration30Label },
    { minutes: 20, label: config.duration20Label },
  ];
}

function formatSlotOption(
  config: AppointmentConfig,
  slot: AppointmentSlotView,
): string {
  if (slot.available === 1) {
    return `${slot.label} / ${config.slotAvailableSingularText}`;
  }
  return `${slot.label} / ${config.slotAvailablePluralText.replace("{count}", String(slot.available))}`;
}

export function AdminTryOnBookingModal({
  open,
  onClose,
  config,
  productId,
  variantId,
  gownTitle,
  sizeLabel,
  isSubmitting,
}: AdminTryOnBookingModalProps) {
  const durationOptions = useMemo(() => getDurationOptions(config), [config]);
  const defaultDuration = durationOptions[0]?.minutes ?? 50;
  const defaultItems = [gownTitle, sizeLabel].filter(Boolean).join(" · ");

  const [step, setStep] = useState<"select" | "confirm">("select");
  const [dayType, setDayType] = useState<DayType>("weekday");
  const [durationMinutes, setDurationMinutes] = useState(defaultDuration);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getUTCFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getUTCMonth() + 1);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [slots, setSlots] = useState<AppointmentSlotView[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [specificItems, setSpecificItems] = useState(defaultItems);
  const [instagram, setInstagram] = useState("");
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState<Record<string, boolean>>({});

  const activeTerms = useMemo(
    () => (config.tryOnTerms ?? []).filter((entry) => entry.label?.trim()),
    [config.tryOnTerms],
  );

  const allTermsAccepted =
    activeTerms.length === 0 ||
    activeTerms.every((term, index) =>
      Boolean(acceptedTerms[term.id || `term-${index + 1}`]),
    );

  const canSelectTime = Boolean(selectedDate && selectedSlot);
  const canConfirm =
    customerName.trim().length > 0 &&
    availabilityChecked &&
    allTermsAccepted &&
    canSelectTime;

  const resetState = useCallback(() => {
    setStep("select");
    setDayType("weekday");
    setDurationMinutes(defaultDuration);
    const now = new Date();
    setCalendarYear(now.getUTCFullYear());
    setCalendarMonth(now.getUTCMonth() + 1);
    setSelectedDate("");
    setSelectedSlot(null);
    setUnavailableDates(new Set());
    setSlots([]);
    setError("");
    setCustomerName("");
    setCustomerEmail("");
    setEventDate("");
    setSpecificItems(defaultItems);
    setInstagram("");
    setAvailabilityChecked(false);
    setAcceptedTerms({});
  }, [defaultDuration, defaultItems]);

  const loadCalendar = useCallback(async () => {
    setLoadingCalendar(true);
    setError("");

    const params = new URLSearchParams({
      year: String(calendarYear),
      month: String(calendarMonth),
      dayType,
      durationMinutes: String(durationMinutes),
    });

    try {
      const response = await fetch(`/app/appointment-calendar?${params.toString()}`);
      const data = (await response.json()) as {
        unavailableDates?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not load calendar");
      }
      setUnavailableDates(new Set(data.unavailableDates ?? []));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load calendar",
      );
      setUnavailableDates(new Set());
    } finally {
      setLoadingCalendar(false);
    }
  }, [calendarYear, calendarMonth, dayType, durationMinutes]);

  const loadSlots = useCallback(async () => {
    if (!selectedDate) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }

    setLoadingSlots(true);
    setError("");

    const params = new URLSearchParams({
      date: selectedDate,
      durationMinutes: String(durationMinutes),
    });

    try {
      const response = await fetch(`/app/appointment-slots?${params.toString()}`);
      const data = (await response.json()) as {
        slots?: AppointmentSlotView[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not load time slots");
      }

      const nextSlots = (data.slots ?? []).filter((slot) => !slot.soldOut);
      setSlots(nextSlots);
      setSelectedSlot((current) => {
        if (current && nextSlots.some((slot) => slot.time === current.time)) {
          return current;
        }
        const first = nextSlots[0];
        return first
          ? { time: first.time, endTime: first.endTime, label: first.label }
          : null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load time slots",
      );
      setSlots([]);
      setSelectedSlot(null);
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedDate, durationMinutes]);

  useEffect(() => {
    if (!open) {
      return;
    }
    resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadCalendar();
  }, [open, loadCalendar]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadSlots();
  }, [open, loadSlots]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const monthLabel = new Date(
    Date.UTC(calendarYear, calendarMonth - 1, 1),
  ).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(
      Date.UTC(calendarYear, calendarMonth - 1, 1),
    ).getUTCDay();
    const daysInMonth = new Date(Date.UTC(calendarYear, calendarMonth, 0)).getUTCDate();
    const cells: Array<{ iso: string | null; day: number | null }> = [];

    for (let index = 0; index < firstWeekday; index += 1) {
      cells.push({ iso: null, day: null });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ iso, day });
    }

    return cells;
  }, [calendarYear, calendarMonth]);

  const dayLabel =
    dayType === "weekday" ? config.weekdayDayLabel : config.weekendDayLabel;
  const durationLabel =
    durationOptions.find((entry) => entry.minutes === durationMinutes)?.label ??
    `${durationMinutes} min`;

  if (!open) {
    return null;
  }

  return (
    <div className="gk-dialog-root">
      <button
        type="button"
        className="gk-dialog-backdrop"
        aria-label="Close book try-on appointment"
        onClick={onClose}
      />
      <div
        className="gk-dialog gk-dialog--wide gk-admin-tryon-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-try-on-title"
      >
        <div className="gk-dialog__header">
          <h2 id="admin-try-on-title" className="gk-dialog__title">
            Book try-on appointment
          </h2>
          <button
            type="button"
            className="gk-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="gk-dialog__body">
          <p className="gk-admin-tryon-intro">{config.introText}</p>

          {error ? <div className="gk-admin-tryon-error">{error}</div> : null}

          {step === "select" ? (
            <>
              <div className="gk-admin-tryon-group">
                <span className="gk-admin-tryon-label">{config.dayTypeLabel}</span>
                <div className="gk-admin-tryon-choices">
                  {(
                    [
                      { id: "weekday" as const, label: config.weekdayDayLabel },
                      { id: "weekend" as const, label: config.weekendDayLabel },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`gk-admin-tryon-choice${dayType === option.id ? " gk-admin-tryon-choice--selected" : ""}`}
                      onClick={() => {
                        setDayType(option.id);
                        setSelectedDate("");
                        setSelectedSlot(null);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="gk-admin-tryon-group">
                <span className="gk-admin-tryon-label">{config.durationTypeLabel}</span>
                <div className="gk-admin-tryon-choices gk-admin-tryon-choices--stack">
                  {durationOptions.map((option) => (
                    <button
                      key={option.minutes}
                      type="button"
                      className={`gk-admin-tryon-choice${durationMinutes === option.minutes ? " gk-admin-tryon-choice--selected" : ""}`}
                      onClick={() => {
                        setDurationMinutes(option.minutes);
                        setSelectedDate("");
                        setSelectedSlot(null);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="gk-admin-tryon-calendar">
                <div className="gk-admin-tryon-calendar-header">
                  <button
                    type="button"
                    className="gk-admin-tryon-nav"
                    aria-label="Previous month"
                    onClick={() => {
                      const date = new Date(
                        Date.UTC(calendarYear, calendarMonth - 1 - 1, 1),
                      );
                      setCalendarYear(date.getUTCFullYear());
                      setCalendarMonth(date.getUTCMonth() + 1);
                    }}
                  >
                    ‹
                  </button>
                  <strong>{monthLabel}</strong>
                  <button
                    type="button"
                    className="gk-admin-tryon-nav"
                    aria-label="Next month"
                    onClick={() => {
                      const date = new Date(
                        Date.UTC(calendarYear, calendarMonth - 1 + 1, 1),
                      );
                      setCalendarYear(date.getUTCFullYear());
                      setCalendarMonth(date.getUTCMonth() + 1);
                    }}
                  >
                    ›
                  </button>
                </div>

                {loadingCalendar ? (
                  <p className="gk-admin-tryon-loading">{config.loadingCalendarText}</p>
                ) : null}

                <div className="gk-admin-tryon-calendar-grid">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                    <span key={day} className="gk-admin-tryon-weekday">
                      {day}
                    </span>
                  ))}
                  {calendarCells.map((cell, index) => {
                    if (!cell.iso || cell.day == null) {
                      return (
                        <span
                          key={`empty-${index}`}
                          className="gk-admin-tryon-day gk-admin-tryon-day--empty"
                        />
                      );
                    }

                    const unavailable = unavailableDates.has(cell.iso);
                    const selected = selectedDate === cell.iso;

                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        disabled={unavailable}
                        className={`gk-admin-tryon-day${unavailable ? " gk-admin-tryon-day--unavailable" : ""}${selected ? " gk-admin-tryon-day--selected" : ""}`}
                        onClick={() => {
                          setSelectedDate(cell.iso!);
                          setSelectedSlot(null);
                        }}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDate ? (
                <div className="gk-admin-tryon-group">
                  <label className="gk-admin-tryon-label" htmlFor="admin-tryon-slot">
                    {config.timeSlotLabel}
                  </label>
                  <select
                    id="admin-tryon-slot"
                    className="gk-admin-tryon-select"
                    value={selectedSlot?.time ?? ""}
                    disabled={loadingSlots || slots.length === 0}
                    onChange={(event) => {
                      const slot = slots.find(
                        (entry) => entry.time === event.currentTarget.value,
                      );
                      setSelectedSlot(
                        slot
                          ? {
                              time: slot.time,
                              endTime: slot.endTime,
                              label: slot.label,
                            }
                          : null,
                      );
                    }}
                  >
                    <option value="">
                      {loadingSlots
                        ? config.slotLoadingText
                        : slots.length
                          ? config.slotPlaceholder
                          : config.slotSoldOutText}
                    </option>
                    {slots.map((slot) => (
                      <option key={slot.time} value={slot.time}>
                        {formatSlotOption(config, slot)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="gk-admin-tryon-price-row">
                <span>{config.priceLabel}</span>
                <strong>{formatMoney(config.tryOnPriceCents)}</strong>
              </div>

              <div className="gk-admin-tryon-timezone">{config.timezoneLabel}</div>

              <div className="gk-dialog__footer">
                <s-button type="button" variant="tertiary" onClick={onClose}>
                  Cancel
                </s-button>
                <s-button
                  type="button"
                  variant="primary"
                  disabled={!canSelectTime}
                  onClick={() => setStep("confirm")}
                >
                  {config.selectTimeLabel}
                </s-button>
              </div>
            </>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="book-try-on" />
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="variantId" value={variantId} />
              <input type="hidden" name="dayType" value={dayType} />
              <input type="hidden" name="durationMinutes" value={String(durationMinutes)} />
              <input type="hidden" name="appointmentDate" value={selectedDate} />
              <input type="hidden" name="appointmentTime" value={selectedSlot?.time ?? ""} />
              <input type="hidden" name="appointmentTimeLabel" value={selectedSlot?.label ?? ""} />

              <button
                type="button"
                className="gk-admin-tryon-back"
                onClick={() => setStep("select")}
              >
                ← {config.backLabel}
              </button>

              <p className="gk-admin-tryon-confirm-title">{config.confirmTitle}</p>
              <p className="gk-admin-tryon-confirm-sub">{config.confirmSubtitle}</p>

              <div className="gk-admin-tryon-summary">
                <span aria-hidden="true">📅</span>
                <div>
                  <strong>
                    {config.tryOnProductTitle || "Try On Appointment"} / {dayLabel} /{" "}
                    {durationLabel}
                  </strong>
                  <p>
                    {formatDisplayDate(selectedDate)} {selectedSlot?.label}
                  </p>
                </div>
                <strong>{formatMoney(config.tryOnPriceCents)}</strong>
              </div>

              <div className="gk-admin-tryon-group">
                <h3 className="gk-admin-tryon-section-title">{config.additionalInfoTitle}</h3>
                <div className="gk-admin-tryon-fields">
                  <s-text-field
                    label="Customer name"
                    name="customerName"
                    value={customerName}
                    required
                    onChange={(event) => setCustomerName(event.currentTarget.value)}
                  />
                  <s-text-field
                    label="Customer email"
                    name="customerEmail"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.currentTarget.value)}
                  />
                  <s-date-field
                    label={config.eventDateLabel}
                    name="eventDate"
                    value={eventDate}
                    onChange={(event) => setEventDate(event.currentTarget.value)}
                  />
                  <s-text-field
                    label={config.specificItemsLabel}
                    name="itemsToTryOn"
                    value={specificItems}
                    placeholder={config.specificItemsPlaceholder}
                    onChange={(event) => setSpecificItems(event.currentTarget.value)}
                  />
                  <s-text-field
                    label={config.instagramLabel}
                    name="instagram"
                    value={instagram}
                    placeholder="@yourhandle"
                    onChange={(event) => setInstagram(event.currentTarget.value)}
                  />
                </div>

                <p className="gk-admin-tryon-note">{config.availabilityNote}</p>
                <label className="gk-admin-tryon-checkbox">
                  <input
                    type="checkbox"
                    name="availabilityChecked"
                    value="true"
                    checked={availabilityChecked}
                    onChange={(event) => setAvailabilityChecked(event.currentTarget.checked)}
                  />
                  <span>{config.availabilityCheckboxLabel}</span>
                </label>

                {activeTerms.length > 0 ? (
                  <div className="gk-admin-tryon-terms">
                    {activeTerms.map((term, index) => {
                      const termId = term.id || `term-${index + 1}`;
                      return (
                        <label key={termId} className="gk-admin-tryon-checkbox">
                          <input
                            type="checkbox"
                            name={`term_${termId}`}
                            value="true"
                            checked={Boolean(acceptedTerms[termId])}
                            onChange={(event) =>
                              setAcceptedTerms((current) => ({
                                ...current,
                                [termId]: event.currentTarget.checked,
                              }))
                            }
                          />
                          <span>{term.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="gk-admin-tryon-price-row">
                <span>{config.priceLabel}</span>
                <strong>{formatMoney(config.tryOnPriceCents)}</strong>
              </div>

              <div className="gk-dialog__footer">
                <s-button type="button" variant="tertiary" onClick={() => setStep("select")}>
                  Back
                </s-button>
                <s-button
                  type="submit"
                  variant="primary"
                  disabled={!canConfirm}
                  {...(isSubmitting ? { loading: true } : {})}
                >
                  Confirm booking
                </s-button>
              </div>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
