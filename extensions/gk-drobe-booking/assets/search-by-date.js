(() => {
  function formatDisplayDate(iso) {
    if (!iso) return "";
    const date = new Date(`${iso}T12:00:00.000Z`);
    return date.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  class SearchByDate {
    constructor(root) {
      this.root = root;
      this.proxyBase = root.dataset.proxyBase || "/apps/gk-drobe";
      this.collectionHandle = root.dataset.collectionHandle || "all";
      this.rootUrl = root.dataset.rootUrl || "/";
      this.displayMode = root.dataset.displayMode || "landing";
      this.resultsUrl = root.dataset.resultsUrl || "/pages/search-by-date";
      this.products = [];
      this.filteredProducts = [];
      this.searchConfig = {};

      this.cacheElements();
      this.bindEvents();
      this.loadTheme().then(() => this.bootstrap());
    }

    isLandingMode() {
      return this.displayMode === "landing";
    }

    isResultsMode() {
      return this.displayMode === "results";
    }

    async loadTheme() {
      try {
        const configResponse = await fetch(`${this.proxyBase}/api/search-config`);

        if (configResponse.ok) {
          this.searchConfig = await configResponse.json();
          this.applySearchConfig();
          this.applySearchColors();
        }
      } catch {
        // Theme defaults apply from CSS.
      }
    }

    bootstrap() {
      if (this.isLandingMode()) {
        return;
      }

      const urlParams = this.readUrlSearchParams();
      if (urlParams.eventDate && urlParams.size) {
        this.applyParamsToForm(urlParams);
        this.showResultsView();
        this.runSearch();
      }
    }

    readUrlSearchParams() {
      const params = new URLSearchParams(window.location.search);
      return {
        eventDate: params.get("date") || params.get("eventDate") || "",
        size: params.get("size") || "",
        durationDays:
          params.get("durationDays") ||
          String(this.searchConfig.defaultDurationDays || 4),
      };
    }

    applyParamsToForm({ eventDate, size, durationDays }) {
      if (this.eventDateInput && eventDate) {
        this.eventDateInput.value = eventDate;
      }
      if (this.sizeSelect && size) {
        this.sizeSelect.value = size;
      }
      if (this.durationSelect && durationDays) {
        this.durationSelect.value = durationDays;
      }
    }

    getResultsPageUrl() {
      const configured = this.searchConfig.resultsPageUrl || this.resultsUrl;
      if (!configured) {
        return "/pages/search-by-date";
      }

      try {
        return new URL(configured, window.location.origin).pathname;
      } catch {
        return configured.startsWith("/") ? configured : `/${configured}`;
      }
    }

    redirectToResults() {
      const params = this.getSearchParams();
      if (!params.eventDate || !params.size) {
        this.showError("Please choose an event date and size.");
        return;
      }

      this.clearError();
      const destination = new URL(this.getResultsPageUrl(), window.location.origin);
      destination.searchParams.set("date", params.eventDate);
      destination.searchParams.set("size", params.size);
      destination.searchParams.set("durationDays", params.durationDays);
      window.location.assign(destination.toString());
    }

    updateBrowserUrl() {
      if (!this.isResultsMode()) {
        return;
      }

      const params = this.getSearchParams();
      const url = new URL(window.location.href);
      url.searchParams.set("date", params.eventDate);
      url.searchParams.set("size", params.size);
      url.searchParams.set("durationDays", params.durationDays);
      window.history.replaceState({}, "", url.toString());
    }

    showResultsView() {
      if (this.landingFormWrap) {
        this.landingFormWrap.hidden = true;
      }
      if (this.filtersBar) {
        this.filtersBar.hidden = false;
      }
      if (this.resultsSection) {
        this.resultsSection.hidden = false;
      }
    }

    applySearchColors() {
      const colors = this.searchConfig?.colors;
      if (!colors) {
        return;
      }

      const section =
        this.root.closest(".gk-drobe-search-section") || this.root.parentElement;

      const cssVars = {
        sectionBg: "--gk-search-section-bg",
        titleText: "--gk-search-title-text",
        labelText: "--gk-label-text",
        buttonBg: "--gk-button-bg",
        buttonText: "--gk-button-text",
        inputBg: "--gk-search-input-bg",
        inputBorder: "--gk-search-input-border",
      };

      const targets = section ? [this.root, section] : [this.root];

      Object.entries(cssVars).forEach(([key, cssVar]) => {
        if (colors[key]) {
          targets.forEach((element) => {
            element.style.setProperty(cssVar, colors[key]);
          });
        }
      });
    }

    applySearchConfig() {
      const config = this.searchConfig || {};
      const title = this.root.querySelector(".gk-drobe-search__title");
      const submitButton = this.form?.querySelector('button[type="submit"]');
      const eventDateLabel = this.root.querySelector('label[for="gk-search-event-date"]');
      const sizeLabel = this.root.querySelector('label[for="gk-search-size"]');

      if (title && config.pageTitle) {
        title.textContent = config.pageTitle;
      }
      if (submitButton && config.formButtonLabel) {
        submitButton.textContent = config.formButtonLabel;
      }
      if (eventDateLabel && config.eventDateLabel) {
        eventDateLabel.textContent = config.eventDateLabel;
      }
      if (sizeLabel && config.sizeLabel) {
        sizeLabel.textContent = config.sizeLabel;
      }
      if (this.sizeSelect && config.sizeOptions) {
        this.populateSizeOptions(config);
      } else if (this.sizeSelect?.querySelector('option[value=""]') && config.sizePlaceholder) {
        this.sizeSelect.querySelector('option[value=""]').textContent = config.sizePlaceholder;
      }
      if (this.refineButton && config.refineSearchLabel) {
        this.refineButton.textContent = config.refineSearchLabel;
      }
      if (this.resultsLoading && config.loadingLabel) {
        this.resultsLoading.textContent = config.loadingLabel;
      }
      if (this.resultsEmpty && config.emptyResultsLabel) {
        this.resultsEmpty.textContent = config.emptyResultsLabel;
      }
      if (this.durationSelect && config.defaultDurationDays) {
        this.durationSelect.value = String(config.defaultDurationDays);
      }
      if (config.collectionHandle && (!this.collectionHandle || this.collectionHandle === "all")) {
        this.collectionHandle = config.collectionHandle;
      }
      if (config.resultsPageUrl) {
        this.resultsUrl = config.resultsPageUrl;
      }
    }

    populateSizeOptions(config) {
      const selectedValue = this.sizeSelect.value;
      const sizes = String(config.sizeOptions || "")
        .split(",")
        .map((size) => size.trim())
        .filter(Boolean);

      if (sizes.length === 0) {
        return;
      }

      this.sizeSelect.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = config.sizePlaceholder || "Select size";
      this.sizeSelect.appendChild(placeholder);

      sizes.forEach((size) => {
        const option = document.createElement("option");
        option.value = size;
        option.textContent = size;
        this.sizeSelect.appendChild(option);
      });

      if (selectedValue && sizes.includes(selectedValue)) {
        this.sizeSelect.value = selectedValue;
      }
    }

    cacheElements() {
      this.form = this.root.querySelector("[data-gk-search-form]");
      this.landingFormWrap = this.root.querySelector("[data-gk-search-landing]");
      this.filtersBar = this.root.querySelector("[data-gk-search-filters]");
      this.resultsSection = this.root.querySelector("[data-gk-results]");
      this.eventDateInput = this.root.querySelector("#gk-search-event-date");
      this.sizeSelect = this.root.querySelector("#gk-search-size");
      this.durationSelect = this.root.querySelector("[data-gk-filter-duration]");
      this.deliverySelect = this.root.querySelector("[data-gk-filter-delivery]");
      this.deliveryDateInput = this.root.querySelector("[data-gk-filter-delivery-date]");
      this.returnDateInput = this.root.querySelector("[data-gk-filter-return-date]");
      this.sizeFilterInput = this.root.querySelector("[data-gk-filter-size]");
      this.refineButton = this.root.querySelector("[data-gk-refine-search]");
      this.resultsCount = this.root.querySelector("[data-gk-results-count]");
      this.resultsGrid = this.root.querySelector("[data-gk-results-grid]");
      this.resultsLoading = this.root.querySelector("[data-gk-results-loading]");
      this.resultsEmpty = this.root.querySelector("[data-gk-results-empty]");
      this.sortSelect = this.root.querySelector("[data-gk-sort]");
      this.sidebarSizes = this.root.querySelector("[data-gk-sidebar-sizes]");
      this.sidebarColours = this.root.querySelector("[data-gk-sidebar-colours]");
      this.sidebarDesigners = this.root.querySelector("[data-gk-sidebar-designers]");
      this.errorEl = this.root.querySelector("[data-gk-error]");
    }

    bindEvents() {
      this.form?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (this.isLandingMode()) {
          this.redirectToResults();
          return;
        }

        this.showResultsView();
        this.updateBrowserUrl();
        this.runSearch();
      });

      this.refineButton?.addEventListener("click", () => {
        this.updateBrowserUrl();
        this.runSearch();
      });
      this.sortSelect?.addEventListener("change", () => this.renderResults());
    }

    getSearchParams() {
      return {
        eventDate: this.eventDateInput?.value || "",
        size: this.sizeSelect?.value || "",
        durationDays: this.durationSelect?.value || "4",
        collection: this.collectionHandle,
      };
    }

    async runSearch() {
      const params = this.getSearchParams();
      if (!params.eventDate || !params.size) {
        this.showError("Please choose an event date and size.");
        return;
      }

      this.clearError();
      if (this.resultsSection) {
        this.resultsSection.hidden = false;
      }
      if (this.resultsLoading) {
        this.resultsLoading.hidden = false;
      }
      if (this.resultsEmpty) {
        this.resultsEmpty.hidden = true;
      }
      if (this.resultsGrid) {
        this.resultsGrid.innerHTML = "";
      }

      const query = new URLSearchParams({
        eventDate: params.eventDate,
        size: params.size,
        durationDays: params.durationDays,
        collection: params.collection,
      });

      try {
        const response = await fetch(
          `${this.proxyBase}/api/search-by-date?${query.toString()}`,
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Search failed");
        }

        this.products = data.products || [];
        this.filteredProducts = [...this.products];

        if (this.deliveryDateInput) {
          this.deliveryDateInput.value = formatDisplayDate(data.deliveryDate);
        }
        if (this.returnDateInput) {
          this.returnDateInput.value = formatDisplayDate(data.returnDate);
        }
        if (this.sizeFilterInput) {
          this.sizeFilterInput.value = data.size;
        }

        this.renderSidebar();
        this.renderResults();
      } catch (error) {
        this.showError(error.message);
      } finally {
        if (this.resultsLoading) {
          this.resultsLoading.hidden = true;
        }
      }
    }

    renderSidebar() {
      if (!this.sidebarSizes || !this.sidebarDesigners || !this.sidebarColours) {
        return;
      }

      const sizes = [...new Set(this.products.map((product) => product.availableSize))];
      const designers = [...new Set(this.products.map((product) => product.vendor))].sort();

      this.sidebarSizes.innerHTML = "";
      sizes.forEach((size) => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" checked data-filter-size="${size}"> ${size}`;
        label.querySelector("input").addEventListener("change", () => this.applySidebarFilters());
        this.sidebarSizes.appendChild(label);
      });

      this.sidebarDesigners.innerHTML = "";
      designers.forEach((designer) => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" checked data-filter-designer="${designer}"> ${designer}`;
        label.querySelector("input").addEventListener("change", () => this.applySidebarFilters());
        this.sidebarDesigners.appendChild(label);
      });

      this.sidebarColours.innerHTML = "";
      ["Black", "Blue", "Gold", "Green", "Pink"].forEach((colour) => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" checked disabled> ${colour}`;
        this.sidebarColours.appendChild(label);
      });
    }

    applySidebarFilters() {
      if (!this.sidebarDesigners) {
        return;
      }

      const activeDesigners = [...this.sidebarDesigners.querySelectorAll("input:checked")].map(
        (input) => input.dataset.filterDesigner,
      );

      this.filteredProducts = this.products.filter((product) =>
        activeDesigners.includes(product.vendor),
      );
      this.renderResults();
    }

    renderResults() {
      if (!this.resultsGrid || !this.resultsCount) {
        return;
      }

      const sorted = [...this.filteredProducts];
      if (this.sortSelect?.value === "price-asc") {
        sorted.sort(
          (a, b) =>
            Number(a.priceFrom.replace(/[^\d.]/g, "")) -
            Number(b.priceFrom.replace(/[^\d.]/g, "")),
        );
      } else if (this.sortSelect?.value === "price-desc") {
        sorted.sort(
          (a, b) =>
            Number(b.priceFrom.replace(/[^\d.]/g, "")) -
            Number(a.priceFrom.replace(/[^\d.]/g, "")),
        );
      }

      this.resultsCount.textContent = `${sorted.length} products found`;
      this.resultsGrid.innerHTML = "";
      if (this.resultsEmpty) {
        this.resultsEmpty.hidden = sorted.length > 0;
      }

      sorted.forEach((product) => {
        const link = document.createElement("a");
        link.className = "gk-drobe-search__card";
        link.href = `${this.rootUrl}products/${product.handle}?size=${encodeURIComponent(product.availableSize)}`;
        link.innerHTML = `
          <div class="gk-drobe-search__card-image">
            ${
              product.imageUrl
                ? `<img src="${product.imageUrl}" alt="${product.title}">`
                : ""
            }
          </div>
          <h3 class="gk-drobe-search__card-title">${product.title}</h3>
          <p class="gk-drobe-search__card-meta">${product.vendor}</p>
          <p class="gk-drobe-search__card-price">From ${product.priceFrom}</p>
          <p class="gk-drobe-search__card-price">${product.availableSize} (1)</p>
        `;
        this.resultsGrid.appendChild(link);
      });
    }

    showError(message) {
      if (!this.errorEl) {
        return;
      }
      this.errorEl.textContent = message;
      this.errorEl.hidden = !message;
    }

    clearError() {
      this.showError("");
    }
  }

  function init() {
    document.querySelectorAll("[data-gk-drobe-search]").forEach((root) => {
      new SearchByDate(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
