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

  function formatMoney(cents) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
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
    const href =
      node.getAttribute?.("href") ??
      node.querySelector?.("a[href*='/products/']")?.getAttribute("href");
    if (!href) {
      return null;
    }
    const match = href.match(/\/products\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  function currentProductHandle() {
    const match = window.location.pathname.match(/\/products\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
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
      return;
    }
    if (/day hire|\/\s*\d+\s*day/i.test(text)) {
      node.textContent = text.replace(
        /(?:A\$|\$)\s*[\d,]+\.?\d*/,
        formatted.replace(/\s/g, ""),
      );
      return;
    }
    if (/^Hire\s/i.test(text)) {
      node.textContent = `Hire ${formatted}`;
      return;
    }
    node.textContent = formatted;
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
    window.requestAnimationFrame(() => {
      patchPredictiveAndCards().catch(() => undefined);
      patchProductPage().catch(() => undefined);
    });
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.addedNodes?.length) {
        schedulePatch();
        break;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("shopify:section:load", schedulePatch);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedulePatch);
  } else {
    schedulePatch();
  }
})();