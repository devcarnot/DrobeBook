import type { CSSProperties } from "react";

import type { WidgetColorScheme } from "../lib/widget-colors";

export function ColorField({
  label,
  value,
  onChange,
}: {
  fieldKey: keyof WidgetColorScheme;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 0",
        borderBottom: "1px solid #edf0f2",
      }}
    >
      <span style={{ position: "relative", width: "36px", height: "36px", flexShrink: 0 }}>
        <input
          type="color"
          value={value}
          aria-label={`${label} picker`}
          onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width: "36px",
            height: "36px",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.35)",
            backgroundColor: value,
          }}
        />
      </span>
      <span style={{ display: "grid", gap: "2px", minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: "13px", fontWeight: 550, color: "#202223" }}>{label}</span>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
          pattern="#([0-9A-Fa-f]{6})"
          spellCheck={false}
          style={{
            width: "100%",
            maxWidth: "120px",
            border: 0,
            background: "transparent",
            padding: 0,
            font: "inherit",
            fontSize: "12px",
            color: "#616161",
          }}
        />
      </span>
    </label>
  );
}
