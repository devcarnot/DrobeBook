import type { CSSProperties, ReactNode } from "react";

import type { SearchConfig } from "../lib/shop-config";
import { searchColorsToCssVariables } from "../lib/search-colors";

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
              <s-text type="strong">Search preview</s-text>
            </s-stack>
            <s-paragraph tone="neutral" color="subdued">
              Centered layout with your search colors and size dropdown.
            </s-paragraph>
          </s-stack>

          <div
            style={{
              ...themeStyle,
              background: "var(--gk-search-section-bg, #f7f5f2)",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              overflowX: "hidden",
              padding: "1.5rem 0.5rem",
              boxSizing: "border-box",
            }}
          >
            {children}
          </div>
        </s-stack>
      </s-box>
    </div>
  );
}

export function SearchWidgetPreview({ config }: { config: SearchConfig }) {
  const themeStyle = searchColorsToCssVariables(config.colors) as CSSProperties;

  return (
    <PreviewFrame themeStyle={themeStyle}>
      <header style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: "2rem",
            fontWeight: 400,
            color: "var(--gk-search-title-text, #111111)",
          }}
        >
          {config.pageTitle}
        </h1>
      </header>

      <div
        style={{
          width: "100%",
          maxWidth: "42rem",
          margin: "0 auto",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(10rem, 14rem) minmax(10rem, 14rem) minmax(11rem, auto)",
            gap: "1rem",
            alignItems: "end",
            width: "100%",
            maxWidth: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", minWidth: 0 }}>
            <label
              style={{
                fontSize: "0.8125rem",
                color: "var(--gk-label-text, #8c8c8c)",
              }}
            >
              {config.eventDateLabel}
            </label>
            <div
              style={{
                border: "1px solid var(--gk-search-input-border, rgba(0,0,0,0.18))",
                background: "var(--gk-search-input-bg, #fff)",
                padding: "0.75rem 0.85rem",
                minHeight: "3rem",
                boxSizing: "border-box",
                color: "rgba(0,0,0,0.45)",
                fontSize: "0.875rem",
              }}
            >
              mm/dd/yyyy
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", minWidth: 0 }}>
            <label
              style={{
                fontSize: "0.8125rem",
                color: "var(--gk-label-text, #8c8c8c)",
              }}
            >
              {config.sizeLabel}
            </label>
            <div
              style={{
                border: "1px solid var(--gk-search-input-border, rgba(0,0,0,0.18))",
                background: "var(--gk-search-input-bg, #fff)",
                padding: "0.75rem 2rem 0.75rem 0.85rem",
                minHeight: "3rem",
                boxSizing: "border-box",
                color: "var(--gk-button-text, #111)",
                fontSize: "0.875rem",
                position: "relative",
              }}
            >
              {config.sizePlaceholder}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  right: "0.85rem",
                  top: "50%",
                  transform: "translateY(-25%) rotate(45deg)",
                  width: "0.35rem",
                  height: "0.35rem",
                  borderRight: "1px solid currentColor",
                  borderBottom: "1px solid currentColor",
                }}
              />
            </div>
          </div>

          <button
            type="button"
            style={{
              border: 0,
              background: "var(--gk-button-bg, #d8cdb8)",
              color: "var(--gk-button-text, #111)",
              padding: "0.85rem 1.25rem",
              font: "inherit",
              fontSize: "0.9375rem",
              minHeight: "3rem",
              width: "100%",
              boxSizing: "border-box",
              cursor: "default",
              whiteSpace: "normal",
            }}
          >
            {config.formButtonLabel}
          </button>
        </div>
      </div>
    </PreviewFrame>
  );
}
