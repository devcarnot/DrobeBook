export type WidgetColorScheme = {
  dateText: string;
  unavailableDateBg: string;
  unavailableDateText: string;
  blockedDateBg: string;
  blockedDateText: string;
  selectedDateBg: string;
  selectedDateText: string;
  hoverDateBg: string;
  hoverDateText: string;
  previewRangeBg: string;
  previewRangeText: string;
  weekdayText: string;
  buttonBg: string;
  buttonText: string;
  choiceBg: string;
  choiceText: string;
  choiceSelectedBg: string;
  choiceSelectedText: string;
  choiceBorder: string;
  labelText: string;
  mutedText: string;
};

export const DEFAULT_WIDGET_COLORS: WidgetColorScheme = {
  dateText: "#333333",
  unavailableDateBg: "#F3F6F6",
  unavailableDateText: "#C3CECE",
  blockedDateBg: "#FFFFFF",
  blockedDateText: "#C3CECE",
  selectedDateBg: "#333333",
  selectedDateText: "#FFFFFF",
  hoverDateBg: "#A215AA",
  hoverDateText: "#FFFFFF",
  previewRangeBg: "#D8C4A8",
  previewRangeText: "#111111",
  weekdayText: "#737373",
  buttonBg: "#121212",
  buttonText: "#FFFFFF",
  choiceBg: "#FFFFFF",
  choiceText: "#111111",
  choiceSelectedBg: "#121212",
  choiceSelectedText: "#FFFFFF",
  choiceBorder: "#111111",
  labelText: "#525252",
  mutedText: "#949494",
};

const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

export function normalizeHexColor(
  value: string | null | undefined,
  fallback: string,
): string {
  const trimmed = String(value ?? "").trim();
  if (HEX_COLOR.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return fallback.toUpperCase();
}

export function parseWidgetColors(
  raw: Partial<WidgetColorScheme> | null | undefined,
): WidgetColorScheme {
  const colors = { ...DEFAULT_WIDGET_COLORS };
  if (!raw) {
    return colors;
  }

  for (const key of Object.keys(DEFAULT_WIDGET_COLORS) as Array<
    keyof WidgetColorScheme
  >) {
    colors[key] = normalizeHexColor(raw[key], DEFAULT_WIDGET_COLORS[key]);
  }

  return colors;
}

export function widgetColorsFromFormData(formData: FormData): WidgetColorScheme {
  const colors = { ...DEFAULT_WIDGET_COLORS };

  for (const key of Object.keys(DEFAULT_WIDGET_COLORS) as Array<
    keyof WidgetColorScheme
  >) {
    colors[key] = normalizeHexColor(
      String(formData.get(`color_${key}`) ?? ""),
      DEFAULT_WIDGET_COLORS[key],
    );
  }

  return colors;
}

export const WIDGET_COLOR_GROUPS = [
  {
    title: "Calendar colors",
    description: "Control how dates look in the booking calendar on product pages.",
    fields: [
      { key: "dateText" as const, label: "Date text color" },
      { key: "weekdayText" as const, label: "Weekday heading color" },
      { key: "unavailableDateBg" as const, label: "Unavailable date background" },
      { key: "unavailableDateText" as const, label: "Unavailable date text" },
      { key: "blockedDateBg" as const, label: "Blocked date background" },
      { key: "blockedDateText" as const, label: "Blocked date text" },
      { key: "selectedDateBg" as const, label: "Selected date background" },
      { key: "selectedDateText" as const, label: "Selected date text" },
      { key: "hoverDateBg" as const, label: "Hover date background" },
      { key: "hoverDateText" as const, label: "Hover date text" },
      { key: "previewRangeBg" as const, label: "Preview range background" },
      { key: "previewRangeText" as const, label: "Preview range text" },
    ],
  },
  {
    title: "Buttons & choices",
    description: "Primary buttons and size/duration/delivery option chips.",
    fields: [
      { key: "buttonBg" as const, label: "Button background" },
      { key: "buttonText" as const, label: "Button text" },
      { key: "choiceBg" as const, label: "Choice background" },
      { key: "choiceText" as const, label: "Choice text" },
      { key: "choiceSelectedBg" as const, label: "Selected choice background" },
      { key: "choiceSelectedText" as const, label: "Selected choice text" },
      { key: "choiceBorder" as const, label: "Choice border" },
      { key: "labelText" as const, label: "Field label text" },
      { key: "mutedText" as const, label: "Helper / note text" },
    ],
  },
] as const;

export const WIDGET_COLOR_CSS_VARS: Record<keyof WidgetColorScheme, string> = {
  dateText: "--gk-date-text",
  unavailableDateBg: "--gk-unavailable-bg",
  unavailableDateText: "--gk-unavailable-text",
  blockedDateBg: "--gk-blocked-bg",
  blockedDateText: "--gk-blocked-text",
  selectedDateBg: "--gk-selected-bg",
  selectedDateText: "--gk-selected-text",
  hoverDateBg: "--gk-hover-bg",
  hoverDateText: "--gk-hover-text",
  previewRangeBg: "--gk-preview-bg",
  previewRangeText: "--gk-preview-text",
  weekdayText: "--gk-weekday-text",
  buttonBg: "--gk-button-bg",
  buttonText: "--gk-button-text",
  choiceBg: "--gk-choice-bg",
  choiceText: "--gk-choice-text",
  choiceSelectedBg: "--gk-choice-selected-bg",
  choiceSelectedText: "--gk-choice-selected-text",
  choiceBorder: "--gk-choice-border",
  labelText: "--gk-label-text",
  mutedText: "--gk-muted-text",
};

export function widgetColorsToCssVariables(
  colors: WidgetColorScheme,
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const key of Object.keys(colors) as Array<keyof WidgetColorScheme>) {
    variables[WIDGET_COLOR_CSS_VARS[key]] = colors[key];
  }
  return variables;
}
