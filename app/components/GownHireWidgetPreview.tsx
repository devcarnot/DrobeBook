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

          <div
            style={{
              ...themeStyle,
              ...bookingWidgetShellStyle(),
              ...previewPanelStyle(),
              maxHeight: "min(72vh, 720px)",
              overflowY: "auto",
            }}
          >
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
          <span style={choiceButtonStyle(true)}>5 Days – $249.00</span>
          <span style={choiceButtonStyle()}>8 days – $199.00</span>
        </div>
        <p style={mutedTextStyle()}>
          Duration buttons come from each product&apos;s Shopify Duration variants.
        </p>
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

      <div
        style={{
          margin: "0.25rem 0 1.35rem",
          padding: "1rem",
          background: "rgba(0, 0, 0, 0.02)",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        <div style={calendarHeaderStyle()}>
          <span style={calendarNavStyle()} aria-hidden="true">
            ←
          </span>
          <strong>September 2026</strong>
          <span style={calendarNavStyle()} aria-hidden="true">
            →
          </span>
        </div>
        <div style={calendarGridStyle("0.25rem")}>
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
        <p style={{ ...mutedTextStyle(), marginTop: 0 }}>{config.postageNote}</p>
      ) : null}

      <div
        style={{
          background: "rgba(0, 0, 0, 0.02)",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          borderRadius: "12px",
          padding: "1rem 1.1rem",
          marginBottom: "1.35rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "0.85rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--gk-muted-text, #949494)" }}>
              Delivery date
            </div>
            <strong style={{ fontSize: "0.9375rem" }}>Mon, 7 Sept 2026</strong>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--gk-muted-text, #949494)" }}>
              Hire cost
            </div>
            <strong style={{ fontSize: "0.9375rem" }}>$249.00</strong>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--gk-muted-text, #949494)" }}>
              Return date
            </div>
            <strong style={{ fontSize: "0.9375rem" }}>Thu, 10 Sept 2026</strong>
          </div>
          <div style={{ textAlign: "right" }}>
            <label style={protectionRowStyle()}>
              <input type="checkbox" readOnly checked={false} style={{ margin: 0 }} />
              <span>{config.damageProtectionLabel || "Add Damage Protection"}</span>
            </label>
            <strong style={{ fontSize: "0.9375rem" }}>
              ${config.damageProtectionPrice || "19.93"}
            </strong>
          </div>
        </div>
      </div>

      <div style={widgetGroupStyle()}>
        <span style={widgetLabelStyle()}>Event date</span>
        <div
          style={{
            width: "100%",
            padding: "0.85rem 1rem",
            border: "1px solid rgba(0, 0, 0, 0.12)",
            borderRadius: "10px",
            fontSize: "0.9375rem",
            background: "#fff",
            color: "rgba(0, 0, 0, 0.45)",
            boxSizing: "border-box",
          }}
        >
          mm/dd/yyyy
        </div>
      </div>

      {config.hireTerms.length > 0 ? (
        <div style={widgetGroupStyle()}>
          <span style={widgetLabelStyle()}>Hire terms</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {config.hireTerms.map((term) => (
              <label
                key={term.id}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                  fontSize: "0.875rem",
                  lineHeight: 1.45,
                }}
              >
                <input type="checkbox" readOnly style={{ marginTop: "0.15rem" }} />
                <span>{term.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

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
