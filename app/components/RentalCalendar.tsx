import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";

import type { RentalCalendarEvent, RentalCalendarPayload } from "../lib/booking/rental-calendar.server";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const GRID_7: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};

type RentalCalendarProps = {
  calendar: RentalCalendarPayload;
  shop: string;
  filtersQuery: string;
};

function formatDisplayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusLabel(event: RentalCalendarEvent) {
  if (event.type === "block") {
    return "Blackout";
  }
  if (event.status === "confirmed") {
    return "Confirmed";
  }
  if (event.status === "pending") {
    return "Pending";
  }
  if (event.status === "cancelled") {
    return "Cancelled";
  }
  return event.status;
}

function statusTone(event: RentalCalendarEvent): "success" | "warning" | "critical" | "info" {
  if (event.type === "block") {
    return "warning";
  }
  if (event.status === "confirmed") {
    return "success";
  }
  if (event.status === "cancelled") {
    return "critical";
  }
  return "info";
}

function orderAdminUrl(shop: string, orderId: string) {
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/orders/${orderId}`;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <s-stack direction="block" gap="small-100">
      <s-text tone="neutral" color="subdued">
        {label}
      </s-text>
      <s-text>{children}</s-text>
    </s-stack>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12px",
        fontWeight: 550,
        color: "#616161",
      }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function EventPopover({
  event,
  shop,
  position,
  onClose,
}: {
  event: RentalCalendarEvent;
  shop: string;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const left = Math.min(position.x, window.innerWidth - 380);
  const top = Math.min(position.y, window.innerHeight - 420);

  return (
    <>
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30,
          border: 0,
          background: "transparent",
          cursor: "default",
        }}
      />
      <div
        style={{
          position: "fixed",
          left,
          top,
          zIndex: 31,
          width: "min(380px, calc(100% - 32px))",
          background: "#fff",
          border: "1px solid #dfe3e8",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
          overflow: "hidden",
        }}
      >
        <s-box padding="large" background="base">
          <s-stack direction="block" gap="large">
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-text type="strong">
                {event.type === "booking"
                  ? `Rental ${event.id.slice(0, 8)}`
                  : "Blackout period"}
              </s-text>
              <s-badge tone={statusTone(event)}>{statusLabel(event)}</s-badge>
            </s-stack>

            <s-divider />

            <DetailRow label="Garment">
              {event.label}
              {event.size ? ` · Size ${event.size}` : ""}
            </DetailRow>

            {event.deliveryMethod ? (
              <DetailRow label="Delivery method">{event.deliveryMethod}</DetailRow>
            ) : null}

            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <DetailRow label="Start date">{formatDisplayDate(event.startDate)}</DetailRow>
              <DetailRow label="End date">{formatDisplayDate(event.endDate)}</DetailRow>
            </s-grid>

            {event.type === "booking" &&
            (event.bufferBeforeDays > 0 || event.bufferAfterDays > 0) ? (
              <s-box padding="small" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="small-100">
                  <s-text type="strong">Turnaround buffers</s-text>
                  <s-text tone="neutral" color="subdued">
                    {event.bufferBeforeDays > 0
                      ? `${event.bufferBeforeDays} day(s) before hire`
                      : null}
                    {event.bufferBeforeDays > 0 && event.bufferAfterDays > 0 ? " · " : null}
                    {event.bufferAfterDays > 0
                      ? `${event.bufferAfterDays} day(s) after return`
                      : null}
                  </s-text>
                </s-stack>
              </s-box>
            ) : null}

            {event.reason ? <DetailRow label="Reason">{event.reason}</DetailRow> : null}

            {event.orderId ? (
              <DetailRow label="Order">
                <Link to={orderAdminUrl(shop, event.orderId)} target="_top">
                  #{event.orderId}
                </Link>
              </DetailRow>
            ) : null}

            <s-divider />

            <s-stack direction="block" gap="small-200">
              {event.type === "booking" ? (
                <s-link href={`/app/bookings/detail?bookingId=${event.id}`}>
                  Edit dates &amp; buffers
                </s-link>
              ) : null}
              {event.productId && event.variantId ? (
                <s-link
                  href={`/app/inventory/detail?productId=${event.productId}&variantId=${event.variantId}`}
                >
                  View garment details
                </s-link>
              ) : null}
            </s-stack>
          </s-stack>
        </s-box>
      </div>
    </>
  );
}

export function RentalCalendar({ calendar, shop, filtersQuery }: RentalCalendarProps) {
  const [selectedEvent, setSelectedEvent] = useState<RentalCalendarEvent | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });

  const querySuffix = filtersQuery ? `&${filtersQuery}` : "";

  const segmentsByWeek = useMemo(() => {
    const map = new Map<number, typeof calendar.segments>();
    for (const segment of calendar.segments) {
      const list = map.get(segment.weekIndex) ?? [];
      list.push(segment);
      map.set(segment.weekIndex, list);
    }
    return map;
  }, [calendar.segments]);

  function openPopover(event: RentalCalendarEvent, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    setPopoverPosition({ x: rect.left, y: rect.bottom + 8 });
    setSelectedEvent(event);
  }

  return (
    <div style={{ background: "#fff" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "28px",
          padding: "24px 28px",
          borderBottom: "1px solid #e1e3e5",
          background: "#fafbfb",
        }}
      >
        <s-stack direction="block" gap="small">
          <s-text type="strong">{calendar.monthLabel}</s-text>
          <s-text tone="neutral" color="subdued">
            {calendar.events.length} events this month
          </s-text>
        </s-stack>
        <s-stack direction="inline" gap="small">
          <Link
            to={`/app/bookings?year=${calendar.prev.year}&month=${calendar.prev.month}${querySuffix}`}
          >
            <s-button
              variant="tertiary"
              icon="chevron-left"
              accessibilityLabel="Previous month"
            >
              Previous
            </s-button>
          </Link>
          <Link to={`/app/bookings${filtersQuery ? `?${filtersQuery}` : ""}`}>
            <s-button variant="tertiary">Today</s-button>
          </Link>
          <Link
            to={`/app/bookings?year=${calendar.next.year}&month=${calendar.next.month}${querySuffix}`}
          >
            <s-button
              variant="tertiary"
              icon="chevron-right"
              accessibilityLabel="Next month"
            >
              Next
            </s-button>
          </Link>
        </s-stack>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "28px",
          padding: "18px 28px",
          borderBottom: "1px solid #e1e3e5",
          background: "#fff",
        }}
      >
        <LegendItem color="#008060" label="Confirmed hire" />
        <LegendItem color="#449da7" label="Pending" />
        <LegendItem color="#b98900" label="Blackout / try-on hold" />
      </div>

      <div
        style={{
          ...GRID_7,
          background: "#f6f6f7",
          borderBottom: "1px solid #e1e3e5",
        }}
      >
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            style={{
              padding: "16px 14px",
              textAlign: "center",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#616161",
            }}
          >
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
            style={{
              ...GRID_7,
              borderBottom: weekIndex === calendar.weeks.length - 1 ? "none" : "1px solid #edf0f2",
              position: "relative",
              minHeight,
            }}
          >
            {week.map((day, dayIndex) => (
              <div
                key={`${weekIndex}-${dayIndex}`}
                style={{
                  borderRight: dayIndex < 6 ? "1px solid #edf0f2" : "none",
                  padding: "14px 14px 12px",
                  minHeight: "108px",
                  background: day.iso ? "#fff" : "#fafbfb",
                }}
              >
                {day.dayNumber ? (
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 650,
                      color: "#202223",
                      marginBottom: "10px",
                      paddingLeft: "4px",
                    }}
                  >
                    {day.dayNumber}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 650,
                      color: "#b5b5b5",
                      marginBottom: "10px",
                      paddingLeft: "4px",
                    }}
                  >
                    {" "}
                  </div>
                )}
              </div>
            ))}

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "28px",
                bottom: "6px",
                ...GRID_7,
                gridAutoRows: "24px",
                gap: "2px 0",
                pointerEvents: "none",
                padding: "0 2px",
                minHeight: laneCount * 26,
              }}
            >
              {weekSegments.map((segment) => (
                <button
                  key={`${segment.event.id}-${weekIndex}-${segment.lane}`}
                  type="button"
                  style={{
                    pointerEvents: "auto",
                    margin: "0 2px",
                    height: "22px",
                    border: 0,
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                    textAlign: "left",
                    padding: "0 8px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    cursor: "pointer",
                    boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.12)",
                    gridColumn: `${segment.colStart} / ${segment.colEnd + 1}`,
                    gridRow: segment.lane + 1,
                    backgroundColor: segment.event.color,
                    backgroundImage:
                      segment.event.type === "block"
                        ? "repeating-linear-gradient(-45deg, rgba(255,255,255,0.14), rgba(255,255,255,0.14) 4px, transparent 4px, transparent 8px)"
                        : undefined,
                  }}
                  title={`${segment.event.label} · ${segment.event.sublabel}`}
                  onClick={(clickEvent) =>
                    openPopover(segment.event, clickEvent.currentTarget)
                  }
                >
                  {segment.event.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {calendar.events.length === 0 ? (
        <s-box padding="large" background="subdued">
          <s-stack direction="block" gap="base" alignItems="center">
            <s-icon type="calendar" />
            <s-text type="strong">No events this month</s-text>
            <s-text tone="neutral" color="subdued">
              Try another month or clear your filters.
            </s-text>
          </s-stack>
        </s-box>
      ) : null}

      {selectedEvent ? (
        <EventPopover
          event={selectedEvent}
          shop={shop}
          position={popoverPosition}
          onClose={() => setSelectedEvent(null)}
        />
      ) : null}
    </div>
  );
}
