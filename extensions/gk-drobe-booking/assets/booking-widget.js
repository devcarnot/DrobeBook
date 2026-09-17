(() => {
  function parseJson(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    const trimmed = text.trim();

    if (!trimmed) {
      throw new Error(`Booking API returned an empty response (${response.status}).`);
    }

    if (trimmed.startsWith("<")) {
      throw new Error(
        `Booking API unavailable (${response.status}). Make sure DrobeBook is running (shopify app dev) and refresh the page.`,
      );
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`Booking API returned invalid JSON (${response.status}).`);
    }
  }

  function formatIso(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addDays(date, days) {
    const result = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  function computeReturnDate(deliveryDate, durationDays) {
    return formatIso(
      addDays(new Date(`${deliveryDate}T12:00:00.000Z`), Math.max(durationDays - 1, 0)),
    );
  }

  function parseDurationDays(value) {
    const match = String(value || "").match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function formatMoney(cents, currency) {
    const amount = (Number(cents) / 100).toFixed(2);
    if (currency === "AUD" || !currency) {
      return `$${amount}`;
    }
    return `${currency} ${amount}`;
  }

  function formatDisplayDate(iso) {
    if (!iso) return "…";
    const date = new Date(`${iso}T12:00:00.000Z`);
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function isBetweenInclusive(iso, startIso, endIso) {
    if (!startIso || !endIso) return false;
    return iso >= startIso && iso <= endIso;
  }

  function normalizeShopifyId(id) {
    const text = String(id ?? "").trim();
    const match = text.match(/(\d+)$/);
    return match ? match[1] : text;
  }

  class GkDrobeBookingWidget {
    constructor(root) {
      this.root = root;
      this.productId = normalizeShopifyId(root.dataset.productId);
      this.calendarRequestId = 0;
      this.productTitle = root.dataset.productTitle || "Gown";
      this.variants = parseJson(root.dataset.variants, []);
      this.options = parseJson(root.dataset.options, []);
      this.colorPattern = parseJson(root.dataset.colorPattern, null);
      this.proxyBase = root.dataset.proxyBase || "/apps/gk-drobe";

      this.config = {
        deliveryInstructions: "",
        postageNote: "",
        pickupLabel: "Local Pickup",
        postLabel: "Post",
        damageProtectionPrice: "19.95",
        damageProtectionVariantId: "",
        damageProtectionMoreInfoUrl: "",
        damageProtectionLabel: "Add Damage Protection",
        moreInfoLabel: "More Info",
        buttonLabelPending: "Select dates first",
        buttonLabelReady: "Add hire to cart",
        hireTerms: [],
        fontFamily: "",
      };

      this.state = {
        size: "",
        durationLabel: "",
        durationDays: 4,
        color: "",
        deliveryMethod: "post",
        deliveryDate: "",
        returnDate: "",
        previewStartDate: "",
        eventDate: "",
        damageProtection: false,
        acceptedTerms: {},
        calendarYear: new Date().getFullYear(),
        calendarMonth: new Date().getMonth() + 1,
        unavailableDates: new Set(),
        loadingCalendar: false,
        waitlistClaim: null,
      };

      this.cacheDom();
      this.colors = this.resolveColors();
      this.updateColorGroupVisibility();
      this.updateDurationGroupVisibility();
      this.bindEvents();
      this.bootstrapUi();
      this.loadConfig().then(async () => {
        this.applyUrlPrefill();
        this.loadWaitlistClaimFromUrl();
        this.renderDeliveryButtons();
        this.syncDurationSelection();
        this.renderDurationButtons();
        this.updateDurationGroupVisibility();
        this.updateSummary();
        await this.loadCalendarAvailability();
      });
    }

    bootstrapUi() {
      this.renderColorButtons();
      this.renderDeliveryButtons();
      this.renderSizeButtons();
      this.renderDurationButtons();
      this.applyDefaults();
      this.renderCalendar();
      this.updateSummary();
    }

    cacheDom() {
      this.sizeButtonsEl = this.root.querySelector("[data-gk-size-buttons]");
      this.durationButtonsEl = this.root.querySelector("[data-gk-duration-buttons]");
      this.colorButtonsEl = this.root.querySelector("[data-gk-color-buttons]");
      this.deliveryButtonsEl = this.root.querySelector("[data-gk-delivery-buttons]");
      this.instructionsEl = this.root.querySelector("[data-gk-instructions]");
      this.postageEl = this.root.querySelector("[data-gk-postage]");
      this.eventDateInput = this.root.querySelector("[data-gk-event-date]");
      this.damageCheckbox = this.root.querySelector("[data-gk-damage-protection]");
      this.damageInfoLink = this.root.querySelector("[data-gk-damage-info]");
      this.calendarGrid = this.root.querySelector("[data-gk-calendar-grid]");
      this.calendarLabel = this.root.querySelector("[data-gk-calendar-label]");
      this.prevMonthButton = this.root.querySelector("[data-gk-prev-month]");
      this.nextMonthButton = this.root.querySelector("[data-gk-next-month]");
      this.deliveryDateEl = this.root.querySelector("[data-gk-delivery-date-display]");
      this.returnDateEl = this.root.querySelector("[data-gk-return-date-display]");
      this.hireCostEl = this.root.querySelector("[data-gk-hire-cost]");
      this.damagePriceEl = this.root.querySelector("[data-gk-damage-price]");
      this.submitButton = this.root.querySelector("[data-gk-submit]");
      this.errorEl = this.root.querySelector("[data-gk-error]");
      this.loadingEl = this.root.querySelector("[data-gk-loading]");
      this.colorGroupEl = this.root.querySelector("[data-gk-color-group]");
      this.durationGroupEl = this.root.querySelector("[data-gk-duration-group]");
      this.termsGroupEl = this.root.querySelector("[data-gk-terms-group]");
      this.termsEl = this.root.querySelector("[data-gk-terms]");
      this.waitlistEl = this.root.querySelector("[data-gk-waitlist]");
      this.waitlistToggle = this.root.querySelector("[data-gk-waitlist-toggle]");
      this.waitlistForm = this.root.querySelector("[data-gk-waitlist-form]");
      this.waitlistEmailInput = this.root.querySelector("[data-gk-waitlist-email]");
      this.waitlistNameInput = this.root.querySelector("[data-gk-waitlist-name]");
      this.waitlistNotesInput = this.root.querySelector("[data-gk-waitlist-notes]");
      this.waitlistSubmitButton = this.root.querySelector("[data-gk-waitlist-submit]");
      this.waitlistMessageEl = this.root.querySelector("[data-gk-waitlist-message]");
      this.waitlistClaimEl = this.root.querySelector("[data-gk-waitlist-claim]");
    }

    resolveColors() {
      if (Array.isArray(this.colorPattern) && this.colorPattern.length) {
        return this.colorPattern.map((entry) => ({
          name: entry.label || entry.name || String(entry),
          hex: entry.color || entry.hex || this.guessColorHex(entry.label || entry.name),
        }));
      }

      const colorValues = this.getOptionValues("Color");
      const colourValues = colorValues.length
        ? colorValues
        : this.getOptionValues("Colour");

      return colourValues.map((name) => ({
        name,
        hex: this.guessColorHex(name),
      }));
    }

    guessColorHex(name) {
      const normalized = String(name || "").trim().toLowerCase();
      const known = {
        espresso: "#3d2314",
        black: "#111111",
        white: "#f5f5f5",
        ivory: "#fffff0",
        champagne: "#f7e7ce",
        gold: "#d4af37",
        silver: "#c0c0c0",
        navy: "#001f3f",
        blue: "#1e6bb8",
        red: "#b00020",
        pink: "#f4c2c2",
        green: "#2d6a4f",
      };

      return known[normalized] || "#cccccc";
    }

    updateColorGroupVisibility() {
      if (this.colorGroupEl) {
        this.colorGroupEl.hidden = this.colors.length === 0;
      }
    }

    bindEvents() {
      this.eventDateInput?.addEventListener("change", () => {
        this.state.eventDate = this.eventDateInput.value;
        this.updateSummary();
      });

      this.damageCheckbox?.addEventListener("change", () => {
        this.state.damageProtection = this.damageCheckbox.checked;
        this.updateSummary();
      });

      this.prevMonthButton?.addEventListener("click", () => {
        this.shiftMonth(-1);
      });

      this.nextMonthButton?.addEventListener("click", () => {
        this.shiftMonth(1);
      });

      this.calendarGrid?.addEventListener("mouseleave", () => {
        this.state.previewStartDate = "";
        this.updateCalendarHighlights();
      });

      this.submitButton?.addEventListener("click", () => {
        this.addToCart();
      });

      this.waitlistToggle?.addEventListener("click", () => {
        if (this.waitlistForm) {
          this.waitlistForm.hidden = !this.waitlistForm.hidden;
        }
      });

      this.waitlistSubmitButton?.addEventListener("click", () => {
        this.submitWaitlist();
      });
    }

    async loadConfig() {
      try {
        const response = await fetch(`${this.proxyBase}/api/config`);
        if (!response.ok) return;
        const data = await readJsonResponse(response);
        this.config = { ...this.config, ...data };

        if (this.instructionsEl) {
          this.instructionsEl.textContent = this.config.deliveryInstructions;
          this.instructionsEl.hidden = !this.config.deliveryInstructions;
        }

        if (this.postageEl) {
          this.postageEl.textContent = this.config.postageNote;
          this.postageEl.hidden = !this.config.postageNote;
        }

        if (this.damageInfoLink && this.config.damageProtectionMoreInfoUrl) {
          this.damageInfoLink.href = this.config.damageProtectionMoreInfoUrl;
          this.damageInfoLink.hidden = false;
          this.damageInfoLink.target = "_blank";
          this.damageInfoLink.rel = "noopener noreferrer";
        }

        if (this.damageInfoLink && this.config.moreInfoLabel) {
          this.damageInfoLink.textContent = this.config.moreInfoLabel;
        }

        const damageLabel = this.root.querySelector("[data-gk-damage-label]");
        if (damageLabel && this.config.damageProtectionLabel) {
          damageLabel.textContent = this.config.damageProtectionLabel;
        }

        if (window.GkDrobeTheme) {
          window.GkDrobeTheme.apply(
            this.root,
            this.config.colors,
            this.config.fontFamily,
          );
        }

        this.renderHireTerms();
        this.updateWaitlistVisibility();
      } catch {
        // Storefront still works with block defaults.
      }
    }

    renderHireTerms() {
      if (!this.termsEl) {
        return;
      }

      const terms = Array.isArray(this.config.hireTerms)
        ? this.config.hireTerms.filter((entry) => entry?.label)
        : [];

      this.termsEl.innerHTML = "";
      this.state.acceptedTerms = {};

      if (!terms.length) {
        if (this.termsGroupEl) {
          this.termsGroupEl.hidden = true;
        }
        return;
      }

      if (this.termsGroupEl) {
        this.termsGroupEl.hidden = false;
      }

      terms.forEach((term, index) => {
        const termId = term.id || `term-${index + 1}`;
        const label = document.createElement("label");
        label.className = "gk-drobe-booking__term";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.termId = termId;
        checkbox.addEventListener("change", () => {
          this.state.acceptedTerms[termId] = checkbox.checked;
          this.updateSummary();
        });

        const text = document.createElement("span");
        text.textContent = term.label;

        label.appendChild(checkbox);
        label.appendChild(text);
        this.termsEl.appendChild(label);
      });
    }

    allTermsAccepted() {
      const terms = Array.isArray(this.config.hireTerms)
        ? this.config.hireTerms.filter((entry) => entry?.label)
        : [];

      if (!terms.length) {
        return true;
      }

      return terms.every((term, index) => {
        const termId = term.id || `term-${index + 1}`;
        return Boolean(this.state.acceptedTerms[termId]);
      });
    }

    async checkAvailabilityBeforeCart() {
      const variant = this.getSelectedVariant();
      if (!variant || !this.state.deliveryDate) {
        return { available: false, reason: "Please select size and delivery date." };
      }

      const params = new URLSearchParams({
        productId: this.productId,
        variantId: normalizeShopifyId(variant.id),
        deliveryDate: this.state.deliveryDate,
        durationDays: String(this.state.durationDays),
        deliveryMethod: this.state.deliveryMethod,
      });

      const response = await fetch(`${this.proxyBase}/api/availability?${params.toString()}`);
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not verify availability.");
      }

      return data;
    }

    async submitWaitlist() {
      const email = this.waitlistEmailInput?.value?.trim();
      const variant = this.getSelectedVariant();

      if (!email) {
        this.showWaitlistMessage("Please enter your email address.", true);
        return;
      }

      this.waitlistSubmitButton.disabled = true;
      this.showWaitlistMessage("");

      const formData = new FormData();
      formData.set("productId", this.productId);
      formData.set("productTitle", this.productTitle || "");
      formData.set("variantId", variant ? String(variant.id) : "");
      formData.set("size", this.state.size || "");
      formData.set("eventDate", this.state.eventDate || this.eventDateInput?.value || "");
      formData.set("email", email);
      formData.set("name", this.waitlistNameInput?.value || "");
      formData.set("notes", this.waitlistNotesInput?.value || "");

      try {
        const response = await fetch(`${this.proxyBase}/api/waitlist`, {
          method: "POST",
          body: formData,
        });
        const data = await readJsonResponse(response);

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Could not join waitlist.");
        }

        this.showWaitlistMessage(data.message || "Added to waitlist.", false);
        if (this.waitlistForm) {
          this.waitlistForm.hidden = true;
        }
      } catch (error) {
        this.showWaitlistMessage(error.message, true);
      } finally {
        this.waitlistSubmitButton.disabled = false;
      }
    }

    showWaitlistMessage(message, isError) {
      if (!this.waitlistMessageEl) {
        return;
      }

      this.waitlistMessageEl.textContent = message;
      this.waitlistMessageEl.hidden = !message;
      this.waitlistMessageEl.style.background = isError
        ? "rgba(176, 0, 32, 0.06)"
        : "rgba(0, 128, 96, 0.08)";
      this.waitlistMessageEl.style.color = isError ? "#8a0018" : "#004c3f";
    }

    updateWaitlistVisibility() {
      if (!this.waitlistEl) {
        return;
      }

      const unavailableSelected =
        Boolean(this.state.deliveryDate) &&
        this.state.unavailableDates.has(this.state.deliveryDate);
      const noDatesAvailable =
        !this.state.loadingCalendar &&
        this.state.unavailableDates.size > 0 &&
        !this.canFindAvailableDateInMonth();

      this.waitlistEl.hidden = !(unavailableSelected || noDatesAvailable);
    }

    canFindAvailableDateInMonth() {
      const daysInMonth = new Date(
        Date.UTC(this.state.calendarYear, this.state.calendarMonth, 0),
      ).getUTCDate();

      for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = formatIso(
          new Date(Date.UTC(this.state.calendarYear, this.state.calendarMonth - 1, day)),
        );
        if (!this.state.unavailableDates.has(iso)) {
          return true;
        }
      }

      return false;
    }

    async loadWaitlistClaimFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const claimToken = params.get("gk_claim")?.trim();
      if (!claimToken || !this.waitlistClaimEl) {
        return;
      }

      try {
        const response = await fetch(
          `${this.proxyBase}/api/waitlist-claim?token=${encodeURIComponent(claimToken)}`,
        );
        const data = await readJsonResponse(response);
        if (!data.valid) {
          this.waitlistClaimEl.textContent =
            data.error || "This priority access link is no longer valid.";
          this.waitlistClaimEl.hidden = false;
          return;
        }

        this.state.waitlistClaim = data;
        if (this.waitlistEmailInput && data.email) {
          this.waitlistEmailInput.value = data.email;
        }
        if (data.size && !this.state.size) {
          this.state.size = data.size;
          this.renderSizeButtons();
        }

        const expires = data.expiresAt
          ? new Date(data.expiresAt).toLocaleString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "soon";

        this.waitlistClaimEl.textContent = `You have priority access to book this gown until ${expires}.`;
        this.waitlistClaimEl.hidden = false;
      } catch {
        // Ignore claim validation errors on storefront.
      }
    }

    getOptionIndex(optionName) {
      return this.options.findIndex(
        (entry) => entry.name.toLowerCase() === optionName.toLowerCase(),
      );
    }

    getVariantOptionValue(variant, optionIndex) {
      if (optionIndex === 0) return variant.option1;
      if (optionIndex === 1) return variant.option2;
      if (optionIndex === 2) return variant.option3;
      return null;
    }

    getOptionValues(optionName) {
      const option = this.options.find(
        (entry) => entry.name.toLowerCase() === optionName.toLowerCase(),
      );
      return option ? option.values : [];
    }

    getDurationOptions() {
      const durationIndex = this.getOptionIndex("Duration");
      if (durationIndex >= 0) {
        const values = this.getOptionValues("Duration");
        if (values.length) {
          return values.map((label) => ({
            label,
            days: parseDurationDays(label) || 4,
          }));
        }
      }

      return [
        { label: "4 Days", days: 4 },
        { label: "8 Days", days: 8 },
      ];
    }

    updateDurationGroupVisibility() {
      const durations = this.getDurationOptions();
      if (this.durationGroupEl) {
        this.durationGroupEl.hidden = durations.length <= 1;
      }
    }

    syncDurationSelection() {
      const durations = this.getDurationOptions();
      if (!durations.length) {
        return;
      }

      const current =
        durations.find((entry) => entry.days === this.state.durationDays) ||
        durations.find((entry) => entry.label === this.state.durationLabel) ||
        durations[0];

      this.state.durationLabel = current.label;
      this.state.durationDays = current.days;
    }

    findVariantForSizeAndDays(size, days) {
      const sizeIndex = this.getOptionIndex("Size");
      const durationIndex = this.getOptionIndex("Duration");

      return this.variants.find((variant) => {
        const variantSize =
          sizeIndex >= 0 ? this.getVariantOptionValue(variant, sizeIndex) : null;
        const variantDuration =
          durationIndex >= 0
            ? this.getVariantOptionValue(variant, durationIndex)
            : null;
        const variantDays = parseDurationDays(variantDuration);

        const sizeMatch = !size || variantSize === size;
        const durationMatch =
          durationIndex < 0 || !days || variantDays === days;

        return sizeMatch && durationMatch;
      });
    }

    getVariantsForSize(size) {
      const sizeIndex = this.getOptionIndex("Size");
      return this.variants.filter((variant) => {
        if (!size) return true;
        const variantSize =
          sizeIndex >= 0 ? this.getVariantOptionValue(variant, sizeIndex) : null;
        return variantSize === size;
      });
    }

    getSelectedVariant() {
      return this.findVariantForSizeAndDays(this.state.size, this.state.durationDays);
    }

    buildItemDescriptor() {
      const descriptorParts = [this.state.size, this.state.durationLabel];
      if (this.state.color) {
        descriptorParts.push(this.state.color);
      }

      return `${this.productTitle} [${descriptorParts.join(" / ")}]`;
    }

    createBookingId() {
      if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
      }

      return `gk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    createChoiceButton(label, selected, onClick, extraClass) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `gk-drobe-booking__choice${selected ? " gk-drobe-booking__choice--selected" : ""}${extraClass ? ` ${extraClass}` : ""}`;
      button.textContent = label;
      button.addEventListener("click", onClick);
      return button;
    }

    renderSizeButtons() {
      if (!this.sizeButtonsEl) return;
      const sizes = this.getOptionValues("Size");
      this.sizeButtonsEl.innerHTML = "";

      sizes.forEach((size) => {
        const count = this.getVariantsForSize(size).filter((v) => v.available).length;
        const label = `${size} (${count})`;
        const button = this.createChoiceButton(
          label,
          this.state.size === size,
          () => {
            this.state.size = size;
            this.state.deliveryDate = "";
            this.state.returnDate = "";
            this.state.previewStartDate = "";
            this.renderSizeButtons();
            this.renderDurationButtons();
            this.onSelectionChanged();
          },
        );
        this.sizeButtonsEl.appendChild(button);
      });
    }

    renderDurationButtons() {
      if (!this.durationButtonsEl) return;
      const durations = this.getDurationOptions();
      this.durationButtonsEl.innerHTML = "";

      durations.forEach(({ label, days }) => {
        const variant = this.findVariantForSizeAndDays(this.state.size, days);

        const priceLabel = variant
          ? `${label} – ${formatMoney(variant.price, variant.currency || "AUD")}`
          : label;

        const button = this.createChoiceButton(
          priceLabel,
          this.state.durationDays === days,
          () => {
            this.state.durationLabel = label;
            this.state.durationDays = days;
            this.state.deliveryDate = "";
            this.state.returnDate = "";
            this.state.previewStartDate = "";
            this.renderDurationButtons();
            this.onSelectionChanged();
          },
        );

        if (!variant) {
          button.disabled = true;
          button.title =
            "No product variant matches this hire duration. Add a matching Duration variant in Shopify.";
        }

        this.durationButtonsEl.appendChild(button);
      });
    }

    renderColorButtons() {
      if (!this.colorButtonsEl) return;
      this.colorButtonsEl.innerHTML = "";

      this.colors.forEach((color) => {
        const button = this.createChoiceButton(
          color.name,
          this.state.color === color.name,
          () => {
            this.state.color = color.name;
            this.renderColorButtons();
          },
          "gk-drobe-booking__choice--color",
        );

        const swatch = document.createElement("span");
        swatch.className = "gk-drobe-booking__swatch";
        swatch.style.backgroundColor = color.hex || "#ccc";
        button.prepend(swatch);

        this.colorButtonsEl.appendChild(button);
      });
    }

    renderDeliveryButtons() {
      if (!this.deliveryButtonsEl) return;
      this.deliveryButtonsEl.innerHTML = "";

      const methods = [
        { id: "post", label: this.config.postLabel || "Post" },
        { id: "pickup", label: this.config.pickupLabel || "Local Pickup" },
      ];

      methods.forEach((method) => {
        const button = this.createChoiceButton(
          method.label,
          this.state.deliveryMethod === method.id,
          () => {
            this.state.deliveryMethod = method.id;
            this.renderDeliveryButtons();
            this.loadCalendarAvailability();
          },
        );
        this.deliveryButtonsEl.appendChild(button);
      });
    }

    applyUrlPrefill() {
      const params = new URLSearchParams(window.location.search);
      const eventDate = params.get("eventDate") || params.get("date");
      const deliveryMethod = params.get("deliveryMethod");
      const size = params.get("size");
      const durationDays = params.get("durationDays");

      if (eventDate && this.eventDateInput) {
        this.eventDateInput.value = eventDate;
        this.state.eventDate = eventDate;
      }

      if (deliveryMethod === "pickup" || deliveryMethod === "post") {
        this.state.deliveryMethod = deliveryMethod;
      }

      if (size) {
        this.state.size = size;
      }

      if (durationDays) {
        const parsedDays = Number.parseInt(durationDays, 10);
        const durations = this.getDurationOptions();
        const match = durations.find((entry) => entry.days === parsedDays);
        if (match) {
          this.state.durationDays = match.days;
          this.state.durationLabel = match.label;
        }
      }
    }

    applyDefaults() {
      const sizes = this.getOptionValues("Size");
      if (sizes.length && !this.state.size) {
        const firstAvailable =
          sizes.find((size) =>
            this.getVariantsForSize(size).some((variant) => variant.available),
          ) || sizes[0];
        this.state.size = firstAvailable;
      }

      const durations = this.getDurationOptions();
      if (durations.length && !this.state.durationLabel) {
        this.state.durationLabel = durations[0].label;
        this.state.durationDays = durations[0].days;
      }

      if (this.colors.length && !this.state.color) {
        this.state.color = this.colors[0].name;
      }

      this.renderSizeButtons();
      this.renderDurationButtons();
      this.updateDurationGroupVisibility();
      this.renderColorButtons();
      this.renderDeliveryButtons();
    }

    async onSelectionChanged() {
      this.updateSummary();
      await this.loadCalendarAvailability();
    }

    shiftMonth(delta) {
      let month = this.state.calendarMonth + delta;
      let year = this.state.calendarYear;

      if (month < 1) {
        month = 12;
        year -= 1;
      } else if (month > 12) {
        month = 1;
        year += 1;
      }

      this.state.calendarMonth = month;
      this.state.calendarYear = year;
      this.state.previewStartDate = "";
      this.loadCalendarAvailability();
    }

    async loadCalendarAvailability() {
      const variant = this.getSelectedVariant();
      if (!variant) {
        this.state.unavailableDates = new Set();
        this.state.loadingCalendar = false;
        if (this.loadingEl) {
          this.loadingEl.hidden = true;
        }
        this.showError(
          "No variant matches this size and hire duration. Update Shopify Duration variants or your hire duration settings.",
        );
        return;
      }

      const requestId = ++this.calendarRequestId;
      const variantId = normalizeShopifyId(variant.id);

      this.state.loadingCalendar = true;
      if (this.loadingEl) {
        this.loadingEl.hidden = false;
      }
      this.clearError();

      const params = new URLSearchParams({
        productId: this.productId,
        variantId,
        durationDays: String(this.state.durationDays),
        deliveryMethod: this.state.deliveryMethod,
        year: String(this.state.calendarYear),
        month: String(this.state.calendarMonth),
      });

      try {
        const response = await fetch(
          `${this.proxyBase}/api/availability-calendar?${params.toString()}`,
        );
        const data = await readJsonResponse(response);

        if (requestId !== this.calendarRequestId) {
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || "Could not load availability");
        }

        this.state.unavailableDates = new Set(data.unavailableDates || []);
      } catch (error) {
        if (requestId !== this.calendarRequestId) {
          return;
        }
        this.showError(error.message);
        this.state.unavailableDates = new Set();
      } finally {
        if (requestId !== this.calendarRequestId) {
          return;
        }
        this.state.loadingCalendar = false;
        if (this.loadingEl) {
          this.loadingEl.hidden = true;
        }
        this.updateWaitlistVisibility();
        this.renderCalendar();
      }
    }

    updateCalendarHighlights() {
      const selectedEndDate = this.state.deliveryDate
        ? computeReturnDate(this.state.deliveryDate, this.state.durationDays)
        : "";
      const previewEnd = this.state.previewStartDate
        ? computeReturnDate(this.state.previewStartDate, this.state.durationDays)
        : "";

      this.calendarGrid.querySelectorAll("[data-gk-date]").forEach((button) => {
        const iso = button.dataset.gkDate;
        button.classList.remove(
          "gk-drobe-booking__day--selected-range",
          "gk-drobe-booking__day--preview-range",
          "gk-drobe-booking__day--range-start",
          "gk-drobe-booking__day--range-end",
        );

        const inSelectedRange = isBetweenInclusive(
          iso,
          this.state.deliveryDate,
          selectedEndDate,
        );
        const inPreviewRange =
          this.state.previewStartDate &&
          isBetweenInclusive(iso, this.state.previewStartDate, previewEnd);

        if (inSelectedRange) {
          button.classList.add("gk-drobe-booking__day--selected-range");
          if (iso === this.state.deliveryDate) {
            button.classList.add("gk-drobe-booking__day--range-start");
          }
          if (iso === selectedEndDate) {
            button.classList.add("gk-drobe-booking__day--range-end");
          }
        } else if (inPreviewRange) {
          button.classList.add("gk-drobe-booking__day--preview-range");
        }
      });
    }

    renderCalendar() {
      if (!this.calendarGrid || !this.calendarLabel) return;

      const monthDate = new Date(
        Date.UTC(this.state.calendarYear, this.state.calendarMonth - 1, 1),
      );
      const monthName = monthDate.toLocaleString("en-AU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      this.calendarLabel.textContent = monthName;

      const firstWeekday = monthDate.getUTCDay();
      const daysInMonth = new Date(
        Date.UTC(this.state.calendarYear, this.state.calendarMonth, 0),
      ).getUTCDate();

      this.calendarGrid.innerHTML = "";

      ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach((weekday) => {
        const label = document.createElement("div");
        label.className = "gk-drobe-booking__weekday";
        label.textContent = weekday;
        this.calendarGrid.appendChild(label);
      });

      for (let i = 0; i < firstWeekday; i += 1) {
        const empty = document.createElement("div");
        empty.className = "gk-drobe-booking__day gk-drobe-booking__day--empty";
        this.calendarGrid.appendChild(empty);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = formatIso(
          new Date(Date.UTC(this.state.calendarYear, this.state.calendarMonth - 1, day)),
        );
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gk-drobe-booking__day";
        button.dataset.gkDate = iso;
        button.textContent = String(day);

        const unavailable = this.state.unavailableDates.has(iso);
        if (unavailable) {
          button.classList.add("gk-drobe-booking__day--unavailable");
          button.disabled = true;
        }

        button.addEventListener("mouseenter", () => {
          if (button.disabled) return;
          this.state.previewStartDate = iso;
          this.updateCalendarHighlights();
        });

        button.addEventListener("click", () => {
          this.selectDeliveryDate(iso);
        });

        this.calendarGrid.appendChild(button);
      }

      this.updateCalendarHighlights();
    }

    selectDeliveryDate(iso) {
      if (this.state.deliveryDate) {
        const selectedEndDate = computeReturnDate(
          this.state.deliveryDate,
          this.state.durationDays,
        );

        if (isBetweenInclusive(iso, this.state.deliveryDate, selectedEndDate)) {
          this.clearDeliveryDate();
          return;
        }
      }

      this.state.deliveryDate = iso;
      this.state.returnDate = computeReturnDate(iso, this.state.durationDays);
      this.state.previewStartDate = "";
      this.updateCalendarHighlights();
      this.updateSummary();
      this.updateWaitlistVisibility();
      this.clearError();
    }

    clearDeliveryDate() {
      this.state.deliveryDate = "";
      this.state.returnDate = "";
      this.state.previewStartDate = "";
      this.updateCalendarHighlights();
      this.updateSummary();
      this.updateWaitlistVisibility();
      this.clearError();
    }

    updateSummary() {
      const variant = this.getSelectedVariant();

      this.deliveryDateEl.textContent = formatDisplayDate(this.state.deliveryDate);
      this.returnDateEl.textContent = formatDisplayDate(this.state.returnDate);

      if (variant) {
        this.hireCostEl.textContent = formatMoney(variant.price, variant.currency || "AUD");
      } else {
        this.hireCostEl.textContent = "—";
      }

      this.damagePriceEl.textContent = this.state.damageProtection
        ? `$${this.config.damageProtectionPrice}`
        : "—";

      const ready = this.canSubmit();
      this.submitButton.disabled = !ready;
      this.submitButton.textContent = ready
        ? this.config.buttonLabelReady || "Add hire to cart"
        : this.config.buttonLabelPending || "Select dates first";

      this.updateWaitlistVisibility();
    }

    canSubmit() {
      return Boolean(
        this.getSelectedVariant() &&
          this.state.deliveryDate &&
          this.state.eventDate &&
          this.allTermsAccepted(),
      );
    }

    showError(message) {
      this.errorEl.textContent = message;
      this.errorEl.hidden = !message;
    }

    clearError() {
      this.showError("");
    }

    async addToCart() {
      const variant = this.getSelectedVariant();
      if (!variant) {
        this.showError("Please select a size and duration.");
        return;
      }

      if (!this.state.deliveryDate) {
        this.showError("Please choose a delivery date.");
        return;
      }

      if (!this.state.eventDate) {
        this.showError("Please enter your event date.");
        return;
      }

      if (!this.allTermsAccepted()) {
        this.showError("Please accept all hire terms before continuing.");
        return;
      }

      if (
        this.state.damageProtection &&
        !this.config.damageProtectionVariantId
      ) {
        this.showError(
          "Damage protection is not configured yet. Ask the store admin to choose a protection product in Gown Hire settings.",
        );
        return;
      }

      this.submitButton.disabled = true;
      this.clearError();

      try {
        const availability = await this.checkAvailabilityBeforeCart();
        if (!availability.available) {
          throw new Error(
            availability.reason ||
              "Those dates are no longer available. Please choose different dates or join the waitlist.",
          );
        }
      } catch (error) {
        this.showError(error.message);
        this.updateSummary();
        return;
      }

      const bookingId = this.createBookingId();

      const properties = {
        _Size: this.state.size,
        _Duration: this.state.durationLabel,
        ...(this.state.color ? { Color: this.state.color } : {}),
        "Delivery Method":
          this.state.deliveryMethod === "pickup"
            ? this.config.pickupLabel || "Local Pickup"
            : this.config.postLabel || "Post",
        "Delivery Date": formatDisplayDate(this.state.deliveryDate),
        "Return Date": formatDisplayDate(this.state.returnDate),
        "Event Date": formatDisplayDate(this.state.eventDate),
        _gk_booking_id: bookingId,
      };

      const items = [
        {
          id: variant.id,
          quantity: 1,
          properties,
        },
      ];

      if (this.state.damageProtection && this.config.damageProtectionVariantId) {
        items.push({
          id: Number(this.config.damageProtectionVariantId),
          quantity: 1,
          properties: {
            "For item": this.buildItemDescriptor(),
            _gk_linked_booking_id: bookingId,
          },
        });
      }

      try {
        const response = await fetch(`${window.Shopify?.routes?.root || "/"}cart/add.js`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ items }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.description || data.message || "Could not add to cart");
        }

        window.location.href = `${window.Shopify?.routes?.root || "/"}cart`;
      } catch (error) {
        this.showError(error.message);
        this.updateSummary();
      }
    }
  }

  async function shouldShowBookingWidget(root) {
    const productId = root.dataset.productId;
    if (!productId) {
      return false;
    }

    const proxyBase = root.dataset.proxyBase || "/apps/gk-drobe";
    const response = await fetch(
      `${proxyBase}/api/product-rental-status?productId=${encodeURIComponent(productId)}`,
    );
    const data = await readJsonResponse(response);

    return Boolean(data.rentalEnabled);
  }

  function removeBookingShell(root) {
    const shell = root.closest("[data-gk-booking-shell]") || root;
    shell.remove();
  }

  async function initWidgets() {
    const roots = document.querySelectorAll("[data-gk-drobe-booking]");

    for (const root of roots) {
      if (root.dataset.initialized) {
        continue;
      }

      root.dataset.initialized = "true";
      const shell = root.closest("[data-gk-booking-shell]") || root;

      try {
        const enabled = await shouldShowBookingWidget(root);
        if (!enabled) {
          removeBookingShell(root);
          continue;
        }

        shell.hidden = false;
        new GkDrobeBookingWidget(root);
      } catch {
        removeBookingShell(root);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void initWidgets();
    });
  } else {
    void initWidgets();
  }
})();
