(() => {
  function formatIso(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatMoney(cents, currency = "AUD") {
    const amount = (Number(cents) / 100).toFixed(2);
    return currency === "AUD" || !currency ? `$${amount}` : `${currency} ${amount}`;
  }

  function formatDisplayDate(iso) {
    if (!iso) return "";
    const date = new Date(`${iso}T12:00:00.000Z`);
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function formatDisplayDateTime(iso, slotLabel) {
    return `${formatDisplayDate(iso)} ${slotLabel}`;
  }

  class TryOnWidget {
    constructor(root) {
      this.root = root;
      this.proxyBase = root.dataset.proxyBase || "/apps/gk-drobe";
      this.variantId = root.dataset.variantId;
      this.productTitle = root.dataset.productTitle || "Try On Appointment";
      this.priceCents = Number(root.dataset.variantPrice || 0);
      this.currency = root.dataset.currency || "AUD";

      this.config = {};
      this.state = {
        dayType: "weekday",
        durationMinutes: 50,
        calendarYear: new Date().getUTCFullYear(),
        calendarMonth: new Date().getUTCMonth() + 1,
        selectedDate: "",
        selectedSlot: null,
        unavailableDates: new Set(),
        loadingCalendar: false,
        loadingSlots: false,
      };

      this.cacheElements();
      this.bindEvents();
      this.init();
    }

    cacheElements() {
      this.selectStep = this.root.querySelector("[data-gk-tryon-select-step]");
      this.confirmStep = this.root.querySelector("[data-gk-tryon-confirm-step]");
      this.dayButtonsEl = this.root.querySelector("[data-gk-day-buttons]");
      this.durationButtonsEl = this.root.querySelector("[data-gk-duration-buttons]");
      this.calendarGrid = this.root.querySelector("[data-gk-calendar-grid]");
      this.calendarLabel = this.root.querySelector("[data-gk-calendar-label]");
      this.loadingEl = this.root.querySelector("[data-gk-loading]");
      this.slotGroup = this.root.querySelector("[data-gk-slot-group]");
      this.slotSelect = this.root.querySelector("[data-gk-slot-select]");
      this.priceDisplay = this.root.querySelector("[data-gk-price-display]");
      this.selectTimeButton = this.root.querySelector("[data-gk-select-time]");
      this.timezoneLabel = this.root.querySelector("[data-gk-timezone-label]");
      this.summaryTitle = this.root.querySelector("[data-gk-summary-title]");
      this.summaryDatetime = this.root.querySelector("[data-gk-summary-datetime]");
      this.summaryPrice = this.root.querySelector("[data-gk-summary-price]");
      this.confirmPrice = this.root.querySelector("[data-gk-confirm-price]");
      this.eventDateInput = this.root.querySelector("[data-gk-event-date]");
      this.specificItemsInput = this.root.querySelector("[data-gk-specific-items]");
      this.availabilityNote = this.root.querySelector("[data-gk-availability-note]");
      this.introEl = this.root.querySelector("[data-gk-intro]");
      this.dayTypeLabelEl = this.root.querySelector("[data-gk-day-type-label]");
      this.durationTypeLabelEl = this.root.querySelector("[data-gk-duration-type-label]");
      this.confirmTitleEl = this.root.querySelector("[data-gk-confirm-title]");
      this.confirmSubtitleEl = this.root.querySelector("[data-gk-confirm-subtitle]");
      this.additionalInfoTitleEl = this.root.querySelector("[data-gk-additional-info-title]");
      this.eventDateLabelEl = this.root.querySelector("[data-gk-event-date-label]");
      this.specificItemsLabelEl = this.root.querySelector("[data-gk-specific-items-label]");
      this.availabilityCheckbox = this.root.querySelector("[data-gk-availability-check]");
      this.availabilityCheckboxLabel = this.root.querySelector(
        "[data-gk-availability-checkbox-label]",
      );
      this.timeSlotLabelEl = this.root.querySelector("[data-gk-time-slot-label]");
      this.priceLabelEls = this.root.querySelectorAll("[data-gk-price-label]");
      this.backButton = this.root.querySelector("[data-gk-back]");
      this.checkoutButton = this.root.querySelector("[data-gk-checkout]");
      this.errorEl = this.root.querySelector("[data-gk-error]");
    }

    bindEvents() {
      this.root.querySelector("[data-gk-prev-month]")?.addEventListener("click", () => {
        this.shiftMonth(-1);
      });
      this.root.querySelector("[data-gk-next-month]")?.addEventListener("click", () => {
        this.shiftMonth(1);
      });
      this.slotSelect?.addEventListener("change", () => {
        const option = this.slotSelect.selectedOptions[0];
        if (!option?.dataset.time) {
          this.state.selectedSlot = null;
        } else {
          this.state.selectedSlot = {
            time: option.dataset.time,
            endTime: option.dataset.endTime,
            label: option.dataset.label,
            available: Number(option.dataset.available || 0),
          };
        }
        this.updateActions();
      });
      this.selectTimeButton?.addEventListener("click", () => this.showConfirmStep());
      this.root.querySelector("[data-gk-back]")?.addEventListener("click", () => {
        this.showSelectStep();
      });
      this.eventDateInput?.addEventListener("change", () => this.updateActions());
      this.availabilityCheckbox?.addEventListener("change", () => this.updateActions());
      this.checkoutButton?.addEventListener("click", () => this.addToCart());
    }

    async init() {
      await this.loadConfig();
      this.renderDayButtons();
      this.renderDurationButtons();
      this.updatePrice();
      await this.loadCalendar();
    }

    async loadConfig() {
      try {
        const [appointmentResponse, widgetResponse] = await Promise.all([
          fetch(`${this.proxyBase}/api/appointment-config`),
          fetch(`${this.proxyBase}/api/config`),
        ]);

        if (appointmentResponse.ok) {
          this.config = await appointmentResponse.json();
        }

        if (widgetResponse.ok) {
          const widgetConfig = await widgetResponse.json();
          if (window.GkDrobeTheme && widgetConfig.colors) {
            window.GkDrobeTheme.apply(this.root, widgetConfig.colors);
          }
        }
      } catch {
        this.config = {};
      }

      this.timezoneLabel.textContent = this.config.timezoneLabel || "Brisbane";
      if (this.introEl) {
        this.introEl.textContent =
          this.config.introText || this.introEl.textContent || "Select your appointment time";
      }
      if (this.dayTypeLabelEl) {
        this.dayTypeLabelEl.textContent = this.config.dayTypeLabel || "Day";
      }
      if (this.durationTypeLabelEl) {
        this.durationTypeLabelEl.textContent = this.config.durationTypeLabel || "Duration";
      }
      if (this.confirmTitleEl) {
        this.confirmTitleEl.textContent =
          this.config.confirmTitle || "Confirm your appointment";
      }
      if (this.confirmSubtitleEl) {
        this.confirmSubtitleEl.textContent =
          this.config.confirmSubtitle || "Review your booking details before checkout.";
      }
      if (this.additionalInfoTitleEl) {
        this.additionalInfoTitleEl.textContent =
          this.config.additionalInfoTitle || "Additional information";
      }
      if (this.eventDateLabelEl) {
        this.eventDateLabelEl.textContent =
          this.config.eventDateLabel || "Your Event Date:";
      }
      if (this.specificItemsLabelEl) {
        this.specificItemsLabelEl.textContent =
          this.config.specificItemsLabel ||
          "Please list any specific items you would like to try on:";
      }
      if (this.specificItemsInput) {
        this.specificItemsInput.placeholder =
          this.config.specificItemsPlaceholder || "(Style & size)";
      }
      if (this.timeSlotLabelEl) {
        this.timeSlotLabelEl.textContent =
          this.config.timeSlotLabel || "Available times";
      }
      this.priceLabelEls?.forEach((element) => {
        element.textContent = this.config.priceLabel || "Price";
      });
      if (this.backButton) {
        this.backButton.textContent = `← ${this.config.backLabel || "Back"}`;
      }
      if (this.loadingEl) {
        this.loadingEl.textContent =
          this.config.loadingCalendarText || "Loading availability…";
      }
      this.selectTimeButton.textContent =
        this.config.selectTimeLabel || "Select a Time";
      this.checkoutButton.textContent =
        this.config.bookCheckoutLabel || "Book & Checkout";
      this.availabilityNote.textContent =
        this.config.availabilityNote ||
        "Our styles book out, it is important to check availability:";
      this.availabilityCheckboxLabel.textContent =
        this.config.availabilityCheckboxLabel ||
        "I have/will check outfit availability for my event date";
    }

    createChoice(label, selected, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gk-drobe-tryon__choice";
      button.textContent = label;
      if (selected) {
        button.classList.add("gk-drobe-tryon__choice--selected");
      }
      button.addEventListener("click", onClick);
      return button;
    }

    renderDayButtons() {
      this.dayButtonsEl.innerHTML = "";
      [
        {
          id: "weekday",
          label: this.config.weekdayDayLabel || "Monday-Friday",
        },
        {
          id: "weekend",
          label: this.config.weekendDayLabel || "Saturday-Sunday",
        },
      ].forEach(({ id, label }) => {
        this.dayButtonsEl.appendChild(
          this.createChoice(label, this.state.dayType === id, () => {
            this.state.dayType = id;
            this.state.selectedDate = "";
            this.state.selectedSlot = null;
            this.renderDayButtons();
            this.loadCalendar();
          }),
        );
      });
    }

    renderDurationButtons() {
      this.durationButtonsEl.innerHTML = "";
      [
        {
          minutes: 50,
          label:
            this.config.duration50Label || "50 minute Appointment (recommended)",
        },
        {
          minutes: 20,
          label:
            this.config.duration20Label || "20 minute (Cocktail wear & re-try only)",
        },
      ].forEach(({ minutes, label }) => {
        this.durationButtonsEl.appendChild(
          this.createChoice(label, this.state.durationMinutes === minutes, () => {
            this.state.durationMinutes = minutes;
            this.state.selectedDate = "";
            this.state.selectedSlot = null;
            this.renderDurationButtons();
            this.loadCalendar();
          }),
        );
      });
    }

    shiftMonth(delta) {
      const date = new Date(
        Date.UTC(this.state.calendarYear, this.state.calendarMonth - 1 + delta, 1),
      );
      this.state.calendarYear = date.getUTCFullYear();
      this.state.calendarMonth = date.getUTCMonth() + 1;
      this.loadCalendar();
    }

    async loadCalendar() {
      this.state.loadingCalendar = true;
      this.loadingEl.hidden = false;
      this.clearError();

      const params = new URLSearchParams({
        year: String(this.state.calendarYear),
        month: String(this.state.calendarMonth),
        dayType: this.state.dayType,
        durationMinutes: String(this.state.durationMinutes),
      });

      try {
        const response = await fetch(
          `${this.proxyBase}/api/appointment-calendar?${params.toString()}`,
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not load calendar");
        }
        this.state.unavailableDates = new Set(data.unavailableDates || []);
      } catch (error) {
        this.showError(error.message);
        this.state.unavailableDates = new Set();
      } finally {
        this.state.loadingCalendar = false;
        this.loadingEl.hidden = true;
        this.renderCalendar();
      }
    }

    renderCalendar() {
      const monthDate = new Date(
        Date.UTC(this.state.calendarYear, this.state.calendarMonth - 1, 1),
      );
      this.calendarLabel.textContent = monthDate.toLocaleDateString("en-AU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });

      this.calendarGrid.innerHTML = "";
      ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach((day) => {
        const label = document.createElement("div");
        label.className = "gk-drobe-tryon__weekday";
        label.textContent = day;
        this.calendarGrid.appendChild(label);
      });

      const firstWeekday = monthDate.getUTCDay();
      const daysInMonth = new Date(
        Date.UTC(this.state.calendarYear, this.state.calendarMonth, 0),
      ).getUTCDate();

      for (let i = 0; i < firstWeekday; i += 1) {
        const empty = document.createElement("div");
        empty.className = "gk-drobe-tryon__day gk-drobe-tryon__day--empty";
        this.calendarGrid.appendChild(empty);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = formatIso(
          new Date(Date.UTC(this.state.calendarYear, this.state.calendarMonth - 1, day)),
        );
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gk-drobe-tryon__day";
        button.textContent = String(day);

        const unavailable = this.state.unavailableDates.has(iso);
        if (unavailable) {
          button.classList.add("gk-drobe-tryon__day--unavailable");
          button.disabled = true;
        }
        if (iso === this.state.selectedDate) {
          button.classList.add("gk-drobe-tryon__day--selected");
        }

        button.addEventListener("click", () => {
          if (iso === this.state.selectedDate) {
            this.state.selectedDate = "";
            this.state.selectedSlot = null;
          } else {
            this.state.selectedDate = iso;
            this.state.selectedSlot = null;
          }
          this.renderCalendar();
          this.loadSlots();
        });

        this.calendarGrid.appendChild(button);
      }
    }

    formatSlotOption(slot) {
      if (slot.soldOut) {
        return `${slot.label} / ${this.config.slotSoldOutText || "Sold out"}`;
      }

      const available = Number(slot.available || 0);
      if (available === 1) {
        return `${slot.label} / ${this.config.slotAvailableSingularText || "1 Space Available"}`;
      }

      const template =
        this.config.slotAvailablePluralText || "{count} Spaces Available";
      return `${slot.label} / ${template.replace("{count}", String(available))}`;
    }

    async loadSlots() {
      if (!this.state.selectedDate) {
        this.slotGroup.hidden = true;
        this.slotSelect.innerHTML = "";
        this.updateActions();
        return;
      }

      this.state.loadingSlots = true;
      this.slotGroup.hidden = false;
      this.slotSelect.innerHTML = `<option value="">${this.config.slotLoadingText || "Loading times…"}</option>`;

      const params = new URLSearchParams({
        date: this.state.selectedDate,
        durationMinutes: String(this.state.durationMinutes),
      });

      try {
        const response = await fetch(
          `${this.proxyBase}/api/appointment-slots?${params.toString()}`,
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not load time slots");
        }

        this.slotSelect.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = this.config.slotPlaceholder || "Select a time";
        this.slotSelect.appendChild(placeholder);

        (data.slots || []).forEach((slot) => {
          const option = document.createElement("option");
          option.value = slot.time;
          option.dataset.time = slot.time;
          option.dataset.endTime = slot.endTime;
          option.dataset.label = slot.label;
          option.dataset.available = String(slot.available);
          option.textContent = this.formatSlotOption(slot);
          option.disabled = slot.soldOut;
          this.slotSelect.appendChild(option);
        });
      } catch (error) {
        this.showError(error.message);
        this.slotSelect.innerHTML = "";
      } finally {
        this.state.loadingSlots = false;
        this.updateActions();
      }
    }

    updatePrice() {
      const formatted = formatMoney(this.priceCents, this.currency);
      this.priceDisplay.textContent = formatted;
      this.summaryPrice.textContent = formatted;
      this.confirmPrice.textContent = formatted;
    }

    updateActions() {
      const ready = Boolean(this.state.selectedDate && this.state.selectedSlot);
      this.selectTimeButton.disabled = !ready;

      const confirmReady =
        ready &&
        this.eventDateInput.value &&
        this.availabilityCheckbox.checked;
      this.checkoutButton.disabled = !confirmReady;
    }

    dayLabelForType(dayType) {
      return dayType === "weekday"
        ? this.config.weekdayDayLabel || "Monday-Friday"
        : this.config.weekendDayLabel || "Saturday-Sunday";
    }

    durationLabelForMinutes(minutes) {
      return minutes === 50
        ? this.config.duration50Label || "50 minute Appointment (recommended)"
        : this.config.duration20Label || "20 minute (Cocktail wear & re-try only)";
    }

    showConfirmStep() {
      const dayLabel = this.dayLabelForType(this.state.dayType);
      const durationLabel = this.durationLabelForMinutes(this.state.durationMinutes);

      this.summaryTitle.textContent = `${this.productTitle} / ${dayLabel} / ${durationLabel}`;
      this.summaryDatetime.textContent = formatDisplayDateTime(
        this.state.selectedDate,
        this.state.selectedSlot.label,
      );

      this.selectStep.hidden = true;
      this.confirmStep.hidden = false;
      this.updateActions();
    }

    showSelectStep() {
      this.selectStep.hidden = false;
      this.confirmStep.hidden = true;
    }

    async addToCart() {
      this.checkoutButton.disabled = true;
      this.clearError();

      const dayLabel = this.dayLabelForType(this.state.dayType);
      const durationLabel = this.durationLabelForMinutes(this.state.durationMinutes);

      const properties = {
        Day: dayLabel,
        Duration: durationLabel,
        "Appointment Date": formatDisplayDate(this.state.selectedDate),
        "Appointment Time": this.state.selectedSlot.label,
        "Event Date": formatDisplayDate(this.eventDateInput.value),
        "Items to try on": this.specificItemsInput.value || "—",
      };

      try {
        const response = await fetch(`${window.Shopify?.routes?.root || "/"}cart/add.js`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: this.variantId,
            quantity: 1,
            properties,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.description || data.message || "Could not add to cart");
        }
        window.location.href = `${window.Shopify?.routes?.root || "/"}cart`;
      } catch (error) {
        this.showError(error.message);
        this.checkoutButton.disabled = false;
      }
    }

    showError(message) {
      this.errorEl.textContent = message;
      this.errorEl.hidden = !message;
    }

    clearError() {
      this.showError("");
    }
  }

  function initMediaGallery(page) {
    const mainImage = page.querySelector("[data-gk-tryon-main-image]");
    if (!mainImage) {
      return;
    }

    page.querySelectorAll("[data-gk-tryon-thumb]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.dataset.gkMediaUrl;
        if (!url) {
          return;
        }

        mainImage.src = url;
        page.querySelectorAll("[data-gk-tryon-thumb]").forEach((item) => {
          item.classList.remove("is-active");
        });
        button.classList.add("is-active");
      });
    });
  }

  function init() {
    document.querySelectorAll("[data-gk-tryon-page]").forEach((page) => {
      initMediaGallery(page);
    });

    document.querySelectorAll("[data-gk-drobe-tryon]").forEach((root) => {
      new TryOnWidget(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
