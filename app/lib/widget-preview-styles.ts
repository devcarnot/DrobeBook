import type { CSSProperties } from "react";

import {
  widgetColorsToCssVariables,
  type WidgetColorScheme,
} from "./widget-colors";

const PREVIEW_FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export function previewThemeStyle(colors: WidgetColorScheme): CSSProperties {
  return {
    ...(widgetColorsToCssVariables(colors) as CSSProperties),
    fontFamily: PREVIEW_FONT,
    color: "var(--gk-date-text, #333333)",
  };
}

export function bookingWidgetShellStyle(): CSSProperties {
  return {
    border: "1px solid rgba(0, 0, 0, 0.08)",
    borderRadius: 0,
    padding: "1.5rem 1.25rem",
    background: "#ffffff",
    width: "100%",
    boxSizing: "border-box",
  };
}

export function tryOnWidgetShellStyle(): CSSProperties {
  return {
    padding: 0,
    background: "#ffffff",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    overflowX: "hidden",
  };
}

export function widgetTitleStyle(): CSSProperties {
  return {
    fontSize: "1.125rem",
    fontWeight: 600,
    margin: "0 0 1.25rem",
    letterSpacing: "0.01em",
    color: "var(--gk-date-text, #333333)",
  };
}

export function widgetGroupStyle(): CSSProperties {
  return {
    marginBottom: "1.1rem",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };
}

export function widgetLabelStyle(): CSSProperties {
  return {
    display: "block",
    fontSize: "0.8125rem",
    fontWeight: 600,
    marginBottom: "0.45rem",
    color: "var(--gk-label-text, #525252)",
  };
}

export function tryOnLabelStyle(): CSSProperties {
  return {
    display: "block",
    fontSize: "0.9375rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: "var(--gk-label-text, #111111)",
  };
}

export function choiceButtonStyle(selected = false): CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${selected ? "var(--gk-choice-selected-bg, #121212)" : "var(--gk-choice-border, #111111)"}`,
    background: selected
      ? "var(--gk-choice-selected-bg, #121212)"
      : "var(--gk-choice-bg, #ffffff)",
    color: selected
      ? "var(--gk-choice-selected-text, #ffffff)"
      : "var(--gk-choice-text, #111111)",
    borderRadius: 2,
    padding: "0.55rem 0.85rem",
    font: "inherit",
    fontSize: "0.875rem",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    minHeight: "2.5rem",
    maxWidth: "100%",
    boxSizing: "border-box",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    cursor: "default",
  };
}

export function tryOnChoiceStyle(selected = false, stacked = false): CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${selected ? "var(--gk-choice-selected-bg, #d8cdb8)" : "var(--gk-choice-border, #111111)"}`,
    background: selected
      ? "var(--gk-choice-selected-bg, #d8cdb8)"
      : "var(--gk-choice-bg, #ffffff)",
    color: selected
      ? "var(--gk-choice-selected-text, #111111)"
      : "var(--gk-choice-text, #111111)",
    borderRadius: 0,
    padding: stacked ? "0.85rem 1rem" : "0.55rem 0.85rem",
    font: "inherit",
    fontSize: "0.9375rem",
    lineHeight: 1.35,
    textAlign: "center",
    boxSizing: "border-box",
    width: stacked ? "100%" : "auto",
    maxWidth: "100%",
    display: stacked ? "block" : "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: stacked ? "normal" : "nowrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    cursor: "default",
  };
}

export function tryOnChoiceColumnStyle(): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  };
}

export function tryOnChoiceRowStyle(): CSSProperties {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.65rem",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  };
}

export function choiceRowStyle(stacked = false): CSSProperties {
  return {
    display: "flex",
    flexWrap: stacked ? "nowrap" : "wrap",
    flexDirection: stacked ? "column" : "row",
    gap: stacked ? "0.65rem" : "0.5rem",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  };
}

export function mutedTextStyle(): CSSProperties {
  return {
    fontSize: "0.8125rem",
    lineHeight: 1.5,
    color: "var(--gk-muted-text, #949494)",
    margin: "0 0 1rem",
  };
}

export function calendarHeaderStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.75rem",
    fontSize: "0.875rem",
    fontWeight: 600,
  };
}

export function calendarNavStyle(): CSSProperties {
  return {
    border: "1px solid rgba(0, 0, 0, 0.15)",
    background: "var(--gk-choice-bg, #ffffff)",
    color: "var(--gk-choice-text, #111111)",
    borderRadius: 2,
    padding: "0.25rem 0.55rem",
    font: "inherit",
    cursor: "default",
  };
}

export function tryOnCalendarNavStyle(): CSSProperties {
  return {
    border: 0,
    background: "transparent",
    fontSize: "1.5rem",
    lineHeight: 1,
    color: "rgba(0, 0, 0, 0.45)",
    cursor: "default",
    padding: 0,
  };
}

export function calendarGridStyle(gap = "0.2rem"): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap,
  };
}

export function calendarWeekdayStyle(): CSSProperties {
  return {
    textAlign: "center",
    padding: "0.55rem 0",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--gk-weekday-text, #737373)",
  };
}

export function tryOnWeekdayStyle(): CSSProperties {
  return {
    textAlign: "center",
    padding: "0.65rem 0",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "rgba(0, 0, 0, 0.45)",
  };
}

export function calendarDayStyle(
  variant: "default" | "unavailable" | "preview" | "selected" | "empty" | "tryon-selected" | "tryon-unavailable",
): CSSProperties {
  const base: CSSProperties = {
    textAlign: "center",
    padding: "0.55rem 0",
    fontSize: "0.8125rem",
    minHeight: "2.35rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid transparent",
    borderRadius: 2,
  };

  switch (variant) {
    case "unavailable":
      return {
        ...base,
        color: "var(--gk-unavailable-text, #c3cece)",
        background: "var(--gk-unavailable-bg, #f3f6f6)",
        textDecoration: "line-through",
      };
    case "preview":
      return {
        ...base,
        color: "var(--gk-preview-text, #111111)",
        background: "var(--gk-preview-bg, #d8c4a8)",
      };
    case "selected":
      return {
        ...base,
        color: "var(--gk-selected-text, #ffffff)",
        background: "var(--gk-selected-bg, #333333)",
      };
    case "tryon-selected":
      return {
        ...base,
        border: 0,
        borderRadius: 0,
        color: "var(--gk-preview-text, #111111)",
        background: "var(--gk-preview-bg, #d8cdb8)",
        fontWeight: 700,
      };
    case "tryon-unavailable":
      return {
        ...base,
        border: 0,
        borderRadius: 0,
        color: "rgba(0, 0, 0, 0.25)",
        background: "transparent",
      };
    case "empty":
      return { ...base, visibility: "hidden" };
    default:
      return {
        ...base,
        color: "var(--gk-date-text, #333333)",
        background: "#ffffff",
      };
  }
}

export function primaryButtonStyle(fullWidth = true, confirm = false): CSSProperties {
  return {
    width: fullWidth ? "100%" : undefined,
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: confirm ? "1rem" : "0.95rem 1rem",
    border: "none",
    borderRadius: confirm ? 0 : 2,
    background: confirm
      ? "var(--gk-choice-selected-bg, #d8cdb8)"
      : "var(--gk-button-bg, #121212)",
    color: confirm
      ? "var(--gk-choice-selected-text, #111111)"
      : "var(--gk-button-text, #ffffff)",
    font: "inherit",
    fontWeight: confirm ? 700 : 600,
    cursor: "default",
    marginTop: confirm ? 0 : "0.5rem",
    textAlign: "center",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  };
}

export function selectFieldStyle(): CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(0, 0, 0, 0.25)",
    borderRadius: 0,
    padding: "0.8rem 1rem",
    font: "inherit",
    fontSize: "0.875rem",
    background: "#fff",
    color: "var(--gk-date-text, #333333)",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  };
}

export function inputFieldStyle(): CSSProperties {
  return {
    width: "100%",
    border: "1px solid rgba(0, 0, 0, 0.25)",
    borderRadius: 0,
    padding: "0.8rem 1rem",
    font: "inherit",
    fontSize: "0.875rem",
    background: "#fff",
    marginBottom: "0.85rem",
    boxSizing: "border-box",
  };
}

export function priceRowStyle(): CSSProperties {
  return {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.35rem",
    margin: "1rem 0",
    fontSize: "0.9375rem",
  };
}

export function protectionRowStyle(): CSSProperties {
  return {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.35rem 0.5rem",
    fontSize: "0.8125rem",
    marginBottom: "1rem",
  };
}

export function previewPanelStyle(): CSSProperties {
  return {
    marginTop: "0.25rem",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "hidden",
  };
}

export function previewStepDividerStyle(): CSSProperties {
  return {
    margin: "1.5rem 0 1rem",
    paddingTop: "1.25rem",
    borderTop: "1px dashed rgba(0, 0, 0, 0.12)",
    fontSize: "0.75rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--gk-muted-text, #949494)",
  };
}
