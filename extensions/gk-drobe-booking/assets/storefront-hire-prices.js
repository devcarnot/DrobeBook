(() => {
  if (window.__gkDrobeStorefrontHirePricesInit) {
    return;
  }
  window.__gkDrobeStorefrontHirePricesInit = true;

  const helpers = window.__gkDrobeStorefrontHireVariants;
  if (!helpers) {
    return;
  }

  const ROOT = window.Shopify?.routes?.root || "/";
  const productCache = new Map();
  let patchTimer = 0;

  function formatMoney(cents) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  }

  function handleFromHref(href) {
    const match = String(href || "").match(/\/products\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  async function loadProduct(handle) {
    if (!handle) {
      return null;
    }
    if (productCache.has(handle)) {
      return productCache.get(handle);
    }
    try {
      const response = await fetch(`${ROOT}products/${handle}.js`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        return null;
      }
      const product = await response.json();
      productCache.set(handle, product);
      return product;
    } catch {
      return null;
    }
  }

  function productHandleFromNode(node) {
    const link = node.matches?.('a[href*="/products/"]')
      ? node
      : node.querySelector?.('a[href*="/products/"]');
    if (!link) {
      return null;
    }
    return handleFromHref(link.getAttribute("href"));
  }

  function currentProductHandle() {
    return handleFromHref(window.location.pathname);
  }

  function looksLikeDisplayedHirePrice(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return false;
    }
    return (
      /A\$|\$|£|€/.test(normalized) &&
      !/RRP/i.test(normalized) &&
      !/sold out/i.test(normalized)
    );
  }

  function applyHirePriceToNode(node, formatted) {
    const text = node.textContent?.trim() ?? "";
    if (!looksLikeDisplayedHirePrice(text)) {
      return false;
    }
    if (/day hire|\/\s*\d+\s*day/i.test(text)) {
      node.textContent = text.replace(
        /(?:A\$|\$)\s*[\d,]+\.?\d*/,
        formatted.replace(/\s/g, ""),
      );
      return true;
    }
    if (/^Hire\s/i.test(text)) {
      node.textContent = `Hire ${formatted}`;
      return true;
    }
    node.textContent = formatted;
    return true;
  }

  function hirePriceNodesIn(container) {
    const nodes = [];
    container.querySelectorAll("span, p, div, small, strong, .price, .money").forEach((node) => {
      if (node.children.length > 2) {
        return;
      }
      const text = node.textContent?.trim() ?? "";
      if (/^Hire\s/i.test(text) && looksLikeDisplayedHirePrice(text)) {
        nodes.push(node);
      }
    });
    return nodes;
  }

  function patchHirePriceNodes(container, formatted) {
    let changed = false;
    hirePriceNodesIn(container).forEach((node) => {
      if (applyHirePriceToNode(node, formatted)) {
        changed = true;
      }
    });
    if (!changed) {
      container.querySelectorAll(".price, .money, [class*='price']").forEach((node) => {
        if (applyHirePriceToNode(node, formatted)) {
          changed = true;
        }
      });
    }
    return changed;
  }

  function patchPriceNodes(root, formatted) {
    root.querySelectorAll(
      [
        ".price",
        ".money",
        "[class*='price-item']",
        "[data-gk-hire-cost]",
        ".product-price",
        ".price__regular",
      ].join(", "),
    ).forEach((node) => {
      if (node.closest(".cart-item, cart-items-component, .gk-drobe-booking")) {
        return;
      }
      applyHirePriceToNode(node, formatted);
    });
    patchHirePriceNodes(root, formatted);
  }

  function isSearchOverlayContext(node) {
    return Boolean(
      node?.closest?.(
        [
          "predictive-search",
          ".predictive-search",
          ".predictive-search-results",
          ".search-modal",
          ".search-drawer",
          ".header__search",
          ".header__search-details",
          "details-modal",
          "dialog[open]",
          "[class*='PredictiveSearch']",
          "[class*='predictive-search']",
          "[class*='SearchModal']",
        ].join(", "),
      ),
    );
  }

  function resultRowForLink(link) {
    return (
      link.closest(
        'li, article, [class*="item"], [class*="result"], [class*="card"], [class*="product"]',
      ) ?? link.parentElement
    );
  }

  async function patchSearchOverlayPrices() {
    const links = [...document.querySelectorAll('a[href*="/products/"]')].filter((link) =>
      isSearchOverlayContext(link),
    );

    const jobs = links.map(async (link) => {
      const handle = handleFromHref(link.getAttribute("href"));
      if (!handle) {
        return;
      }
      const row = resultRowForLink(link);
      if (!row) {
        return;
      }
      const product = await loadProduct(handle);
      const minCents = helpers.mainHireMinCentsFromVariants(product?.variants);
      if (minCents == null) {
        return;
      }
      patchHirePriceNodes(row, formatMoney(minCents));
    });

    await Promise.all(jobs);
  }

  async function patchCard(card) {
    const handle = productHandleFromNode(card);
    if (!handle) {
      return;
    }
    const product = await loadProduct(handle);
    const minCents = helpers.mainHireMinCentsFromVariants(product?.variants);
    if (minCents == null) {
      return;
    }
    patchPriceNodes(card, formatMoney(minCents));
  }

  async function patchPredictiveAndCards(root = document) {
    const cards = root.querySelectorAll(
      [
        ".predictive-search__item",
        ".predictive-search__result",
        "[data-predictive-search-result]",
        ".resource-card",
        ".product-card",
        ".card-wrapper",
        "li.grid__item",
      ].join(", "),
    );

    await Promise.all([...cards].map((card) => patchCard(card)));
    await patchSearchOverlayPrices();
  }

  async function patchProductPage() {
    const handle = currentProductHandle();
    if (!handle) {
      return;
    }
    const product = await loadProduct(handle);
    const minCents = helpers.mainHireMinCentsFromVariants(product?.variants);
    if (minCents == null) {
      return;
    }
    const formatted = formatMoney(minCents);
    const scope =
      document.querySelector(".product, .product__info-wrapper, main") ?? document;
    patchPriceNodes(scope, formatted);
  }

  function schedulePatch() {
    window.clearTimeout(patchTimer);
    patchTimer = window.setTimeout(() => {
      patchPredictiveAndCards().catch(() => undefined);
      patchProductPage().catch(() => undefined);
    }, 80);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.addedNodes?.length || record.type === "characterData") {
        schedulePatch();
        break;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      (target.type === "search" || /search/i.test(target.name || "") || /search/i.test(target.id || ""))
    ) {
      schedulePatch();
    }
  });

  document.addEventListener("shopify:section:load", schedulePatch);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedulePatch);
  } else {
    schedulePatch();
  }
})();