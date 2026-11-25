(() => {
  if (window.__gkDrobeStorefrontHirePricesInit) {
    return;
  }
  window.__gkDrobeStorefrontHirePricesInit = true;

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

  function isBackupVariantOptions(options) {
    if (!Array.isArray(options)) {
      return false;
    }
    return options.some((value) => {
      const normalized = String(value ?? "")
        .trim()
        .toLowerCase();
      return (
        normalized.includes("backup (80% off)") ||
        normalized.endsWith("· backup") ||
        normalized.endsWith("(backup") ||
        /backup.*80%/.test(normalized)
      );
    });
  }

  function mainHireMinCents(variants) {
    const hireable = (variants ?? []).filter(
      (variant) => !isBackupVariantOptions(variant.options),
    );
  const source = hireable.length ? hireable : variants ?? [];
    if (!source.length) {
      return null;
    }
    return Math.min(...source.map((variant) => Number(variant.price)));
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

  function priceNodesIn(root) {
    return root.querySelectorAll(
      [
        ".predictive-search__item .price",
        ".predictive-search__result .price",
        "[data-predictive-search-result] .price",
        ".search-modal__content .price",
        ".header__search .price",
        ".product-card .price",
      ].join(", "),
    );
  }

  function hirePriceLabelsIn(root) {
    return root.querySelectorAll(
      ".price, [class*='price']",
    );
  }

  async function patchPredictivePrices(root = document) {
    const cards = root.querySelectorAll(
      [
        ".predictive-search__item",
        ".predictive-search__result",
        "[data-predictive-search-result]",
        ".resource-card",
      ].join(", "),
    );

    const jobs = [...cards].map(async (card) => {
      const handle = productHandleFromNode(card);
      if (!handle) {
        return;
      }
      const product = await loadProduct(handle);
      const minCents = mainHireMinCents(product?.variants);
      if (minCents == null) {
        return;
      }

      const formatted = formatMoney(minCents);
      const priceEls = card.querySelectorAll(
        ".price, .money, [class*='price-item'], [class*='Price']",
      );
      priceEls.forEach((node) => {
        const text = node.textContent?.trim() ?? "";
        if (/A\$|\$|£|€|From/i.test(text)) {
          node.textContent = text.match(/Hire/i)
            ? `Hire ${formatted}`
            : formatted;
        }
      });
    });

    await Promise.all(jobs);
  }

  function schedulePatch() {
    window.requestAnimationFrame(() => {
      patchPredictivePrices().catch(() => undefined);
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