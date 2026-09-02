import type { CSSProperties, ReactNode } from "react";

import type { AppointmentConfig } from "../lib/shop-config";
import {
  calendarDayStyle,
  calendarGridStyle,
  calendarHeaderStyle,
  inputFieldStyle,
  mutedTextStyle,
  previewPanelStyle,
  previewStepDividerStyle,
  previewThemeStyle,
  priceRowStyle,
  primaryButtonStyle,
  selectFieldStyle,
  tryOnCalendarNavStyle,
  tryOnChoiceColumnStyle,
  tryOnChoiceRowStyle,
  tryOnChoiceStyle,
  tryOnLabelStyle,
  tryOnWidgetShellStyle,
  tryOnWeekdayStyle,
  widgetGroupStyle,
} from "../lib/widget-preview-styles";
import type { WidgetColorScheme } from "../lib/widget-colors";
import { DEFAULT_WIDGET_COLORS } from "../lib/widget-colors";

function formatSlotLabel(
  config: AppointmentConfig,
  slotLabel: string,
  capacity: number,
): string {
  if (capacity === 1) {
    return `${slotLabel} / ${config.slotAvailableSingularText}`;
  }
  return `${slotLabel} / ${config.slotAvailablePluralText.replace("{count}", String(capacity))}`;
}

function PreviewFrame({
  themeStyle,
  children,
}: {
  themeStyle: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div style={{ minWidth: 0, maxWidth: "100%", width: "100%" }}>
      <s-box padding="large" background="base" border="base" borderRadius="large">
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-icon type="view" />
            <s-text type="strong">Try-on preview</s-text>
          </s-stack>
          <s-paragraph tone="neutral" color="subdued">
            Matches the storefront try-on widget layout and your color scheme.
          </s-paragraph>
        </s-stack>

        <div style={{ ...themeStyle, ...tryOnWidgetShellStyle(), ...previewPanelStyle() }}>
          {children}
        </div>
      </s-stack>
    </s-box>
    </div>
  );
}

export function TryOnWidgetPreview({
  config,
  colors = DEFAULT_WIDGET_COLORS,
}: {
  config: AppointmentConfig;
  colors?: WidgetColorScheme;
}) {
  const themeStyle = previewThemeStyle(colors);
  const sampleSlot = formatSlotLabel(config, "10:00 AM - 10:50 AM", config.capacity50);

  return (
    <PreviewFrame themeStyle={themeStyle}>
      <p
        style={{
          textAlign: "left",
          fontSize: "1rem",
          fontWeight: 600,
          margin: "0 0 1.25rem",
          color: "var(--gk-choice-text, #111111)",
        }}
      >
        {config.introText}
      </p>

      <div style={widgetGroupStyle()}>
        <span style={tryOnLabelStyle()}>{config.dayTypeLabel}</span>
        <div style={tryOnChoiceRowStyle()}>
          <span style={tryOnChoiceStyle(true)}>{config.weekdayDayLabel}</span>
          <span style={tryOnChoiceStyle()}>{config.weekendDayLabel}</span>
        </div>
      </div>

      <div style={widgetGroupStyle()}>
        <span style={tryOnLabelStyle()}>{config.durationTypeLabel}</span>
        <div style={tryOnChoiceColumnStyle()}>
          <span style={tryOnChoiceStyle(true, true)}>{config.duration50Label}</span>
          <span style={tryOnChoiceStyle(false, true)}>{config.duration20Label}</span>
        </div>
      </div>

      <div style={{ margin: "1rem 0", width: "100%", maxWidth: "100%", minWidth: 0 }}>
        <div style={calendarHeaderStyle()}>
          <span style={tryOnCalendarNavStyle()} aria-hidden="true">
            ‹
          </span>
          <strong>September 2026</strong>
          <span style={tryOnCalendarNavStyle()} aria-hidden="true">
            ›
          </span>
        </div>
        <div style={calendarGridStyle("0.15rem")}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <span key={day} style={tryOnWeekdayStyle()}>
              {day}
            </span>
          ))}
          <span style={calendarDayStyle("empty")}> </span>
          <span style={calendarDayStyle("empty")}> </span>
          <span style={calendarDayStyle("tryon-unavailable")}>1</span>
          <span style={calendarDayStyle("tryon-unavailable")}>2</span>
          <span style={calendarDayStyle("tryon-unavailable")}>3</span>
          <span style={calendarDayStyle("tryon-unavailable")}>4</span>
          <span style={calendarDayStyle("tryon-unavailable")}>5</span>
          <span style={calendarDayStyle("tryon-unavailable")}>6</span>
          <span style={calendarDayStyle("tryon-selected")}>7</span>
          <span style={calendarDayStyle("default")}>8</span>
          <span style={calendarDayStyle("default")}>9</span>
        </div>
      </div>

      <div style={widgetGroupStyle()}>
        <label style={tryOnLabelStyle()}>{config.timeSlotLabel}</label>
        <div style={selectFieldStyle()}>{sampleSlot}</div>
      </div>

      <div style={priceRowStyle()}>
        <span>{config.priceLabel}</span>
        <strong>$50.00</strong>
      </div>

      <div style={primaryButtonStyle()}>{config.selectTimeLabel}</div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "1rem",
          fontSize: "0.8125rem",
          color: "rgba(0, 0, 0, 0.55)",
        }}
      >
        <span>{config.timezoneLabel}</span>
      </div>

      <div style={previewStepDividerStyle()}>Confirm step preview</div>

      <button
        type="button"
        style={{
          border: 0,
          background: "transparent",
          font: "inherit",
          textDecoration: "underline",
          cursor: "default",
          padding: 0,
          marginBottom: "1rem",
          color: "inherit",
        }}
      >
        ← {config.backLabel}
      </button>

      <p
        style={{
          textAlign: "left",
          fontSize: "1rem",
          fontWeight: 600,
          margin: "0 0 0.75rem",
        }}
      >
        {config.confirmTitle}
      </p>
      <p style={{ ...mutedTextStyle(), textAlign: "center" }}>{config.confirmSubtitle}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto minmax(0, 1fr) auto",
          gap: "0.85rem",
          alignItems: "start",
          padding: "1rem 0",
          borderTop: "1px solid rgba(0, 0, 0, 0.08)",
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          marginBottom: "1.25rem",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <span aria-hidden="true">📅</span>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: "0.875rem", wordBreak: "break-word" }}>
            Try On Appointment / {config.weekdayDayLabel} / {config.duration50Label}
          </strong>
          <p style={{ margin: "0.35rem 0 0", color: "rgba(0, 0, 0, 0.65)", fontSize: "0.875rem" }}>
            7 September 2026 10:00 AM - 10:50 AM
          </p>
        </div>
        <strong style={{ fontSize: "0.875rem" }}>$50.00</strong>
      </div>

      <div style={widgetGroupStyle()}>
        <h4
          style={{
            display: "block",
            fontSize: "0.9375rem",
            fontWeight: 600,
            margin: "0 0 1rem",
            color: "var(--gk-label-text, #111111)",
          }}
        >
          {config.additionalInfoTitle}
        </h4>
        <label style={tryOnLabelStyle()}>{config.eventDateLabel}</label>
        <div style={inputFieldStyle()}>dd/mm/yyyy</div>
        <label style={tryOnLabelStyle()}>{config.specificItemsLabel}</label>
        <div
          style={{
            ...inputFieldStyle(),
            color: "rgba(0, 0, 0, 0.45)",
          }}
        >
          {config.specificItemsPlaceholder}
        </div>
        <p style={{ fontSize: "0.875rem", margin: "1rem 0 0.5rem" }}>{config.availabilityNote}</p>
        <label
          style={{
            display: "flex",
            gap: "0.65rem",
            alignItems: "flex-start",
            fontSize: "0.875rem",
          }}
        >
          <input type="checkbox" readOnly style={{ marginTop: "0.15rem" }} />
          <span>{config.availabilityCheckboxLabel}</span>
        </label>
      </div>

      <div style={priceRowStyle()}>
        <span>{config.priceLabel}</span>
        <strong>$50.00</strong>
      </div>

      <div style={primaryButtonStyle(true, true)}>{config.bookCheckoutLabel}</div>
    </PreviewFrame>
  );
}
