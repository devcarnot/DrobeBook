import type { CSSProperties, ReactNode } from "react";

import {
  bookingWidgetShellStyle,
  calendarDayStyle,
  calendarGridStyle,
  calendarHeaderStyle,
  calendarNavStyle,
  calendarWeekdayStyle,
  choiceButtonStyle,
  choiceRowStyle,
  mutedTextStyle,
  previewPanelStyle,
  previewThemeStyle,
  primaryButtonStyle,
  protectionRowStyle,
  widgetGroupStyle,
  widgetLabelStyle,
  widgetTitleStyle,
} from "../lib/widget-preview-styles";
import type { WidgetConfig } from "../lib/shop-settings";

function PreviewFrame({
  title,
  subtitle,
  themeStyle,
  children,
}: {
  title: string;
  subtitle: string;
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
              <s-text type="strong">{title}</s-text>
            </s-stack>
            <s-paragraph tone="neutral" color="subdued">
              {subtitle}
            </s-paragraph>
          </s-stack>

          <div style={{ ...themeStyle, ...bookingWidgetShellStyle(), ...previewPanelStyle() }}>
            {children}
          </div>
        </s-stack>
      </s-box>
    </div>
  );
}

export function GownHireWidgetPreview({ config }: { config: WidgetConfig }) {
  const ready = Boolean(config.deliveryInstructions && config.postageNote);
  const themeStyle = previewThemeStyle(config.colors);

  return (
    <PreviewFrame
      title="Live preview"
      subtitle="Updates as you type — including your color scheme."
      themeStyle={themeStyle}
    >
      <div style={widgetTitleStyle()}>Book this gown</div>

      <div style={widgetGroupStyle()}>
        <span style={widgetLabelStyle()}>Size</span>
        <div style={choiceRowStyle()}>
          <span style={choiceButtonStyle(true)}>AU 8</span>
          <span style={choiceButtonStyle()}>AU 10</span>
          <span style={choiceButtonStyle()}>AU 12</span>
        </div>
      </div>

      <div style={widgetGroupStyle()}>
        <span style={widgetLabelStyle()}>Duration</span>
        <div style={choiceRowStyle()}>
          <span style={choiceButtonStyle(true)}>4 days</span>
          <span style={choiceButtonStyle()}>8 days</span>
        </div>
      </div>

      <div style={widgetGroupStyle()}>
        <span style={widgetLabelStyle()}>Delivery method</span>
        <div style={choiceRowStyle()}>
          <span style={choiceButtonStyle()}>{config.postLabel || "Post"}</span>
          <span style={choiceButtonStyle(true)}>
            {config.pickupLabel || "Local Pickup (Gold Coast, QLD)"}
          </span>
        </div>
      </div>

      <p style={mutedTextStyle()}>
        {config.deliveryInstructions ||
          "Your delivery instructions will appear here…"}
      </p>

      <div style={{ margin: "0.5rem 0 1rem" }}>
        <div style={calendarHeaderStyle()}>
          <span style={calendarNavStyle()} aria-hidden="true">
            ←
          </span>
          <strong>September 2026</strong>
          <span style={calendarNavStyle()} aria-hidden="true">
            →
          </span>
        </div>
        <div style={calendarGridStyle()}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <span key={day} style={calendarWeekdayStyle()}>
              {day}
            </span>
          ))}
          <span style={calendarDayStyle("empty")}> </span>
          <span style={calendarDayStyle("empty")}> </span>
          <span style={calendarDayStyle("default")}>1</span>
          <span style={calendarDayStyle("unavailable")}>2</span>
          <span style={calendarDayStyle("preview")}>3</span>
          <span style={calendarDayStyle("selected")}>4</span>
          <span style={calendarDayStyle("default")}>5</span>
          <span style={calendarDayStyle("default")}>6</span>
        </div>
      </div>

      {config.postageNote ? (
        <p style={mutedTextStyle()}>{config.postageNote}</p>
      ) : null}

      <label style={protectionRowStyle()}>
        <input type="checkbox" readOnly checked={false} style={{ margin: 0 }} />
        <span>{config.damageProtectionLabel || "Add Damage Protection"}</span>
        <span style={{ textDecoration: "underline" }}>
          {config.moreInfoLabel || "More Info"}
        </span>
        <strong>${config.damageProtectionPrice || "19.93"}</strong>
      </label>

      <div style={primaryButtonStyle()}>
        {ready
          ? config.buttonLabelReady || "Add hire to cart"
          : config.buttonLabelPending || "Select dates first"}
      </div>
      <p style={{ ...mutedTextStyle(), marginBottom: 0, marginTop: "0.5rem" }}>
        Button switches when dates are selected
      </p>
    </PreviewFrame>
  );
}
