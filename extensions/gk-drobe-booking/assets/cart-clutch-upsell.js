(() => {
  if (window.__gkDrobeClutchUpsellInit) {
    return;
  }
  window.__gkDrobeClutchUpsellInit = true;

  const PROXY_BASE =
    window.__gkDrobeCartUpsell?.proxyBase || "/apps/gk-drobe";
  const ROOT = window.Shopify?.routes?.root || "/";
  const DEBUG =
    typeof window !== "undefined" &&
    (window.location.search.includes("gk_clutch_debug=1") ||
      window.localStorage?.getItem("gk_clutch_debug") === "1");
  const BOOKING_ID_KEY = "_gk_booking_id";
  const SKIP_STORAGE_KEY = "gk-drobe-clutch-skipped";

  const MONTHS = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  let pendingCheckoutUrl = null;
  let modalEl = null;
  let checkoutListenerAttached = false;
  let clutchOfferCache = null;
  let clutchOfferPromise = null;

  function debugLog(...args) {
    if (DEBUG) {
      console.info("[gk-clutch]", ...args);
    }
  }

  function isCartPage() {
    return /(^|\/)cart\/?$/i.test(window.location.pathname);
  }

  function normalizeProperties(properties) {
    if (!properties) {
      return {};
    }

    if (Array.isArray(properties)) {
      const normalized = {};
      properties.forEach((entry) => {
        if (entry && entry.name != null) {
          normalized[String(entry.name)] =
            entry.value == null ? "" : String(entry.value);
        }
      });
      return normalized;
    }

    return { ...properties };
  }

  function hydrateCart(cart) {
    if (!cart?.items) {
      return cart;
    }

    cart.items = cart.items.map((item) => ({
      ...item,
      properties: normalizeProperties(item.properties),
    }));
    return cart;
  }

  function getBookingSize(properties) {
    return properties?._Size ?? properties?.Size ?? null;
  }

  function getBookingDuration(properties) {
    return properties?._Duration ?? properties?.Duration ?? null;
  }

  function hasHireDates(properties) {
    return Boolean(properties?.["Delivery Date"] && properties?.["Return Date"]);
  }

  function isBookingItem(item) {
    const properties = item.properties || {};
    if (properties[BOOKING_ID_KEY]) {
      return true;
    }

    const hasSize = Boolean(getBookingSize(properties));
    const hasDuration = Boolean(getBookingDuration(properties));

    if (hasSize && (hasDuration || hasHireDates(properties))) {
      return true;
    }

    return hasHireDates(properties) && Boolean(properties["Delivery Method"]);
  }

  function resolveDurationDays(properties) {
    const fromLabel = parseDurationDays(getBookingDuration(properties));
    if (fromLabel) {
      return fromLabel;
    }

    const deliveryIso = parseDisplayDate(properties?.["Delivery Date"]);
    const returnIso = parseDisplayDate(properties?.["Return Date"]);
    if (!deliveryIso || !returnIso) {
      return null;
    }

    const start = new Date(`${deliveryIso}T12:00:00.000Z`);
    const end = new Date(`${returnIso}T12:00:00.000Z`);
    const diffDays = Math.round((end - start) / 86400000) + 1;
    if (diffDays >= 1 && diffDays <= 90) {
      return diffDays;
    }

    return null;
  }

  function parseIsoDate(value) {
    if (!value) {
      return null;
    }
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function parseDisplayDate(value) {
    if (!value) {
      return null;
    }
    const iso = parseIsoDate(value);
    if (iso) {
      return iso;
    }

    const match = String(value)
      .trim()
      .match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!match) {
      return null;
    }

    const day = Number.parseInt(match[1], 10);
    const month = MONTHS[match[2].toLowerCase()];
    const year = Number.parseInt(match[3], 10);
    if (month == null || Number.isNaN(day) || Number.isNaN(year)) {
      return null;
    }

    const monthText = String(month + 1).padStart(2, "0");
    const dayText = String(day).padStart(2, "0");
    return `${year}-${monthText}-${dayText}`;
  }

  function parseDurationDays(value) {
    const match = String(value || "").match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function parseDeliveryMethod(value) {
    return /pickup/i.test(String(value || "")) ? "pickup" : "post";
  }

  function formatDisplayDate(iso) {
    const date = new Date(`${iso}T12:00:00.000Z`);
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function buildItemDescriptor(item) {
    const parts = [getBookingSize(item.properties), getBookingDuration(item.properties)];
    if (item.properties?.Color) {
      parts.push(item.properties.Color);
    }
    return `${item.product_title} [${parts.join(" / ")}]`;
  }

  function createBookingId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `gk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function isLinkedLine(properties) {
    return Boolean(properties?.["For item"]) && !properties?.["Delivery Date"];
  }

  function getPrimaryBooking(cart) {
    hydrateCart(cart);
    const candidates = cart.items.filter((item) => {
      if (isLinkedLine(item.properties)) {
        return false;
      }
      return isBookingItem(item);
    });

    debugLog("booking candidates", candidates.length, candidates);

    const withDates = candidates.find((item) =>
      Boolean(item.properties?.["Delivery Date"] && item.properties?.["Return Date"]),
    );
    return withDates ?? candidates[0] ?? null;
  }

  function skipKey(bookingId) {
    return `${SKIP_STORAGE_KEY}:${bookingId}`;
  }

  function wasSkippedForBooking(bookingId) {
    try {
      return sessionStorage.getItem(skipKey(bookingId)) === "1";
    } catch {
      return false;
    }
  }

  function markSkipped(bookingId) {
    try {
      sessionStorage.setItem(skipKey(bookingId), "1");
    } catch {
      // ignore
    }
  }

  function findCheckoutTarget(node) {
    if (!(node instanceof Element)) {
      return null;
    }

    const selector = [
      'button[name="checkout"]',
      'input[name="checkout"]',
      'a[href*="/checkout"]',
      '[data-cart-checkout]',
      "[data-checkout-button]",
      ".cart__checkout-button",
      ".cart__checkout",
      ".cart__ctas button",
      "#checkout",
      'button[type="submit"][formaction*="checkout"]',
      "shopify-accelerated-checkout button",
    ].join(",");

    const direct = node.closest(selector);
    if (direct) {
      return direct;
    }

    const clickable =
      node instanceof Element ? node : null;
    if (!clickable) {
      return null;
    }

    const button =
      clickable.closest("button, a, input[type='submit'], [role='button']") || clickable;
    const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (label === "check out" || label === "checkout" || label === "proceed to checkout") {
      return button;
    }

    return null;
  }

  function resolveCheckoutUrl(target) {
    if (!(target instanceof Element)) {
      return `${ROOT}checkout`;
    }

    if (target instanceof HTMLAnchorElement && target.href) {
      return target.href;
    }

    const form = target.closest("form");
    if (form?.action) {
      const action = form.getAttribute("action") || "";
      if (/checkout/i.test(action)) {
        return action;
      }
    }

    return `${ROOT}checkout`;
  }

  function ensureModal() {
    if (modalEl) {
      return modalEl;
    }

    modalEl = document.createElement("div");
    modalEl.className = "gk-clutch-modal";
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div class="gk-clutch-modal__backdrop" data-gk-clutch-close></div>
      <motion-div class="gk-clutch-modal__panel" role="dialog" aria-modal="true">
        <button type="button" class="gk-clutch-modal__close" data-gk-clutch-close aria-label="Close">&times;</button>
        <h2 class="gk-clutch-modal__title" data-gk-clutch-title></h2>
        <p class="gk-clutch-modal__subtitle" data-gk-clutch-subtitle></p>
        <p class="gk-clutch-modal__dates" data-gk-clutch-dates hidden></p>
        <p class="gk-clutch-modal__status" data-gk-clutch-status hidden></p>
        <div class="gk-clutch-modal__list" data-gk-clutch-list></div>
        <motion-div class="gk-clutch-modal__actions">
          <button type="button" class="gk-clutch-modal__skip" data-gk-clutch-skip></button>
          <button type="button" class="gk-clutch-modal__checkout" data-gk-clutch-continue hidden></button>
        </div>
      </div>
    `.replace(/motion-div/g, "div");

    document.body.appendChild(modalEl);

    modalEl.querySelectorAll("[data-gk-clutch-close]").forEach((button) => {
      button.addEventListener("click", () => hideModal());
    });

    modalEl.querySelector("[data-gk-clutch-skip]")?.addEventListener("click", () => {
      const bookingId = modalEl.dataset.bookingId;
      if (bookingId) {
        markSkipped(bookingId);
      }
      hideModal();
      if (pendingCheckoutUrl) {
        window.location.href = pendingCheckoutUrl;
      }
    });

    modalEl.querySelector("[data-gk-clutch-continue]")?.addEventListener("click", () => {
      hideModal();
      if (pendingCheckoutUrl) {
        window.location.href = pendingCheckoutUrl;
      }
    });

    return modalEl;
  }

  function hideModal() {
    if (modalEl) {
      modalEl.hidden = true;
      document.documentElement.classList.remove("gk-clutch-modal-open");
    }
  }

  function bookingCacheKey(booking) {
    const properties = booking.properties || {};
    return [
      parseDisplayDate(properties["Delivery Date"]),
      resolveDurationDays(properties),
      parseDeliveryMethod(properties["Delivery Method"]),
    ].join("|");
  }

  function showLoadingState(modal, message) {
    modal.classList.add("gk-clutch-modal--loading");
    const listEl = modal.querySelector("[data-gk-clutch-list]");
    const statusEl = modal.querySelector("[data-gk-clutch-status]");
    if (!listEl) {
      return;
    }

    listEl.innerHTML = "";
    for (let index = 0; index < 3; index += 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "gk-clutch-card gk-clutch-card--skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      skeleton.innerHTML = `
        <div class="gk-clutch-card__skeleton-image"></div>
        <div class="gk-clutch-card__skeleton-body">
          <div class="gk-clutch-card__skeleton-line gk-clutch-card__skeleton-line--title"></div>
          <div class="gk-clutch-card__skeleton-line gk-clutch-card__skeleton-line--meta"></div>
        </div>
        <div class="gk-clutch-card__skeleton-price"></div>
        <div class="gk-clutch-card__skeleton-button"></div>
      `;
      listEl.appendChild(skeleton);
    }

    if (statusEl) {
      statusEl.className = "gk-clutch-modal__status gk-clutch-modal__status--loading";
      statusEl.innerHTML = `
        <span class="gk-clutch-modal__spinner" aria-hidden="true"></span>
        <span>${message || "Loading available clutches…"}</span>
      `;
      statusEl.hidden = false;
    }
  }

  function showModal() {
    const modal = ensureModal();
    modal.hidden = false;
    modal.classList.remove("gk-clutch-modal--closing");
    modal.classList.add("gk-clutch-modal--visible");
    document.documentElement.classList.add("gk-clutch-modal-open");
  }

  async function warmClutchOfferCache() {
    if (!isCartPage()) {
      return;
    }

    try {
      const response = await fetch(`${ROOT}cart.js`);
      const cart = await response.json();
      const booking = getPrimaryBooking(cart);
      if (!booking) {
        return;
      }

      const key = bookingCacheKey(booking);
      if (clutchOfferCache?.key === key && Date.now() - clutchOfferCache.at < 120000) {
        return;
      }

      clutchOfferPromise = loadClutchOffer(booking, cart)
        .then((data) => {
          clutchOfferCache = { key, data, at: Date.now() };
          return data;
        })
        .catch(() => null);
    } catch {
      // optional prefetch only
    }
  }

  async function resolveClutchOffer(booking, cart) {
    const key = bookingCacheKey(booking);
    if (clutchOfferCache?.key === key && Date.now() - clutchOfferCache.at < 120000) {
      return clutchOfferCache.data;
    }

    if (clutchOfferPromise) {
      const data = await clutchOfferPromise;
      clutchOfferPromise = null;
      if (data) {
        return data;
      }
    }

    return loadClutchOffer(booking, cart);
  }

  function renderProducts(config, products, booking, deliveryIso, returnIso) {
    const modal = ensureModal();
    const titleEl = modal.querySelector("[data-gk-clutch-title]");
    const subtitleEl = modal.querySelector("[data-gk-clutch-subtitle]");
    const datesEl = modal.querySelector("[data-gk-clutch-dates]");
    const statusEl = modal.querySelector("[data-gk-clutch-status]");
    const listEl = modal.querySelector("[data-gk-clutch-list]");
    const skipBtn = modal.querySelector("[data-gk-clutch-skip]");
    const continueBtn = modal.querySelector("[data-gk-clutch-continue]");

    modal.dataset.bookingId = booking.properties?.[BOOKING_ID_KEY] || "";

    if (titleEl) titleEl.textContent = config.modalTitle || "Add a clutch to your hire";
    if (subtitleEl) {
      subtitleEl.textContent =
        config.modalSubtitle ||
        "Complete your look — discounted hire rates for these dates.";
    }
    if (datesEl) {
      datesEl.textContent = `Hire: ${formatDisplayDate(deliveryIso)} → ${formatDisplayDate(returnIso)}`;
      datesEl.hidden = false;
    }
    if (skipBtn) skipBtn.textContent = config.skipButtonLabel || "Skip & checkout";
    if (continueBtn) {
      continueBtn.textContent = config.continueCheckoutLabel || "Continue to checkout";
      continueBtn.hidden = true;
    }

    listEl.innerHTML = "";

    modal.classList.remove("gk-clutch-modal--loading");

    if (!products.length) {
      if (statusEl) {
        statusEl.className = "gk-clutch-modal__status";
        statusEl.textContent =
          config.emptyLabel || "No clutches are available for your hire dates.";
        statusEl.hidden = false;
      }
      return;
    }

    if (statusEl) {
      statusEl.hidden = true;
      statusEl.className = "gk-clutch-modal__status";
      statusEl.innerHTML = "";
    }

    const bookingId = booking.properties?.[BOOKING_ID_KEY] || createBookingId();
    const linkedDescriptor = buildItemDescriptor(booking);
    const durationDaysResolved = resolveDurationDays(booking.properties);
    const durationLabel =
      getBookingDuration(booking.properties) ||
      (durationDaysResolved ? `${durationDaysResolved} Day Hire` : "");
    const deliveryMethodLabel = booking.properties?.["Delivery Method"] || "Post";

    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "gk-clutch-card";

      const image = document.createElement("img");
      image.className = "gk-clutch-card__image gk-clutch-card__image--loading";
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("load", () => {
        image.classList.remove("gk-clutch-card__image--loading");
      });
      if (product.imageUrl) {
        image.src = product.imageUrl;
      } else {
        image.removeAttribute("src");
        image.classList.remove("gk-clutch-card__image--loading");
      }

      const body = document.createElement("div");
      body.className = "gk-clutch-card__body";

      const name = document.createElement("div");
      name.className = "gk-clutch-card__title";
      name.textContent = product.title;

      const meta = document.createElement("div");
      meta.className = "gk-clutch-card__meta";
      meta.textContent = product.size ? `Size ${product.size}` : "";

      body.appendChild(name);
      if (product.size) {
        body.appendChild(meta);
      }

      const price = document.createElement("div");
      price.className = "gk-clutch-card__price";

      if (
        product.originalDisplayPrice &&
        product.originalDisplayPrice !== product.displayPrice
      ) {
        const compare = document.createElement("span");
        compare.className = "gk-clutch-card__compare";
        compare.textContent = product.originalDisplayPrice;
        price.appendChild(compare);
      }

      const current = document.createElement("strong");
      current.textContent = product.displayPrice;
      price.appendChild(current);

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "gk-clutch-card__add";
      addButton.textContent = config.addToCartLabel || "Add to cart";
      addButton.addEventListener("click", async () => {
        addButton.disabled = true;
        try {
          await addClutchToCart({
            product,
            booking,
            bookingId,
            linkedDescriptor,
            durationLabel,
            deliveryMethodLabel,
            deliveryIso,
            returnIso,
          });
          if (continueBtn) {
            continueBtn.hidden = false;
          }
          addButton.textContent = "Added";
          card.classList.add("gk-clutch-card--added");
        } catch (error) {
          addButton.disabled = false;
          if (statusEl) {
            statusEl.textContent =
              error?.message || "Could not add this clutch. Try again or skip to checkout.";
            statusEl.hidden = false;
          }
        }
      });

      card.appendChild(image);
      card.appendChild(body);
      card.appendChild(price);
      card.appendChild(addButton);
      listEl.appendChild(card);
    });
  }

  async function addClutchToCart(input) {
    const clutchBookingId = createBookingId();
    const properties = {
      _Size: input.product.size || "One Size",
      _Duration: input.durationLabel,
      Color: input.booking.properties?.Color || "",
      "Delivery Method": input.deliveryMethodLabel,
      "Delivery Date": formatDisplayDate(input.deliveryIso),
      "Return Date": formatDisplayDate(input.returnIso),
      "Event Date": input.booking.properties?.["Event Date"] || "",
      "For item": input.linkedDescriptor,
      _gk_booking_id: clutchBookingId,
      _gk_linked_booking_id: input.bookingId,
      _gk_clutch_upsell: "true",
    };

    Object.keys(properties).forEach((key) => {
      if (!properties[key]) {
        delete properties[key];
      }
    });

    const response = await fetch(`${ROOT}cart/add.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: Number(input.product.variantId),
            quantity: 1,
            properties,
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.description || data.message || "Could not add to cart");
    }

    document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
  }

  async function loadClutchOffer(booking, cart) {
    const deliveryIso = parseDisplayDate(booking.properties?.["Delivery Date"]);
    const durationDays = resolveDurationDays(booking.properties);
    const deliveryMethod = parseDeliveryMethod(booking.properties?.["Delivery Method"]);

    if (!deliveryIso || !durationDays) {
      return {
        enabled: false,
        reason: "missing_dates",
        message:
          "Could not read hire dates from your gown cart item. Refresh the cart and try again.",
      };
    }

    const excludeIds = cart.items.map((item) => String(item.product_id)).join(",");

    const params = new URLSearchParams({
      deliveryDate: deliveryIso,
      durationDays: String(durationDays),
      deliveryMethod,
      excludeProductIds: excludeIds,
    });

    const response = await fetch(`${PROXY_BASE}/api/cart-clutches?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load clutches");
    }

    if (!data.enabled) {
      return {
        enabled: false,
        reason: "disabled",
        message:
          "Clutch upsell is off or no collection is selected in DrobeBook → Settings → Cart.",
      };
    }

    return data;
  }

  async function maybeShowClutchModal(checkoutUrl, cart) {
    hydrateCart(cart);
    const booking = getPrimaryBooking(cart);
    if (!booking) {
      debugLog("no booking line in cart — checkout continues");
      window.location.href = checkoutUrl;
      return;
    }

    const bookingId = booking.properties?.[BOOKING_ID_KEY];
    if (bookingId && wasSkippedForBooking(bookingId)) {
      window.location.href = checkoutUrl;
      return;
    }

    pendingCheckoutUrl = checkoutUrl;

    const modal = ensureModal();
    const statusEl = modal.querySelector("[data-gk-clutch-status]");
    const titleEl = modal.querySelector("[data-gk-clutch-title]");
    const subtitleEl = modal.querySelector("[data-gk-clutch-subtitle]");
    const skipBtn = modal.querySelector("[data-gk-clutch-skip]");

    if (titleEl) titleEl.textContent = "Add a clutch to your hire";
    if (subtitleEl) {
      subtitleEl.textContent = "Finding clutches available for your hire dates…";
    }
    if (skipBtn) {
      skipBtn.textContent = "Skip & checkout";
    }

    showLoadingState(modal, "Loading available clutches…");
    showModal();

    try {
      const offer = await resolveClutchOffer(booking, cart);
      if (!offer || offer.enabled === false) {
        modal.classList.remove("gk-clutch-modal--loading");
        modal.querySelector("[data-gk-clutch-list]").innerHTML = "";
        if (statusEl) {
          statusEl.className = "gk-clutch-modal__status";
          statusEl.textContent =
            offer?.message ||
            "Clutch offer is not available right now. Use Skip to continue to checkout.";
          statusEl.hidden = false;
        }
        return;
      }

      renderProducts(
        offer.config,
        offer.products,
        booking,
        offer.deliveryDate,
        offer.returnDate,
      );

      if (!offer.products.length && statusEl) {
        statusEl.className = "gk-clutch-modal__status";
        statusEl.textContent =
          offer.config?.emptyLabel ||
          "No clutches are available for your hire dates.";
        statusEl.hidden = false;
      }
    } catch (error) {
      modal.classList.remove("gk-clutch-modal--loading");
      modal.querySelector("[data-gk-clutch-list]").innerHTML = "";
      if (statusEl) {
        statusEl.className = "gk-clutch-modal__status";
        statusEl.textContent =
          error?.message || "Could not load clutches. Skip to continue to checkout.";
        statusEl.hidden = false;
      }
    }
  }

  function blockCheckoutNavigation(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  async function handleCheckoutAttempt(checkoutUrl) {
    let cart;
    try {
      const response = await fetch(`${ROOT}cart.js`);
      cart = await response.json();
    } catch {
      return false;
    }

    hydrateCart(cart);
    const booking = getPrimaryBooking(cart);
    if (!booking) {
      debugLog("intercept: no gown hire line detected", cart.items);
      return false;
    }

    debugLog("intercept: gown hire line", booking);
    await maybeShowClutchModal(checkoutUrl, cart);
    return true;
  }

  function attachCheckoutInterceptor() {
    if (checkoutListenerAttached) {
      return;
    }
    checkoutListenerAttached = true;

    document.addEventListener(
      "click",
      async (event) => {
        if (!isCartPage()) {
          return;
        }

        const target = findCheckoutTarget(event.target);
        if (!target) {
          return;
        }

        const checkoutUrl = resolveCheckoutUrl(target);
        debugLog("checkout click", target, checkoutUrl);
        blockCheckoutNavigation(event);

        const handled = await handleCheckoutAttempt(checkoutUrl);
        if (!handled) {
          window.location.href = checkoutUrl;
        }
      },
      true,
    );

    document.addEventListener(
      "click",
      async (event) => {
        if (!isCartPage()) {
          return;
        }

        const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
        if (!link || !/\/checkout/i.test(link.getAttribute("href") || "")) {
          return;
        }

        if (link.getAttribute("target") === "_blank") {
          return;
        }

        const checkoutUrl = link.href;
        debugLog("checkout link", checkoutUrl);
        blockCheckoutNavigation(event);

        const handled = await handleCheckoutAttempt(checkoutUrl);
        if (!handled) {
          window.location.href = checkoutUrl;
        }
      },
      true,
    );

    document.addEventListener(
      "submit",
      async (event) => {
        if (!isCartPage()) {
          return;
        }

        const form = event.target;
        if (!(form instanceof HTMLFormElement)) {
          return;
        }

        const action = form.getAttribute("action") || "";
        const isCheckoutForm =
          /checkout/i.test(action) ||
          form.querySelector('[name="checkout"]') ||
          form.id === "cart" ||
          /cart/i.test(action);

        if (!isCheckoutForm) {
          return;
        }

        const submitter = event.submitter;
        if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
          const name = (submitter.getAttribute("name") || "").toLowerCase();
          if (name && name !== "checkout" && name !== "update") {
            return;
          }
          if (name === "update") {
            return;
          }
        } else if (!/checkout/i.test(action)) {
          return;
        }

        const checkoutUrl = action.includes("checkout")
          ? action
          : `${ROOT}checkout`;

        debugLog("checkout submit", checkoutUrl, submitter);
        blockCheckoutNavigation(event);

        const handled = await handleCheckoutAttempt(checkoutUrl);
        if (!handled) {
          window.location.href = checkoutUrl;
        }
      },
      true,
    );
  }

  function init() {
    attachCheckoutInterceptor();
    warmClutchOfferCache();
    document.addEventListener("cart:updated", () => {
      clutchOfferCache = null;
      clutchOfferPromise = null;
      warmClutchOfferCache();
    });
    document.addEventListener("cart:change", () => {
      clutchOfferCache = null;
      clutchOfferPromise = null;
      warmClutchOfferCache();
    });
    debugLog("init", { cartPage: isCartPage(), proxy: PROXY_BASE, embed: window.__gkDrobeCartUpsell });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();