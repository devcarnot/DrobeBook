(() => {
  if (window.__gkDrobeClutchUpsellInit) {
    return;
  }
  window.__gkDrobeClutchUpsellInit = true;

  const PROXY_BASE = "/apps/gk-drobe";
  const ROOT = window.Shopify?.routes?.root || "/";
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

  function isCartPage() {
    return window.location.pathname.includes("/cart");
  }

  function getBookingSize(properties) {
    return properties?._Size ?? properties?.Size ?? null;
  }

  function getBookingDuration(properties) {
    return properties?._Duration ?? properties?.Duration ?? null;
  }

  function isBookingItem(item) {
    return Boolean(getBookingSize(item.properties) && getBookingDuration(item.properties));
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

  function getPrimaryBooking(cart) {
    return cart.items.find((item) => isBookingItem(item)) ?? null;
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

    return node.closest(
      [
        'button[name="checkout"]',
        'input[name="checkout"]',
        'a[href*="/checkout"]',
        '[data-cart-checkout]',
        ".cart__checkout-button",
        "#checkout",
        ".cart__ctas button",
        ".cart__checkout",
        'button[type="submit"][formaction*="checkout"]',
      ].join(","),
    );
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

  function showModal() {
    const modal = ensureModal();
    modal.hidden = false;
    document.documentElement.classList.add("gk-clutch-modal-open");
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

    if (!products.length) {
      if (statusEl) {
        statusEl.textContent = config.emptyLabel || "No clutches are available for your hire dates.";
        statusEl.hidden = false;
      }
      return;
    }

    if (statusEl) {
      statusEl.hidden = true;
    }

    const bookingId = booking.properties?.[BOOKING_ID_KEY] || createBookingId();
    const linkedDescriptor = buildItemDescriptor(booking);
    const durationLabel = getBookingDuration(booking.properties) || "";
    const deliveryMethodLabel = booking.properties?.["Delivery Method"] || "Post";

    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "gk-clutch-card";

      const image = document.createElement("img");
      image.className = "gk-clutch-card__image";
      image.alt = "";
      image.loading = "lazy";
      image.src =
        product.imageUrl ||
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'/%3E";

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
    const durationDays = parseDurationDays(getBookingDuration(booking.properties));
    const deliveryMethod = parseDeliveryMethod(booking.properties?.["Delivery Method"]);

    if (!deliveryIso || !durationDays) {
      return null;
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
      return null;
    }

    return data;
  }

  async function maybeShowClutchModal(checkoutUrl, cart) {
    const booking = getPrimaryBooking(cart);
    if (!booking) {
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
    const listEl = modal.querySelector("[data-gk-clutch-list]");
    if (statusEl) {
      statusEl.textContent = "Loading…";
      statusEl.hidden = false;
    }
    if (listEl) {
      listEl.innerHTML = "";
    }
    showModal();

    try {
      const offer = await loadClutchOffer(booking, cart);
      if (!offer) {
        hideModal();
        window.location.href = checkoutUrl;
        return;
      }

      renderProducts(
        offer.config,
        offer.products,
        booking,
        offer.deliveryDate,
        offer.returnDate,
      );

      if (!offer.products.length) {
        return;
      }
    } catch (error) {
      if (statusEl) {
        statusEl.textContent =
          error?.message || "Could not load clutches. Skip to continue to checkout.";
        statusEl.hidden = false;
      }
    }
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

        let cart;
        try {
          const response = await fetch(`${ROOT}cart.js`);
          cart = await response.json();
        } catch {
          return;
        }

        const booking = getPrimaryBooking(cart);
        if (!booking) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        await maybeShowClutchModal(checkoutUrl, cart);
      },
      true,
    );
  }

  function init() {
    if (!isCartPage()) {
      return;
    }
    attachCheckoutInterceptor();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();