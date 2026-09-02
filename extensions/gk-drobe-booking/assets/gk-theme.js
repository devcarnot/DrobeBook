(() => {
  const DEFAULT_THEME = {
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

  const CSS_VARS = {
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

  function applyTheme(root, colors) {
    if (!root) return;
    const theme = { ...DEFAULT_THEME, ...(colors || {}) };
    Object.keys(CSS_VARS).forEach((key) => {
      root.style.setProperty(CSS_VARS[key], theme[key]);
    });
  }

  window.GkDrobeTheme = {
    apply: applyTheme,
    defaults: DEFAULT_THEME,
  };
})();
