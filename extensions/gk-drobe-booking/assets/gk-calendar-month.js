(() => {
  const HEADERS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function daysInUtcMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function startWeekdaySundayUtc(year, month) {
    return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).getUTCDay();
  }

  function formatCalendarIso(year, month, day) {
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  }

  function buildSundayStartMonthCells(year, month) {
    const daysInMonth = daysInUtcMonth(year, month);
    const leadingDays = startWeekdaySundayUtc(year, month);
    const cells = [];

    for (let i = 0; i < leadingDays; i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return { leadingDays, daysInMonth, cells };
  }

  function weekdayNameForDay(year, month, day) {
    return WEEKDAY_NAMES[
      new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay()
    ];
  }

  window.GkCalendarMonth = {
    HEADERS,
    WEEKDAY_NAMES,
    daysInUtcMonth,
    startWeekdaySundayUtc,
    formatCalendarIso,
    buildSundayStartMonthCells,
    weekdayNameForDay,
  };
})();