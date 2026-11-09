(() => {
  const FILTER_MOBILE_MQ = window.matchMedia("(max-width: 900px)");

  async function readJsonResponse(response) {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("<")) {
      throw new Error(
        "Search could not reach DrobeBook (store returned a web page instead of data). Check that the app is installed and the GK.Drobe app proxy is enabled.",
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Search returned an invalid response. Try again in a moment.");
    }
  }

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
      this.availableSizes = [];
      this.preferredSize = "";
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
          this.searchConfig = await readJsonResponse(configResponse);
          this.applyThemeFonts();
          this.applySearchConfig();
          this.applySearchColors();
        } else {
          this.applyThemeFonts();
        }
      } catch {
        // Theme defaults apply from CSS / storefront fonts.
        this.applyThemeFonts();
      }
    }

    applyThemeFonts() {
      const section =
        this.root.closest(".gk-drobe-search-section") || this.root.parentElement;
      const rootStyles = getComputedStyle(document.documentElement);
      const bodyStyles = getComputedStyle(document.body);
      const themeBodyFont =
        rootStyles.getPropertyValue("--font-body-family").trim() ||
        rootStyles.getPropertyValue("--font-body").trim() ||
        bodyStyles.fontFamily;
      const themeHeadingFont =
        rootStyles.getPropertyValue("--font-heading-family").trim() ||
        rootStyles.getPropertyValue("--font-heading").trim() ||
        themeBodyFont;

      const targets = [this.root];
      if (section) {
        targets.push(section);
      }

      targets.forEach((element) => {
        if (themeBodyFont) {
          element.style.setProperty("--gk-font-family", themeBodyFont);
          element.style.fontFamily = themeBodyFont;
        }
        if (themeHeadingFont) {
          element.style.setProperty("--gk-font-heading-family", themeHeadingFont);
        }
      });

      const title = this.root.querySelector(".gk-drobe-search__title");
      if (title && themeHeadingFont) {
        title.style.fontFamily = themeHeadingFont;
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
        deliveryMethod: params.get("deliveryMethod") || "post",
      };
    }

    applyParamsToForm({ eventDate, size, durationDays, deliveryMethod }) {
      if (this.eventDateInput && eventDate) {
        this.eventDateInput.value = eventDate;
      }
      if (this.sizeSelect && size) {
        this.sizeSelect.value = size;
      }
      if (this.durationSelect && durationDays) {
        this.durationSelect.value = durationDays;
      }
      if (this.deliverySelect && deliveryMethod) {
        this.deliverySelect.value = deliveryMethod;
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
      destination.searchParams.set("deliveryMethod", params.deliveryMethod);
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
      url.searchParams.set("deliveryMethod", params.deliveryMethod);
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
      if (this.facetBar) {
        this.facetBar.hidden = false;
      }
      this.syncFilterDrawerForViewport();
    }

    applySearchColors() {
      const colors = this.searchConfig?.colors;
      const layout = this.searchConfig?.layout;
      const section =
        this.root.closest(".gk-drobe-search-section") || this.root.parentElement;

      if (layout) {
        this.applySearchLayout(layout, section);
      }

      if (!colors) {
        return;
      }

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

    applySearchLayout(layout, section) {
      const contentWidthMap = {
        standard: "min(1400px, 100%)",
        theme:
          "min(var(--page-width, var(--container-max-width, var(--max-page-width, 87.5rem))), 100%)",
        narrow: "42rem",
        medium: "56rem",
        wide: "87.5rem",
        full: "100%",
      };
      const paddingMap = {
        compact: { block: "1.5rem", inline: "1rem" },
        default: { block: "2.5rem", inline: "1rem" },
        spacious: { block: "4rem", inline: "1.5rem" },
      };
      const titleSizeMap = {
        small: "clamp(1.5rem, 3vw, 2rem)",
        medium: "clamp(2rem, 4vw, 2.75rem)",
        large: "clamp(2.25rem, 5vw, 3.25rem)",
      };
      const inputRadiusMap = {
        square: "0",
        rounded: "8px",
        pill: "9999px",
      };

      const padding = paddingMap[layout.sectionPadding] || paddingMap.default;
      const targets = [this.root];
      if (section) {
        targets.push(section);
        section.classList.toggle(
          "gk-drobe-search-section--full-bleed",
          Boolean(layout.fullBleedBackground),
        );
      }

      targets.forEach((element) => {
        element.style.setProperty(
          "--gk-search-content-max-width",
          contentWidthMap[layout.contentWidth] || contentWidthMap.standard,
        );
        element.style.setProperty("--gk-search-section-padding-block", padding.block);
        element.style.setProperty("--gk-search-section-padding-inline", padding.inline);
        element.style.setProperty(
          "--gk-search-title-size",
          titleSizeMap[layout.titleSize] || titleSizeMap.medium,
        );
        element.style.setProperty(
          "--gk-search-input-radius",
          inputRadiusMap[layout.inputStyle] || inputRadiusMap.square,
        );
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
      this.refineButton = this.root.querySelector("[data-gk-refine-search]");
      this.resultsCount = this.root.querySelector("[data-gk-results-count]");
      this.resultsCountMobile = this.root.querySelector(
        "[data-gk-results-count-mobile]",
      );
      this.resultsGrid = this.root.querySelector("[data-gk-results-grid]");
      this.resultsLoading = this.root.querySelector("[data-gk-results-loading]");
      this.resultsEmpty = this.root.querySelector("[data-gk-results-empty]");
      this.sortSelect = this.root.querySelector("[data-gk-sort]");
      this.sortSelectMobile = this.root.querySelector("[data-gk-sort-mobile]");
      this.sidebarSizes = this.root.querySelector("[data-gk-sidebar-sizes]");
      this.sidebarColours = this.root.querySelector("[data-gk-sidebar-colours]");
      this.sidebarDesigners = this.root.querySelector("[data-gk-sidebar-designers]");
      this.facetBar = this.root.querySelector("[data-gk-facet-bar]");
      this.filterDrawer = this.root.querySelector("[data-gk-filter-drawer]");
      this.filterPanel = this.root.querySelector(".gk-drobe-search__filter-panel");
      this.filterBackdrop = this.root.querySelector("[data-gk-filter-backdrop]");
      this.filtersOpenButtons = this.root.querySelectorAll("[data-gk-filters-open]");
      this.filtersCloseButtons = this.root.querySelectorAll("[data-gk-filters-close]");
      this.drawerCount = this.root.querySelector("[data-gk-drawer-count]");
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
      this.deliverySelect?.addEventListener("change", () => {
        this.updateBrowserUrl();
        this.runSearch();
      });
      const syncSortFrom = (source, target) => {
        source?.addEventListener("change", () => {
          if (target && target !== source) {
            target.value = source.value;
          }
          this.renderResults();
        });
      };
      syncSortFrom(this.sortSelect, this.sortSelectMobile);
      syncSortFrom(this.sortSelectMobile, this.sortSelect);

      this.filtersOpenButtons?.forEach((button) => {
        button.addEventListener("click", () => this.openFilterDrawer());
      });
      this.filterBackdrop?.addEventListener("click", () => this.closeFilterDrawer());
      this.filtersCloseButtons?.forEach((button) => {
        button.addEventListener("click", () => this.closeFilterDrawer());
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.isFilterDrawerOpen()) {
          this.closeFilterDrawer();
        }
      });

      const onViewportChange = () => this.syncFilterDrawerForViewport();
      if (typeof FILTER_MOBILE_MQ.addEventListener === "function") {
        FILTER_MOBILE_MQ.addEventListener("change", onViewportChange);
      } else {
        FILTER_MOBILE_MQ.addListener(onViewportChange);
      }
      window.addEventListener("resize", onViewportChange);
      this.syncFilterDrawerForViewport();
    }

    isMobileFilters() {
      return FILTER_MOBILE_MQ.matches;
    }

    isFilterDrawerOpen() {
      return Boolean(
        this.filterDrawer && !this.filterDrawer.hidden && this.isMobileFilters(),
      );
    }

    syncFilterDrawerForViewport() {
      if (!this.filterDrawer || !this.filterPanel) {
        return;
      }
      if (this.isMobileFilters()) {
        if (!this.isFilterDrawerOpen()) {
          this.filterDrawer.hidden = true;
          this.filterPanel.setAttribute("aria-hidden", "true");
        }
        this.filterPanel.setAttribute("role", "dialog");
        this.filterPanel.setAttribute("aria-modal", "true");
      } else {
        this.filterDrawer.hidden = false;
        this.filterPanel.setAttribute("aria-hidden", "false");
        this.filterPanel.removeAttribute("role");
        this.filterPanel.removeAttribute("aria-modal");
        document.documentElement.classList.remove("gk-search-drawer-open");
        this.filtersOpenButtons?.forEach((button) => {
          button.setAttribute("aria-expanded", "false");
        });
      }
    }

    openFilterDrawer() {
      if (!this.isMobileFilters() || !this.filterDrawer || !this.filterPanel) {
        return;
      }
      this.filterDrawer.hidden = false;
      this.filterPanel.setAttribute("aria-hidden", "false");
      this.filtersOpenButtons?.forEach((button) => {
        button.setAttribute("aria-expanded", "true");
      });
      document.documentElement.classList.add("gk-search-drawer-open");
      const closeBtn = this.filterPanel.querySelector("[data-gk-filters-close]");
      closeBtn?.focus();
    }

    closeFilterDrawer() {
      if (!this.isMobileFilters() || !this.filterDrawer || !this.filterPanel) {
        return;
      }
      this.filterDrawer.hidden = true;
      this.filterPanel.setAttribute("aria-hidden", "true");
      this.filtersOpenButtons?.forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
      document.documentElement.classList.remove("gk-search-drawer-open");
      this.filtersOpenButtons?.[0]?.focus();
    }

    getActiveSortValue() {
      return (
        this.sortSelect?.value ||
        this.sortSelectMobile?.value ||
        "newest"
      );
    }

    getSearchParams() {
      return {
        eventDate: this.eventDateInput?.value || "",
        size: this.sizeSelect?.value || "",
        durationDays: this.durationSelect?.value || "4",
        deliveryMethod: this.deliverySelect?.value || "post",
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
        deliveryMethod: params.deliveryMethod,
        collection: params.collection,
      });

      try {
        const response = await fetch(
          `${this.proxyBase}/api/search-by-date?${query.toString()}`,
        );
        const data = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(data.error || "Search failed");
        }

        this.products = data.products || [];
        this.filteredProducts = [...this.products];
        this.availableSizes = Array.isArray(data.availableSizes)
          ? data.availableSizes
          : [];
        this.preferredSize = data.size || params.size || "";

        if (this.deliveryDateInput) {
          this.deliveryDateInput.value = formatDisplayDate(data.deliveryDate);
        }
        if (this.returnDateInput) {
          this.returnDateInput.value = formatDisplayDate(data.returnDate);
        }

        this.renderSidebar({ resetSizeSelection: true });
        this.renderResults();
      } catch (error) {
        this.showError(error.message);
      } finally {
        if (this.resultsLoading) {
          this.resultsLoading.hidden = true;
        }
      }
    }

    renderSidebar(options = {}) {
      if (!this.sidebarSizes || !this.sidebarDesigners || !this.sidebarColours) {
        return;
      }

      const resetSizeSelection = Boolean(options.resetSizeSelection);
      const previousSizes = resetSizeSelection
        ? []
        : this.getCheckedFilterValues("filter-size");
      const previousColours = this.getCheckedFilterValues("filter-colour");
      const previousDesigners = this.getCheckedFilterValues("filter-designer");

      const sizesFromProducts = this.products.flatMap(
        (product) =>
          product.availableSizes ||
          (product.availableSize ? [product.availableSize] : []),
      );
      const sizes = [
        ...new Set(
          (this.availableSizes?.length ? this.availableSizes : sizesFromProducts).map(
            String,
          ),
        ),
      ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      const colours = [
        ...new Set(
          this.products
            .map((product) => product.colour)
            .filter((colour) => Boolean(colour && String(colour).trim())),
        ),
      ].sort((a, b) => String(a).localeCompare(String(b)));
      const designers = [...new Set(this.products.map((product) => product.vendor))]
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));

      this.sidebarSizes.innerHTML = "";
      if (sizes.length === 0) {
        const empty = document.createElement("p");
        empty.className = "gk-drobe-search__filter-empty";
        empty.textContent = "No sizes available";
        this.sidebarSizes.appendChild(empty);
      } else {
        const preferred = String(this.preferredSize || "").trim();
        const preferredNorm = preferred.toLowerCase();
        const hasPreferred = sizes.some(
          (size) => String(size).toLowerCase() === preferredNorm,
        );
        const preserveSizes = sizes.some((size) =>
          previousSizes.includes(String(size)),
        );

        sizes.forEach((size) => {
          let checked = true;
          if (preserveSizes) {
            checked = previousSizes.includes(String(size));
          } else if (hasPreferred) {
            // Reference behaviour: start with the searched size selected.
            checked = String(size).toLowerCase() === preferredNorm;
          }

          this.sidebarSizes.appendChild(
            this.createSidebarCheckbox({
              label: String(size),
              datasetKey: "filterSize",
              datasetValue: String(size),
              checked,
            }),
          );
        });
      }

      this.sidebarColours.innerHTML = "";
      if (colours.length === 0) {
        const empty = document.createElement("p");
        empty.className = "gk-drobe-search__filter-empty";
        empty.textContent = "No colours on these products";
        this.sidebarColours.appendChild(empty);
      } else {
        const preserveColours = colours.some((colour) =>
          previousColours.includes(String(colour)),
        );
        colours.forEach((colour) => {
          const checked =
            !preserveColours || previousColours.length === 0
              ? true
              : previousColours.includes(String(colour));
          this.sidebarColours.appendChild(
            this.createSidebarCheckbox({
              label: String(colour),
              datasetKey: "filterColour",
              datasetValue: String(colour),
              checked,
            }),
          );
        });
      }

      this.sidebarDesigners.innerHTML = "";
      const preserveDesigners = designers.some((designer) =>
        previousDesigners.includes(String(designer)),
      );
      designers.forEach((designer) => {
        const checked =
          !preserveDesigners || previousDesigners.length === 0
            ? true
            : previousDesigners.includes(String(designer));
        this.sidebarDesigners.appendChild(
          this.createSidebarCheckbox({
            label: String(designer),
            datasetKey: "filterDesigner",
            datasetValue: String(designer),
            checked,
          }),
        );
      });

      this.applySidebarFilters();
    }

    createSidebarCheckbox({ label, datasetKey, datasetValue, checked }) {
      const wrap = document.createElement("label");
      wrap.className = "gk-drobe-search__check";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "gk-drobe-search__check-input";
      input.checked = checked;
      input.dataset[datasetKey] = datasetValue;
      input.addEventListener("change", () => this.applySidebarFilters());

      const text = document.createElement("span");
      text.className = "gk-drobe-search__check-label";
      text.textContent = label;

      wrap.appendChild(input);
      wrap.appendChild(text);
      return wrap;
    }

    getCheckedFilterValues(dataAttr) {
      const selector =
        dataAttr === "filter-size"
          ? "[data-filter-size]:checked"
          : dataAttr === "filter-colour"
            ? "[data-filter-colour]:checked"
            : "[data-filter-designer]:checked";
      const root =
        dataAttr === "filter-size"
          ? this.sidebarSizes
          : dataAttr === "filter-colour"
            ? this.sidebarColours
            : this.sidebarDesigners;
      if (!root) {
        return [];
      }
      return [...root.querySelectorAll(selector)].map((input) => {
        if (dataAttr === "filter-size") return input.dataset.filterSize;
        if (dataAttr === "filter-colour") return input.dataset.filterColour;
        return input.dataset.filterDesigner;
      });
    }

    applySidebarFilters() {
      const activeSizes = this.getCheckedFilterValues("filter-size");
      const activeColours = this.getCheckedFilterValues("filter-colour");
      const activeDesigners = this.getCheckedFilterValues("filter-designer");
      const hasColourFilters =
        (this.sidebarColours?.querySelectorAll("[data-filter-colour]")?.length ||
          0) > 0;
      const hasSizeFilters =
        (this.sidebarSizes?.querySelectorAll("[data-filter-size]")?.length || 0) >
        0;

      this.filteredProducts = this.products.filter((product) => {
        const productSizes = (
          product.availableSizes ||
          (product.availableSize ? [product.availableSize] : [])
        ).map(String);

        const sizeOk = !hasSizeFilters
          ? true
          : activeSizes.length === 0
            ? false
            : productSizes.some((size) => activeSizes.includes(size));
        const designerOk =
          activeDesigners.length === 0 ||
          activeDesigners.includes(String(product.vendor));
        const colourOk = !hasColourFilters
          ? true
          : product.colour
            ? activeColours.includes(String(product.colour))
            : true;

        return sizeOk && designerOk && colourOk;
      });

      this.renderResults();
    }

    renderResults() {
      if (
        !this.resultsGrid ||
        (!this.resultsCount && !this.resultsCountMobile)
      ) {
        return;
      }

      const sorted = [...this.filteredProducts];
      const sortValue = this.getActiveSortValue();
      if (sortValue === "price-asc") {
        sorted.sort(
          (a, b) =>
            Number(a.priceFrom.replace(/[^\d.]/g, "")) -
            Number(b.priceFrom.replace(/[^\d.]/g, "")),
        );
      } else if (sortValue === "price-desc") {
        sorted.sort(
          (a, b) =>
            Number(b.priceFrom.replace(/[^\d.]/g, "")) -
            Number(a.priceFrom.replace(/[^\d.]/g, "")),
        );
      }

      const countText = `${sorted.length} product${sorted.length === 1 ? "" : "s"} found`;
      if (this.resultsCount) {
        this.resultsCount.textContent = countText;
      }
      if (this.resultsCountMobile) {
        this.resultsCountMobile.textContent = countText;
      }
      if (this.drawerCount) {
        this.drawerCount.textContent = countText;
      }
      this.resultsGrid.innerHTML = "";
      if (this.resultsEmpty) {
        this.resultsEmpty.hidden = sorted.length > 0;
      }

      const params = this.getSearchParams();
      sorted.forEach((product) => {
        const link = document.createElement("a");
        link.className = "gk-drobe-search__card";
        const productUrl = new URL(`${this.rootUrl}products/${product.handle}`, window.location.origin);
        productUrl.searchParams.set("size", product.availableSize);
        if (params.eventDate) {
          productUrl.searchParams.set("eventDate", params.eventDate);
        }
        if (params.durationDays) {
          productUrl.searchParams.set("durationDays", params.durationDays);
        }
        if (params.deliveryMethod) {
          productUrl.searchParams.set("deliveryMethod", params.deliveryMethod);
        }
        link.href = productUrl.toString();
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
