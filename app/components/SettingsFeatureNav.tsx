import type { CSSProperties } from "react";

type SettingsFeature = "gown-hire" | "try-on" | "search";

const FEATURES: Array<{ id: SettingsFeature; label: string; href: string }> = [
  { id: "gown-hire", label: "Gown Hire", href: "/app/settings" },
  { id: "try-on", label: "Try-on", href: "/app/settings/try-on" },
  { id: "search", label: "Search", href: "/app/settings/search" },
];

const trackStyle: CSSProperties = {
  display: "inline-flex",
  maxWidth: "100%",
};

function pillStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 18px",
    borderRadius: "9999px",
    fontSize: "13px",
    fontWeight: active ? 600 : 550,
    lineHeight: 1.2,
    textDecoration: "none",
    color: active ? "#202223" : "#616161",
    background: active ? "#ffffff" : "transparent",
    boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.06)" : "none",
    transition: "background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease",
  };
}

export function SettingsFeatureNav({ active }: { active: SettingsFeature }) {
  return (
    <nav
      aria-label="Store Front widget sections"
      className="gk-pill-tabs"
      style={trackStyle}
    >
      {FEATURES.map((feature) => {
        const isActive = feature.id === active;

        return isActive ? (
          <span key={feature.id} style={pillStyle(true)} aria-current="page">
            {feature.label}
          </span>
        ) : (
          <s-link key={feature.id} href={feature.href}>
            <span style={pillStyle(false)}>{feature.label}</span>
          </s-link>
        );
      })}
    </nav>
  );
}
