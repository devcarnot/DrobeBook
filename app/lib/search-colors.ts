export type SearchColorScheme = {
  sectionBg: string;
  titleText: string;
  labelText: string;
  buttonBg: string;
  buttonText: string;
  inputBg: string;
  inputBorder: string;
};

export const DEFAULT_SEARCH_COLORS: SearchColorScheme = {
  sectionBg: "#F7F5F2",
  titleText: "#111111",
  labelText: "#8C8C8C",
  buttonBg: "#D8CDB8",
  buttonText: "#111111",
  inputBg: "#FFFFFF",
  inputBorder: "#2E2E2E",
};

const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const trimmed = String(value ?? "").trim();
  if (HEX_COLOR.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return fallback.toUpperCase();
}

export function parseSearchColors(
  raw: Partial<SearchColorScheme> | null | undefined,
): SearchColorScheme {
  const colors = { ...DEFAULT_SEARCH_COLORS };
  if (!raw) {
    return colors;
  }

  for (const key of Object.keys(DEFAULT_SEARCH_COLORS) as Array<keyof SearchColorScheme>) {
    colors[key] = normalizeHexColor(raw[key], DEFAULT_SEARCH_COLORS[key]);
  }

  return colors;
}

export function searchColorsFromFormData(formData: FormData): SearchColorScheme {
  const colors = { ...DEFAULT_SEARCH_COLORS };

  for (const key of Object.keys(DEFAULT_SEARCH_COLORS) as Array<keyof SearchColorScheme>) {
    colors[key] = normalizeHexColor(
      String(formData.get(`color_${key}`) ?? ""),
      DEFAULT_SEARCH_COLORS[key],
    );
  }

  return colors;
}

export const SEARCH_COLOR_FIELDS = [
  { key: "sectionBg" as const, label: "Section background" },
  { key: "titleText" as const, label: "Page title color" },
  { key: "labelText" as const, label: "Field label color" },
  { key: "buttonBg" as const, label: "Search button background" },
  { key: "buttonText" as const, label: "Search button text" },
  { key: "inputBg" as const, label: "Input background" },
  { key: "inputBorder" as const, label: "Input border" },
] as const;

export function searchColorsToCssVariables(
  colors: SearchColorScheme,
): Record<string, string> {
  return {
    "--gk-search-section-bg": colors.sectionBg,
    "--gk-search-title-text": colors.titleText,
    "--gk-label-text": colors.labelText,
    "--gk-button-bg": colors.buttonBg,
    "--gk-button-text": colors.buttonText,
    "--gk-search-input-bg": colors.inputBg,
    "--gk-search-input-border": colors.inputBorder,
  };
}
