(() => {
  if (window.__gkDrobeCartBehaviorInit) {
    return;
  }
  window.__gkDrobeCartBehaviorInit = true;

  const BOOKING_ID_KEY = "_gk_booking_id";
  const LINKED_BOOKING_ID_KEY = "_gk_linked_booking_id";
  const ROOT = window.Shopify?.routes?.root || "/";
  let syncing = false;
  let refreshTimer = 0;

  function isBookingItem(item) {
    return Boolean(item.properties?.Size && item.properties?.Duration);
  }

  function normalizeDescriptor(value) {
    return String(value || "")
      .replace(/\(\d+\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function buildMainDescriptor(item) {
    if (!isBookingItem(item)) {
      return null;
    }

    const parts = [item.properties.Size, item.properties.Duration];
    if (item.properties.Color) {
      parts.push(item.properties.Color);
    }

    return `${item.product_title} [${parts.join(" / ")}]`;
  }

  function findOrphanedProtectionKeys(cart) {
    const bookingIds = new Set(
      cart.items
        .map((item) => item.properties?.[BOOKING_ID_KEY])
        .filter(Boolean),
    );

    const mainDescriptors = new Set(
      cart.items
        .map((item) => buildMainDescriptor(item))
        .filter(Boolean)
        .map(normalizeDescriptor),
    );

    return cart.items
      .filter((item) => {
        const forItem = item.properties?.["For item"];
        if (!forItem) {
          return false;
        }

        const linkedId = item.properties?.[LINKED_BOOKING_ID_KEY];
        if (linkedId) {
          return !bookingIds.has(linkedId);
        }

        return !mainDescriptors.has(normalizeDescriptor(forItem));
      })
      .map((item) => item.key);
  }

  function looksLikeVariantSummary(text) {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return false;
    }

    return (
      /^\d/.test(normalized) &&
      (/,/.test(normalized) || /\//.test(normalized) || /day/i.test(normalized))
    );
  }

  async function fetchCart() {
    const response = await fetch(`${ROOT}cart.js`);
    if (!response.ok) {
      throw new Error("Could not load cart");
    }
    return response.json();
  }

  async function removeLines(keys) {
    if (!keys.length) {
      return null;
    }

    const updates = Object.fromEntries(keys.map((key) => [key, 0]));
    const sectionIds = collectCartSectionIds();
    const body = { updates };

    if (sectionIds.length) {
      body.sections = sectionIds.join(",");
      body.sections_url = getSectionsUrl();
    }

    const response = await fetch(`${ROOT}cart/update.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Could not update cart");
    }

    const cart = await response.json();
    applySectionsHtml(cart.sections);
    return cart;
  }

  function getSectionsUrl() {
    return `${window.location.pathname}${window.location.search}` || "/";
  }

  function applySectionsHtml(sections) {
    if (!sections || typeof sections !== "object") {
      return;
    }

    Object.entries(sections).forEach(([sectionId, html]) => {
      if (typeof html !== "string") {
        return;
      }

      const container = document.getElementById(`shopify-section-${sectionId}`);
      if (!container) {
        return;
      }

      const parsed = new DOMParser().parseFromString(html, "text/html");
      const inner =
        parsed.querySelector(".shopify-section")?.innerHTML || parsed.body.innerHTML;
      container.innerHTML = inner;
    });
  }

  const CART_COUNT_TEXT_SELECTORS = [
    ".cart-count-bubble span[aria-hidden='true']",
    ".cart-count-bubble .count",
    ".cart-count",
    "#cart-icon-bubble .count",
    ".header__icon--cart .count",
    ".cart-link__bubble",
    "#CartCount span",
    ".header__cart-count",
  ].join(", ");

  const CART_BUBBLE_SELECTORS =
    ".cart-count-bubble, [data-cart-count], #cart-icon-bubble, .cart-link__bubble";

  function patchCartCountNearIcon(count) {
    const countText = String(count);

    document.querySelectorAll('a[href="/cart"], a[href*="/cart"]').forEach((cartLink) => {
      const scope =
        cartLink.closest(
          'li, [class*="header"], [class*="cart"], nav, .site-header, .header',
        ) || cartLink.parentElement;

      if (!scope) {
        return;
      }

      scope.querySelectorAll("sup, span, small, em, strong, div").forEach((node) => {
        if (node.closest("svg") || node.querySelector("svg")) {
          return;
        }

        if (node.childElementCount > 0) {
          return;
        }

        const text = node.textContent.trim();
        if (/^\d{1,3}$/.test(text)) {
          node.textContent = countText;
          node.style.visibility = count > 0 ? "" : "hidden";
          node.style.opacity = count > 0 ? "" : "0";
        }
      });
    });
  }

  function updateCartCount(count) {
    const countText = String(count);

    if (window.Shopify) {
      window.Shopify.cartCount = count;
    }

    document.documentElement.dataset.gkDrobeCartCount = countText;

    document.querySelectorAll(CART_COUNT_TEXT_SELECTORS).forEach((node) => {
      if (node.childElementCount === 0) {
        node.textContent = countText;
      }
    });

    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      node.setAttribute("data-cart-count", countText);
    });

    document.querySelectorAll(CART_BUBBLE_SELECTORS).forEach((bubble) => {
      bubble.classList.toggle("gk-drobe-cart-empty", count <= 0);
      if (count <= 0) {
        bubble.setAttribute("hidden", "hidden");
      } else {
        bubble.removeAttribute("hidden");
      }
    });

    patchCartCountNearIcon(count);

    document.querySelectorAll("h1.title, h1.main-page-title, .cart__title").forEach((title) => {
      const text = title.textContent || "";
      if (/cart/i.test(text)) {
        title.textContent = count > 0 ? `Cart ${countText}` : "Cart";
      }
    });
  }

  function collectCartSectionIds() {
    const ids = new Set();

    document.querySelectorAll('a[href="/cart"], a[href*="/cart"]').forEach((link) => {
      const section = link.closest('[id^="shopify-section-"]');
      if (section?.id) {
        ids.add(section.id.replace("shopify-section-", ""));
      }
    });

    document.querySelectorAll('[id^="shopify-section-group-"]').forEach((group) => {
      if (/header/i.test(group.id)) {
        group.querySelectorAll('[id^="shopify-section-"]').forEach((section) => {
          ids.add(section.id.replace("shopify-section-", ""));
        });
      }
    });

    document.querySelectorAll('[id^="shopify-section-"]').forEach((section) => {
      const id = section.id.replace("shopify-section-", "");
      if (/header|cart|icon-bubble|drawer/i.test(id)) {
        ids.add(id);
      }
    });

    [
      "header",
      "cart-icon-bubble",
      "cart-drawer",
      "main-cart-items",
      "main-cart-footer",
      "cart-live-region-text",
      "cart-items",
    ].forEach((name) => {
      document.querySelectorAll(`[id*="${name}"], [data-section-id*="${name}"]`).forEach((node) => {
        const section = node.closest('[id^="shopify-section-"]');
        if (section?.id) {
          ids.add(section.id.replace("shopify-section-", ""));
        }
        if (node.dataset.sectionId) {
          ids.add(node.dataset.sectionId);
        }
      });
    });

    return [...ids].slice(0, 10);
  }

  async function fetchSectionsFromUrl(sectionIds, sectionsUrl) {
    const separator = sectionsUrl.includes("?") ? "&" : "?";
    const response = await fetch(`${sectionsUrl}${separator}sections=${sectionIds.join(",")}`);
    if (!response.ok) {
      throw new Error("Could not refresh cart sections");
    }
    return response.json();
  }

  async function refreshCartSections() {
    const sectionIds = collectCartSectionIds();
    if (!sectionIds.length) {
      return false;
    }

    const base = ROOT.endsWith("/") ? ROOT.slice(0, -1) : ROOT;
    const urls = [...new Set([getSectionsUrl(), `${base}/cart`, base || "/"])];

    for (const sectionsUrl of urls) {
      try {
        const sections = await fetchSectionsFromUrl(sectionIds, sectionsUrl);
        applySectionsHtml(sections);
        return true;
      } catch {
        // Try the next URL — some themes only render sections from specific pages.
      }
    }

    return false;
  }

  async function refreshCartCountFromServer() {
    const cart = await fetchCart();
    try {
      await refreshCartSections();
    } catch {
      updateCartCount(cart.item_count);
    }
    return cart;
  }

  function removeRowsForKeys(keys) {
    keys.forEach((key) => {
      const marker = document.querySelector(
        `[data-cart-item-key="${key}"], input[name="updates[${key}]"], quantity-input[data-key="${key}"]`,
      );
      const row = marker?.closest(
        ".cart-item, cart-items-component cart-item, .cart-items__row, tr.cart-item, .cart__item, [data-cart-item], .cart-drawer__item, .line-item, [class*='cart-item'], tbody tr",
      );
      row?.remove();
    });
  }

  function publishCartUpdate(cart) {
    document.documentElement.dispatchEvent(
      new CustomEvent("cart:refresh", { bubbles: true }),
    );
    document.dispatchEvent(
      new CustomEvent("cart:updated", { bubbles: true, detail: { cart } }),
    );
    document.dispatchEvent(
      new CustomEvent("cart:change", { bubbles: true, detail: { cart } }),
    );
  }

  async function applyCartUiUpdate(cart, removedKeys = []) {
    removeRowsForKeys(removedKeys);

    if (cart.sections) {
      applySectionsHtml(cart.sections);
    } else {
      await refreshCartSections().catch(() => undefined);
    }

    updateCartCount(cart.item_count);
    publishCartUpdate(cart);
    await enhanceCartUi();
  }

  let mutationChain = Promise.resolve();

  function enqueueCartMutation(cart) {
    mutationChain = mutationChain
      .then(() => processCartMutation(cart))
      .catch(() => refreshCartExperience());
  }

  async function processCartMutation(cart) {
    if (!cart || !Array.isArray(cart.items)) {
      await refreshCartExperience();
      return;
    }

    if (cart.sections) {
      applySectionsHtml(cart.sections);
    }

    const synced = await syncLinkedProtectionItemsFromCart(cart);
    if (synced) {
      return;
    }

    await applyCartUiUpdate(cart);
  }

  async function syncLinkedProtectionItemsFromCart(cart) {
    if (syncing) {
      return false;
    }

    syncing = true;
    try {
      const orphanedKeys = findOrphanedProtectionKeys(cart);
      if (!orphanedKeys.length) {
        return false;
      }

      const updatedCart = await removeLines(orphanedKeys);
      if (updatedCart) {
        await applyCartUiUpdate(updatedCart, orphanedKeys);
      }
      return Boolean(updatedCart);
    } finally {
      syncing = false;
    }
  }

  async function syncLinkedProtectionItems() {
    const cart = await fetchCart();
    return syncLinkedProtectionItemsFromCart(cart);
  }

  function findCartRow(item, index) {
    const selectors = [
      item.key ? `[data-cart-item-key="${item.key}"]` : null,
      item.key ? `input[name="updates[${item.key}]"]` : null,
      item.key ? `quantity-input[data-key="${item.key}"]` : null,
      `#CartItem-${index + 1}`,
      `#CartDrawer-Item-${index + 1}`,
      `[data-index="${index}"]`,
    ].filter(Boolean);

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) {
        return node.closest(
          ".cart-item, cart-items-component cart-item, .cart-items__row, tr.cart-item, .cart__item, [data-cart-item], .cart-drawer__item, .line-item, [class*='cart-item'], tbody tr",
        );
      }
    }

    return null;
  }

  function buildVariantSummaryTexts(item) {
    if (!isBookingItem(item)) {
      return [];
    }

    const size = item.properties.Size;
    const duration = item.properties.Duration;
    const durationShort = duration.replace(/\bdays?\b/i, "Days");

    return [
      `${size}, ${duration}`,
      `${size}, ${durationShort}`,
      `${size} / ${duration}`,
      `${size}/${duration}`,
      `${size}, ${duration.replace(/\s+/g, " ")}`,
    ];
  }

  function shouldHideVariantLine(text, item) {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized || normalized.length > 80) {
      return false;
    }

    if (
      /size\s*:|duration\s*:|delivery|event date|return date|color\s*:|for item|price\s*:/i.test(
        normalized,
      )
    ) {
      return false;
    }

    if (item) {
      const summaries = buildVariantSummaryTexts(item);
      const lower = normalized.toLowerCase();
      if (summaries.some((summary) => summary.toLowerCase() === lower)) {
        return true;
      }
    }

    return looksLikeVariantSummary(normalized);
  }

  function hideNode(node) {
    node.setAttribute("hidden", "hidden");
    node.style.display = "none";
    node.classList.add("gk-drobe-hide-variant-summary");
  }

  function hideVariantSummaryInRow(row, item) {
    if (!row) {
      return;
    }

    row.classList.add("gk-drobe-cart-item--booking");
    row.setAttribute("data-gk-drobe-booking", "true");

    const propertyContainers =
      ".cart-item__properties, [data-cart-item-properties], .cart-items__properties, .line-item-property, ul.discounts, .product-option dd, dl, .cart-item__details dl";

    row.querySelectorAll(
      [
        "p",
        "div",
        "span",
        "li",
        "dd",
        "dt",
        "small",
        ".cart-item__variant",
        ".cart-item__options",
        ".product-option",
        ".product-option--inline",
        ".caption-with-letter-spacing",
        ".cart-item__details > *",
        ".cart-items__details > *",
      ].join(", "),
    ).forEach((node) => {
      if (node === row || node.closest(propertyContainers) !== null) {
        return;
      }

      if (node.matches('a[href*="/products/"], .cart-item__name, .cart-item__title')) {
        return;
      }

      if (node.querySelector('dl, ul, [class*="properties"], a[href*="/products/"]')) {
        return;
      }

      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (shouldHideVariantLine(text, item)) {
        hideNode(node);
      }
    });

    const titleNode = row.querySelector(
      ".cart-item__name, .cart-item__details > a, .cart-items__title, .cart-item__title, a[href*='/products/']",
    );

    if (titleNode) {
      let sibling = titleNode.nextElementSibling;
      while (sibling) {
        if (
          sibling.matches(
            ".cart-item__properties, [data-cart-item-properties], .cart-items__properties, ul.discounts, dl",
          )
        ) {
          break;
        }

        const text = sibling.textContent.replace(/\s+/g, " ").trim();
        if (shouldHideVariantLine(text, item)) {
          hideNode(sibling);
        }

        sibling = sibling.nextElementSibling;
      }
    }
  }

  function findCartRowFallback(item) {
    const rowSelectors = [
      ".cart-item",
      "cart-items-component cart-item",
      ".cart-items__row",
      "tr.cart-item",
      ".cart__item",
      "[data-cart-item]",
      ".cart-drawer__item",
      ".line-item",
      "[class*='cart-item']",
      "tbody tr",
    ].join(", ");

    for (const row of document.querySelectorAll(rowSelectors)) {
      const text = row.textContent || "";
      if (
        text.includes(item.product_title) &&
        text.includes("Size:") &&
        text.includes("Duration:")
      ) {
        return row;
      }
    }

    return null;
  }

  async function enhanceCartUi() {
    try {
      const cart = await fetchCart();

      cart.items.forEach((item, index) => {
        if (!isBookingItem(item)) {
          return;
        }

        const row = findCartRow(item, index) || findCartRowFallback(item);
        hideVariantSummaryInRow(row, item);
      });
    } catch {
      document
        .querySelectorAll(
          ".cart-item, cart-items-component cart-item, .cart__item, [class*='cart-item'], tbody tr",
        )
        .forEach((row) => {
          const text = row.textContent || "";
          if (text.includes("Size:") && text.includes("Duration:")) {
            hideVariantSummaryInRow(row);
          }
        });
    }
  }

  function scheduleRefresh(delay = 0) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshCartExperience().catch(() => {
        enhanceCartUi();
      });
    }, delay);
  }

  async function refreshCartExperience() {
    await syncLinkedProtectionItems();
    const cart = await fetchCart().catch(() => null);
    if (!cart) {
      await enhanceCartUi();
      return;
    }

    await refreshCartSections().catch(() => undefined);
    updateCartCount(cart.item_count);
    publishCartUpdate(cart);
    await enhanceCartUi();
  }

  function handleCartMutationResponse(response) {
    response
      .clone()
      .json()
      .then((cart) => {
        enqueueCartMutation(cart);
      })
      .catch(() => {
        scheduleRefresh(0);
      });
  }

  function isCartMutationUrl(url) {
    const normalized = String(url || "");
    return (
      /\/cart(\.js)?(\/|$)/.test(normalized) &&
      /\/cart(\/|\.)(add|change|update|clear)/.test(normalized)
    );
  }

  function watchCartRequests() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const request = args[0];
      const url =
        typeof request === "string"
          ? request
          : request instanceof Request
            ? request.url
            : "";

      if (isCartMutationUrl(url) && !syncing) {
        handleCartMutationResponse(response);
      }

      return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
      this.addEventListener("loadend", () => {
        if (typeof url !== "string" || !isCartMutationUrl(url) || syncing) {
          return;
        }

        try {
          const cart = JSON.parse(this.responseText);
          enqueueCartMutation(cart);
        } catch {
          scheduleRefresh(0);
        }
      });
      return originalOpen.call(this, method, url, ...rest);
    };
  }

  function watchCartInteractions() {
    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        if (form instanceof HTMLFormElement && form.action.includes("/cart")) {
          scheduleRefresh(0);
        }
      },
      true,
    );

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        if (
          target.closest(
            'a[href*="/cart/change"], cart-remove-button, [data-cart-remove], button[name="remove"], .cart-remove-button, .cart-item__remove, [data-index], .quantity__button',
          )
        ) {
          scheduleRefresh(120);
        }
      },
      true,
    );
  }

  function observeCartDom() {
    const observer = new MutationObserver(() => {
      enhanceCartUi();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function init() {
    watchCartRequests();
    watchCartInteractions();
    observeCartDom();
    scheduleRefresh(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
