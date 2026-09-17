import type { CSSProperties, ReactNode } from "react";

export type ResponsiveGridLayout =
  | "2"
  | "3"
  | "4"
  | "split"
  | "form-actions"
  | "filter-row"
  | "detail-actions"
  | "product-card"
  | "header-row"
  | "timeline"
  | "import-row";

type ResponsiveGridProps = {
  layout: ResponsiveGridLayout;
  gap?: "base" | "large" | "small-200";
  alignItems?: "start" | "end" | "center";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function ResponsiveGrid({
  layout,
  gap = "large",
  alignItems,
  children,
  className,
  style,
}: ResponsiveGridProps) {
  const classes = [
    "gk-grid",
    `gk-grid--${layout}`,
    `gk-gap-${gap}`,
    alignItems ? `gk-align-${alignItems}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
