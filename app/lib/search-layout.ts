export type SearchContentWidth =
  | "standard"
  | "theme"
  | "narrow"
  | "medium"
  | "wide"
  | "full";
export type SearchSectionPadding = "compact" | "default" | "spacious";
export type SearchTitleSize = "small" | "medium" | "large";
export type SearchInputStyle = "square" | "rounded" | "pill";

export type SearchLayoutSettings = {
  contentWidth: SearchContentWidth;
  sectionPadding: SearchSectionPadding;
  titleSize: SearchTitleSize;
  inputStyle: SearchInputStyle;
  fullBleedBackground: boolean;
};

export const DEFAULT_SEARCH_LAYOUT: SearchLayoutSettings = {
  contentWidth: "standard",
  sectionPadding: "default",
  titleSize: "medium",
  inputStyle: "square",
  fullBleedBackground: true,
};

const CONTENT_WIDTH_VALUES: Record<SearchContentWidth, string> = {
  standard: "min(1400px, 100%)",
  theme:
    "min(var(--page-width, var(--container-max-width, var(--max-page-width, 87.5rem))), 100%)",
  narrow: "42rem",
  medium: "56rem",
  wide: "87.5rem",
  full: "100%",
};

const SECTION_PADDING_VALUES: Record<
  SearchSectionPadding,
  { block: string; inline: string }
> = {
  compact: { block: "1.5rem", inline: "1rem" },
  default: { block: "2.5rem", inline: "1rem" },
  spacious: { block: "4rem", inline: "1.5rem" },
};

const TITLE_SIZE_VALUES: Record<SearchTitleSize, string> = {
  small: "clamp(1.5rem, 3vw, 2rem)",
  medium: "clamp(2rem, 4vw, 2.75rem)",
  large: "clamp(2.25rem, 5vw, 3.25rem)",
};

const INPUT_RADIUS_VALUES: Record<SearchInputStyle, string> = {
  square: "0",
  rounded: "8px",
  pill: "9999px",
};

function parseEnumField<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = String(value ?? "").trim() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function parseBooleanField(
  value: FormDataEntryValue | null,
  fallback: boolean,
): boolean {
  if (value == null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  return fallback;
}

export function parseSearchLayout(
  raw: Partial<SearchLayoutSettings> | null | undefined,
): SearchLayoutSettings {
  if (!raw) {
    return { ...DEFAULT_SEARCH_LAYOUT };
  }

  return {
    // Older saved configs used "theme" before 1400px became the default.
    contentWidth:
      raw.contentWidth === "theme"
        ? "standard"
        : parseEnumField(
            raw.contentWidth ?? null,
            ["standard", "theme", "narrow", "medium", "wide", "full"],
            DEFAULT_SEARCH_LAYOUT.contentWidth,
          ),
    sectionPadding: parseEnumField(
      raw.sectionPadding ?? null,
      ["compact", "default", "spacious"],
      DEFAULT_SEARCH_LAYOUT.sectionPadding,
    ),
    titleSize: parseEnumField(
      raw.titleSize ?? null,
      ["small", "medium", "large"],
      DEFAULT_SEARCH_LAYOUT.titleSize,
    ),
    inputStyle: parseEnumField(
      raw.inputStyle ?? null,
      ["square", "rounded", "pill"],
      DEFAULT_SEARCH_LAYOUT.inputStyle,
    ),
    fullBleedBackground:
      typeof raw.fullBleedBackground === "boolean"
        ? raw.fullBleedBackground
        : DEFAULT_SEARCH_LAYOUT.fullBleedBackground,
  };
}

export function searchLayoutFromFormData(formData: FormData): SearchLayoutSettings {
  return {
    contentWidth: parseEnumField(
      formData.get("contentWidth"),
      ["standard", "theme", "narrow", "medium", "wide", "full"],
      DEFAULT_SEARCH_LAYOUT.contentWidth,
    ),
    sectionPadding: parseEnumField(
      formData.get("sectionPadding"),
      ["compact", "default", "spacious"],
      DEFAULT_SEARCH_LAYOUT.sectionPadding,
    ),
    titleSize: parseEnumField(
      formData.get("titleSize"),
      ["small", "medium", "large"],
      DEFAULT_SEARCH_LAYOUT.titleSize,
    ),
    inputStyle: parseEnumField(
      formData.get("inputStyle"),
      ["square", "rounded", "pill"],
      DEFAULT_SEARCH_LAYOUT.inputStyle,
    ),
    fullBleedBackground: String(formData.get("fullBleedBackground") ?? "") === "true",
  };
}

export function searchLayoutToCssVariables(
  layout: SearchLayoutSettings,
): Record<string, string> {
  const padding = SECTION_PADDING_VALUES[layout.sectionPadding];

  return {
    "--gk-search-content-max-width": CONTENT_WIDTH_VALUES[layout.contentWidth],
    "--gk-search-section-padding-block": padding.block,
    "--gk-search-section-padding-inline": padding.inline,
    "--gk-search-title-size": TITLE_SIZE_VALUES[layout.titleSize],
    "--gk-search-input-radius": INPUT_RADIUS_VALUES[layout.inputStyle],
    "--gk-search-full-bleed": layout.fullBleedBackground ? "1" : "0",
  };
}

export const SEARCH_LAYOUT_FIELDS = {
  contentWidth: [
    { value: "standard", label: "Standard (1400px)" },
    { value: "theme", label: "Match theme page width" },
    { value: "narrow", label: "Narrow (42rem)" },
    { value: "medium", label: "Medium (56rem)" },
    { value: "wide", label: "Wide (87.5rem / 1400px)" },
    { value: "full", label: "Full width" },
  ],
  sectionPadding: [
    { value: "compact", label: "Compact" },
    { value: "default", label: "Default" },
    { value: "spacious", label: "Spacious" },
  ],
  titleSize: [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
  ],
  inputStyle: [
    { value: "square", label: "Square corners" },
    { value: "rounded", label: "Rounded corners" },
    { value: "pill", label: "Pill shape" },
  ],
} as const;
