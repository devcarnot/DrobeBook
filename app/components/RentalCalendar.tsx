import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import type {
  RentalCalendarEvent,
  RentalCalendarPayload,
} from "../lib/booking/rental-calendar.server";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type RentalCalendarProps = {
  calendar: RentalCalendarPayload;
  shop: string;
  filtersQuery: string;
};

function formatDisplayDate(iso: string, style: "short" | "long" = "long") {
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (style === "short") {
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function rentalDayCount(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T12:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

function eventCategoryLabel(event: RentalCalendarEvent) {
  if (event.type === "appointment") {
    return "Try-on appointment";
  }
  if (event.type === "appointment_hold") {
    return "Try-on hold";
  }
  if (event.type === "block") {
    return "Blackout period";
  }
  return "Gown hire";
}

function formatAppointmentTime(time: string) {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number.parseInt(hoursRaw ?? "0", 10) || 0;
  const minutes = Number.parseInt(minutesRaw ?? "0", 10) || 0;
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minuteText = minutes ? `:${String(minutes).padStart(2, "0")}` : "";
  return `${hour12}${minuteText} ${period}`;
}

function formatChangeRoomLabel(changeRoomId: string | null) {
  if (!changeRoomId) {
    return null;
  }

  const match = changeRoomId.match(/^room-(\d+)$/i);
  if (match) {
    return `Change room ${match[1]}`;
  }

  return changeRoomId;
}

function statusLabel(event: RentalCalendarEvent) {
  if (event.type === "block") {
    return "Blackout";
  }
  if (event.type === "appointment") {
    return "Confirmed try-on";
  }
  if (event.type === "appointment_hold") {
    return "Checkout hold";
  }
  if (event.status === "confirmed") {
    return "Confirmed";
  }
  if (event.status === "pending") {
    return "Pending checkout";
  }
  if (event.status === "cancelled") {
    return "Cancelled";
  }
  return event.status;
}

function statusDescription(event: RentalCalendarEvent) {
  if (event.type === "block") {
    return event.productId
      ? "This garment is blocked for overlapping rental dates."
      : "Customers cannot start delivery on this date (hire may still run through blocked weekdays in between).";
  }
  if (event.type === "appointment") {
    return "Customer booked a try-on appointment — see time, room, and requested items below.";
  }
  if (event.type === "appointment_hold") {
    return "A customer reserved this slot and is completing checkout. The hold expires in about 15 minutes.";
  }
  if (event.status === "confirmed") {
    return "Paid hire — garment is reserved for the customer.";
  }
  if (event.status === "pending") {
    return "Customer added to cart — awaiting checkout to confirm.";
  }
  if (event.status === "cancelled") {
    return "This booking was cancelled.";
  }
  return "";
}

function statusTone(
  event: RentalCalendarEvent,
): "success" | "warning" | "critical" | "info" {
  if (event.type === "block" || event.type === "appointment_hold") {
    return "warning";
  }
  if (event.type === "appointment" || event.status === "confirmed") {
    return "success";
  }
  if (event.status === "cancelled") {
    return "critical";
  }
  return "info";
}

function deliveryLabel(method: string | null) {
  if (!method) {
    return null;
  }
  if (method === "post") {
    return "Post delivery";
  }
  if (method === "pickup") {
    return "Store pickup";
  }
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function orderAdminUrl(shop: string, orderId: string) {
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/orders/${orderId}`;
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="gk-rental-calendar__legend-item">
      <span
        className="gk-rental-calendar__legend-swatch"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function InfoTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#f6f6f7",
        borderRadius: "10px",
        border: "1px solid #e3e5e7",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 650,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#6d7175",
          marginBottom: "6px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "15px", fontWeight: 600, color: "#202223", wordBreak: "break-word" }}>
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function EventDetailPanel({
  event,
  shop,
  onClose,
}: {
  event: RentalCalendarEvent;
  shop: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const isAppointment =
    event.type === "appointment" || event.type === "appointment_hold";
  const hireDays = rentalDayCount(event.startDate, event.endDate);
  const blockedDays = rentalDayCount(event.displayStartDate, event.displayEndDate);
  const hasBufferSpan =
    event.type === "booking" &&
    (event.displayStartDate !== event.startDate ||
      event.displayEndDate !== event.endDate);
  const appointmentTimeLabel = event.appointmentTime
    ? formatAppointmentTime(event.appointmentTime)
    : null;
  const changeRoomLabel = formatChangeRoomLabel(event.changeRoomId);

  useEffect(() => {
    function handleKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const panel = (
    <>
      <button
        type="button"
        aria-label="Close booking details"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 520,
          border: 0,
          background: "rgba(17, 24, 39, 0.28)",
          cursor: "pointer",
        }}
      />
      <aside
        className="gk-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Booking details"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 521,
          width: "min(420px, 100vw)",
          maxWidth: "100vw",
          background: "#fff",
          boxShadow: "-12px 0 40px rgba(0, 0, 0, 0.14)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxSizing: "border-box",
          animation: "gk-slide-in 180ms ease-out",
        }}
      >
        <style>{`
          @keyframes gk-slide-in {
            from { transform: translateX(100%); opacity: 0.6; }
            to { transform: translateX(0); opacity: 1; }
          }
          .gk-detail-panel s-button {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }
        `}</style>

        <div
          style={{
            height: "6px",
            background: event.color,
            flexShrink: 0,
          }}
        />

        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid #e3e5e7",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 650,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#6d7175",
                  marginBottom: "6px",
                }}
              >
                {eventCategoryLabel(event)}
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#202223",
                  lineHeight: 1.25,
                  wordBreak: "break-word",
                }}
              >
                {event.label}
              </div>
              {isAppointment && appointmentTimeLabel ? (
                <div
                  style={{
                    display: "inline-block",
                    marginTop: "10px",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    background: "#fff4e5",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#7a4d00",
                  }}
                >
                  {appointmentTimeLabel}
                  {event.durationMinutes
                    ? ` · ${event.durationMinutes} min`
                    : ""}
                </div>
              ) : null}
              {event.size ? (
                <div
                  style={{
                    display: "inline-block",
                    marginTop: "10px",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    background: "#f1f2f3",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#44474a",
                  }}
                >
                  Size {event.size}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                border: "1px solid #e3e5e7",
                background: "#fff",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
                color: "#6d7175",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: "14px" }}>
            <s-badge tone={statusTone(event)}>{statusLabel(event)}</s-badge>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: "13px",
                lineHeight: 1.5,
                color: "#6d7175",
              }}
            >
              {statusDescription(event)}
            </p>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            minWidth: 0,
          }}
        >
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt=""
              style={{
                width: "100%",
                height: "180px",
                objectFit: "cover",
                borderRadius: "12px",
                border: "1px solid #e3e5e7",
              }}
            />
          ) : null}

          {isAppointment ? (
            <div
              style={{
                padding: "18px",
                borderRadius: "12px",
                border: "1px solid #dfe3e8",
                background: "linear-gradient(180deg, #fffaf5 0%, #fff 100%)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 650,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#6d7175",
                  marginBottom: "12px",
                }}
              >
                Appointment date
              </div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 650,
                  color: "#202223",
                  wordBreak: "break-word",
                }}
              >
                {formatDisplayDate(event.startDate)}
              </div>
              {appointmentTimeLabel ? (
                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "13px",
                    color: "#44474a",
                  }}
                >
                  <strong>{appointmentTimeLabel}</strong>
                  {event.durationMinutes
                    ? ` · ${event.durationMinutes} minutes`
                    : ""}
                </div>
              ) : null}
            </div>
          ) : event.type === "block" ? (
            <div
              style={{
                padding: "18px",
                borderRadius: "12px",
                border: "1px solid #dfe3e8",
                background: "linear-gradient(180deg, #fafbfb 0%, #fff 100%)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 650,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#6d7175",
                  marginBottom: "12px",
                }}
              >
                Blocked delivery start
              </div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 650,
                  color: "#202223",
                  wordBreak: "break-word",
                }}
              >
                {event.startDate === event.endDate
                  ? formatDisplayDate(event.startDate)
                  : `${formatDisplayDate(event.startDate, "short")} – ${formatDisplayDate(event.endDate, "short")}`}
              </div>
              <div
                style={{
                  marginTop: "10px",
                  fontSize: "13px",
                  color: "#44474a",
                }}
              >
                {event.sublabel}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "18px",
                borderRadius: "12px",
                border: "1px solid #dfe3e8",
                background: "linear-gradient(180deg, #fafbfb 0%, #fff 100%)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 650,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#6d7175",
                  marginBottom: "12px",
                }}
              >
                Hire dates
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "12px", color: "#6d7175" }}>From</div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 650,
                      color: "#202223",
                      wordBreak: "break-word",
                    }}
                  >
                    {formatDisplayDate(event.startDate, "short")}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#8c9196",
                      wordBreak: "break-word",
                    }}
                  >
                    {formatDisplayDate(event.startDate)}
                  </div>
                </div>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: "#eef0f2",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "14px",
                    color: "#6d7175",
                    flexShrink: 0,
                  }}
                >
                  →
                </div>
                <div style={{ textAlign: "right", minWidth: 0 }}>
                  <div style={{ fontSize: "12px", color: "#6d7175" }}>To</div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 650,
                      color: "#202223",
                      wordBreak: "break-word",
                    }}
                  >
                    {formatDisplayDate(event.endDate, "short")}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#8c9196",
                      wordBreak: "break-word",
                    }}
                  >
                    {formatDisplayDate(event.endDate)}
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: "14px",
                  paddingTop: "14px",
                  borderTop: "1px solid #e3e5e7",
                  fontSize: "13px",
                  color: "#44474a",
                }}
              >
                <strong>{hireDays}</strong> day{hireDays === 1 ? "" : "s"} hire
              </div>
            </div>
          )}

          {hasBufferSpan ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                background: "#f0f4ff",
                border: "1px solid #c9d4f0",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 650, color: "#1f3d7a" }}>
                Calendar blocked period
              </div>
              <div style={{ fontSize: "13px", color: "#3d4f6f", marginTop: "6px", wordBreak: "break-word" }}>
                {formatDisplayDate(event.displayStartDate, "short")} –{" "}
                {formatDisplayDate(event.displayEndDate, "short")} ({blockedDays}{" "}
                days including turnaround buffers)
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "12px",
              minWidth: 0,
            }}
          >
            {event.customerName ? (
              <InfoTile label="Customer" value={event.customerName} />
            ) : null}
            {event.itemsToTryOn ? (
              <InfoTile label="Style & size requested" value={event.itemsToTryOn} />
            ) : null}
            {changeRoomLabel ? (
              <InfoTile label="Change room" value={changeRoomLabel} />
            ) : null}
            {event.deliveryMethod ? (
              <InfoTile
                label="Delivery"
                value={deliveryLabel(event.deliveryMethod) ?? event.deliveryMethod}
              />
            ) : null}
            {event.orderId && !event.orderId.startsWith("admin-") ? (
              <InfoTile label="Shopify order" value={`#${event.orderId}`} />
            ) : null}
            {event.orderId?.startsWith("admin-") ? (
              <InfoTile label="Booked by" value="Admin in-store booking" />
            ) : null}
          </div>

          {event.type === "booking" &&
          (event.bufferBeforeDays > 0 || event.bufferAfterDays > 0) ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                background: "#fff8e6",
                border: "1px solid #f0dca8",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 650, color: "#7a5b00" }}>
                Turnaround buffers
              </div>
              <ul
                style={{
                  margin: "8px 0 0",
                  paddingLeft: "18px",
                  fontSize: "13px",
                  color: "#6d5a20",
                  lineHeight: 1.6,
                }}
              >
                {event.bufferBeforeDays > 0 ? (
                  <li>
                    {event.bufferBeforeDays} day
                    {event.bufferBeforeDays === 1 ? "" : "s"} before hire
                  </li>
                ) : null}
                {event.bufferAfterDays > 0 ? (
                  <li>
                    {event.bufferAfterDays} day
                    {event.bufferAfterDays === 1 ? "" : "s"} after return
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {event.reason ? (
            <InfoTile label="Reason" value={event.reason} />
          ) : null}
        </div>

        <div
          style={{
            padding: "16px 20px 20px",
            borderTop: "1px solid #e3e5e7",
            background: "#fafbfb",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            flexShrink: 0,
            minWidth: 0,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {event.type === "booking" ? (
            <div style={{ width: "100%", minWidth: 0 }}>
              <s-button
                variant="primary"
                onClick={() => {
                  onClose();
                  navigate(`/app/bookings/detail?bookingId=${event.id}`);
                }}
              >
                Edit dates &amp; buffers
              </s-button>
            </div>
          ) : null}
          {event.orderId && !event.orderId.startsWith("admin-") ? (
            <div style={{ width: "100%", minWidth: 0 }}>
              <s-button
                variant="secondary"
                onClick={() => {
                  window.open(orderAdminUrl(shop, event.orderId!), "_top");
                }}
              >
                Open Shopify order
              </s-button>
            </div>
          ) : null}
          {event.productId && event.variantId ? (
            <div style={{ width: "100%", minWidth: 0 }}>
              <s-button
                variant="tertiary"
                onClick={() => {
                  onClose();
                  navigate(
                    `/app/inventory/detail?productId=${event.productId}&variantId=${event.variantId}`,
                  );
                }}
              >
                View garment in inventory
              </s-button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );

  return createPortal(panel, document.body);
}

export function RentalCalendar({ calendar, shop, filtersQuery }: RentalCalendarProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const navigate = useNavigate();

  const querySuffix = filtersQuery ? `&${filtersQuery}` : "";

  const selectedEvent = useMemo(
    () => calendar.events.find((event) => event.id === selectedEventId) ?? null,
    [calendar.events, selectedEventId],
  );

  const segmentsByWeek = useMemo(() => {
    const map = new Map<number, typeof calendar.segments>();
    for (const segment of calendar.segments) {
      const list = map.get(segment.weekIndex) ?? [];
      list.push(segment);
      map.set(segment.weekIndex, list);
    }
    return map;
  }, [calendar.segments]);

  return (
    <div className="gk-rental-calendar">
      <header className="gk-rental-calendar__header">
        <div>
          <h2 className="gk-rental-calendar__month">{calendar.monthLabel}</h2>
          <p className="gk-rental-calendar__sub">
            {calendar.events.length} event{calendar.events.length === 1 ? "" : "s"} this month
          </p>
        </div>
        <div className="gk-rental-calendar__nav">
          <s-button
            variant="tertiary"
            icon="chevron-left"
            accessibilityLabel="Previous month"
            onClick={() =>
              navigate(
                `/app/bookings?year=${calendar.prev.year}&month=${calendar.prev.month}${querySuffix}`,
              )
            }
          >
            Previous
          </s-button>
          <s-button
            variant="tertiary"
            onClick={() =>
              navigate(`/app/bookings${filtersQuery ? `?${filtersQuery}` : ""}`)
            }
          >
            Today
          </s-button>
          <s-button
            variant="tertiary"
            icon="chevron-right"
            accessibilityLabel="Next month"
            onClick={() =>
              navigate(
                `/app/bookings?year=${calendar.next.year}&month=${calendar.next.month}${querySuffix}`,
              )
            }
          >
            Next
          </s-button>
        </div>
      </header>

      <div className="gk-rental-calendar__legend">
        <LegendItem color="#008060" label="Confirmed hire" />
        <LegendItem color="#449da7" label="Pending hire" />
        <LegendItem color="#e67700" label="Try-on appointment" />
        <LegendItem color="#f4a261" label="Try-on checkout hold" />
        <LegendItem color="#b98900" label="Blackout" />
      </div>

      <div className="gk-rental-calendar__weekdays">
        {WEEKDAYS.map((day) => (
          <div key={day} className="gk-rental-calendar__weekday">
            {day}
          </div>
        ))}
      </div>

      {calendar.weeks.map((week, weekIndex) => {
        const laneCount = calendar.laneCountByWeek[weekIndex] ?? 1;
        const minHeight = 28 + laneCount * 26;
        const weekSegments = segmentsByWeek.get(weekIndex) ?? [];

        return (
          <div
            key={`week-${weekIndex}`}
            className="gk-rental-calendar__week"
            style={{ minHeight }}
          >
            {week.map((day, dayIndex) => (
              <div
                key={`${weekIndex}-${dayIndex}`}
                className={`gk-rental-calendar__day${day.iso ? "" : " gk-rental-calendar__day--muted"}`}
              >
                {day.dayNumber ? (
                  <div className="gk-rental-calendar__day-num">{day.dayNumber}</div>
                ) : (
                  <div className="gk-rental-calendar__day-num gk-rental-calendar__day-num--empty">
                    —
                  </div>
                )}
              </div>
            ))}

            <div
              className="gk-rental-calendar__lanes"
              style={{ minHeight: laneCount * 26 }}
            >
              {weekSegments.map((segment) => {
                const isSelected = segment.event.id === selectedEventId;
                const isPattern =
                  segment.event.type === "block" ||
                  segment.event.type === "appointment_hold";
                return (
                  <button
                    key={`${segment.event.id}-${weekIndex}-${segment.lane}`}
                    type="button"
                    className={`gk-rental-calendar__bar${isSelected ? " gk-rental-calendar__bar--selected" : ""}${isPattern ? " gk-rental-calendar__bar--pattern" : ""}`}
                    style={{
                      gridColumn: `${segment.colStart} / ${segment.colEnd + 1}`,
                      gridRow: segment.lane + 1,
                      backgroundColor: segment.event.color,
                    }}
                    title={`${segment.event.label} · ${segment.event.sublabel}`}
                    onClick={() => setSelectedEventId(segment.event.id)}
                  >
                    {segment.event.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {calendar.events.length === 0 ? (
        <div className="gk-rental-calendar__empty">
          <s-stack direction="block" gap="base" alignItems="center">
            <s-icon type="calendar" />
            <s-text type="strong">No events this month</s-text>
            <s-text tone="neutral" color="subdued">
              Try another month or clear your filters.
            </s-text>
          </s-stack>
        </div>
      ) : null}

      {selectedEvent ? (
        <EventDetailPanel
          event={selectedEvent}
          shop={shop}
          onClose={() => setSelectedEventId(null)}
        />
      ) : null}
    </div>
  );
}
