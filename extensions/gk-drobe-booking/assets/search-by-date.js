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
      this.products = [];
      this.filteredProducts = [];

      this.cacheElements();
      this.bindEvents();
    }

    cacheElements() {
      this.form = this.root.querySelector("[data-gk-search-form]");
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
        this.runSearch();
      });
      this.refineButton?.addEventListener("click", () => this.runSearch());
      this.sortSelect?.addEventListener("change", () => this.renderResults());
    }

    getSearchParams() {
      return {
        eventDate: this.eventDateInput.value,
        size: this.sizeSelect.value,
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
      this.resultsSection.hidden = false;
      this.resultsLoading.hidden = false;
      this.resultsEmpty.hidden = true;
      this.resultsGrid.innerHTML = "";

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

        this.deliveryDateInput.value = formatDisplayDate(data.deliveryDate);
        this.returnDateInput.value = formatDisplayDate(data.returnDate);
        this.sizeFilterInput.value = data.size;

        this.renderSidebar();
        this.renderResults();
      } catch (error) {
        this.showError(error.message);
      } finally {
        this.resultsLoading.hidden = true;
      }
    }

    renderSidebar() {
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
      const activeDesigners = [...this.sidebarDesigners.querySelectorAll("input:checked")].map(
        (input) => input.dataset.filterDesigner,
      );

      this.filteredProducts = this.products.filter((product) =>
        activeDesigners.includes(product.vendor),
      );
      this.renderResults();
    }

    renderResults() {
      const sorted = [...this.filteredProducts];
      if (this.sortSelect.value === "price-asc") {
        sorted.sort(
          (a, b) =>
            Number(a.priceFrom.replace(/[^\d.]/g, "")) -
            Number(b.priceFrom.replace(/[^\d.]/g, "")),
        );
      } else if (this.sortSelect.value === "price-desc") {
        sorted.sort(
          (a, b) =>
            Number(b.priceFrom.replace(/[^\d.]/g, "")) -
            Number(a.priceFrom.replace(/[^\d.]/g, "")),
        );
      }

      this.resultsCount.textContent = `${sorted.length} products found`;
      this.resultsGrid.innerHTML = "";
      this.resultsEmpty.hidden = sorted.length > 0;

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
