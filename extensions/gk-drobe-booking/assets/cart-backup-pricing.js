(() => {
  if (window.__gkDrobeBackupPricingInit) {
    return;
  }
  window.__gkDrobeBackupPricingInit = true;

  const ROOT = window.Shopify?.routes?.root || "/";
  const MAIN_TIER = "main";
  const BACKUP_TIER = "backup";
  const TIER_PROP = "_gk_hire_tier";
  const GROUP_PROP = "_gk_hire_group";
  const TYPE_PROP = "Hire type";
  const ORIGINAL_PROP = "Original hire price";
  const DISCOUNT_PROP = "Backup discount";
  const MAIN_LABEL = "Main Hire — Full Price";
  const BACKUP_LABEL = "Backup Dress — 80% Discount";
  const PAY_FRACTION = 0.2;

  let syncing = false;

  function normalizeProperties(properties) {
    if (!properties) {
      return {};
    }
    if (Array.isArray(properties)) {
      const normalized = {};
      properties.forEach((entry) => {
        if (entry?.name != null) {
          normalized[String(entry.name)] = entry.value == null ? "" : String(entry.value);
        }
      });
      return normalized;
    }
    return { ...properties };
  }

  function normalizeToken(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isGownHireLine(properties) {
    if (properties._gk_clutch_upsell === "true") {
      return false;
    }
    if (properties["For item"] && !properties["Delivery Date"]) {
      return false;
    }
    const size = properties._Size ?? properties.Size;
    const duration = properties._Duration ?? properties.Duration;
    if (!size || !duration) {
      return false;
    }
    return Boolean(properties["Delivery Date"] && properties["Return Date"]);
  }

  function hirePeriodGroupKey(properties) {
    const delivery = normalizeToken(properties["Delivery Date"]);
    const returnDate = normalizeToken(properties["Return Date"]);
    const duration = normalizeToken(properties._Duration ?? properties.Duration);
    if (!delivery || !returnDate) {
      return null;
    }
    return `${delivery.toLowerCase()}|${returnDate.toLowerCase()}|${duration.toLowerCase()}`;
  }

  function allocateHireTierCounts(total) {
    if (total <= 0) {
      return { fullPriceCount: 0, backupCount: 0 };
    }
    return {
      fullPriceCount: Math.ceil(total / 2),
      backupCount: Math.floor(total / 2),
    };
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  }

  function computeAssignments(cartItems) {
    const lines = cartItems.map((item) => ({
      key: item.key,
      priceCents: item.final_price ?? item.price ?? 0,
      properties: normalizeProperties(item.properties),
    }));

    const eligible = lines.filter((line) => isGownHireLine(line.properties));
    const byGroup = new Map();

    eligible.forEach((line) => {
      const groupKey = hirePeriodGroupKey(line.properties);
      if (!groupKey) {
        return;
      }
      const bucket = byGroup.get(groupKey) ?? [];
      bucket.push(line);
      byGroup.set(groupKey, bucket);
    });

    const assignments = [];

    for (const [groupKey, groupLines] of byGroup) {
      const sorted = [...groupLines].sort((a, b) => b.priceCents - a.priceCents);
      const { fullPriceCount } = allocateHireTierCounts(sorted.length);

      sorted.forEach((line, index) => {
        const isBackup = index >= fullPriceCount;
        const tier = isBackup ? BACKUP_TIER : MAIN_TIER;
        const originalCents = line.priceCents;
        const chargedCents = isBackup ? Math.round(originalCents * PAY_FRACTION) : originalCents;
        const discountCents = isBackup ? originalCents - chargedCents : 0;
        const hireLabel = isBackup ? BACKUP_LABEL : MAIN_LABEL;

        const merged = {
          ...line.properties,
          [TIER_PROP]: tier,
          [GROUP_PROP]: groupKey,
          [TYPE_PROP]: hireLabel,
          [ORIGINAL_PROP]: formatMoney(originalCents),
        };

        if (isBackup && discountCents > 0) {
          merged[DISCOUNT_PROP] = `-${formatMoney(discountCents)}`;
        } else {
          delete merged[DISCOUNT_PROP];
        }

        assignments.push({
          key: line.key,
          tier,
          originalCents,
          chargedCents,
          discountCents,
          properties: merged,
        });
      });
    }

    return assignments;
  }

  function propertiesNeedUpdate(current, next) {
    const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
    for (const key of keys) {
      if (normalizeToken(current[key]) !== normalizeToken(next[key])) {
        return true;
      }
    }
    return false;
  }

  async function changeLineProperties(key, quantity, properties) {
    const response = await fetch(`${ROOT}cart/change.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id: key, quantity, properties }),
    });
    if (!response.ok) {
      throw new Error("cart change failed");
    }
    return response.json();
  }

  async function syncBackupDressProperties(cart) {
    if (syncing) {
      return cart;
    }

    const assignments = computeAssignments(cart.items ?? []);
    if (!assignments.length) {
      return cart;
    }

    const itemsByKey = new Map(
      (cart.items ?? []).map((item) => [
        item.key,
        {
          properties: normalizeProperties(item.properties),
          quantity: item.quantity ?? 1,
        },
      ]),
    );

    let changed = false;
    for (const assignment of assignments) {
      const current = itemsByKey.get(assignment.key);
      if (!current || !propertiesNeedUpdate(current.properties, assignment.properties)) {
        continue;
      }
      changed = true;
      syncing = true;
      try {
        cart = await changeLineProperties(
          assignment.key,
          current.quantity,
          assignment.properties,
        );
      } finally {
        syncing = false;
      }
    }

    return changed ? cart : cart;
  }

  function findCartRow(item, index) {
    const selectors = [
      `[data-cart-item-key="${item.key}"]`,
      `[data-key="${item.key}"]`,
      `[data-cart-item="${index + 1}"]`,
      `[data-line="${index + 1}"]`,
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) {
        return node;
      }
    }
    return null;
  }

  function findPriceHost(row) {
    return (
      row?.querySelector(
        [
          ".cart-item__price-wrapper",
          ".cart-item__price",
          ".cart-items__price",
          ".cart-item__totals .price",
          ".product-option",
          "[data-cart-item-price]",
          ".line-item__price",
        ].join(", "),
      ) ?? row
    );
  }

  function enhanceBackupDressUi(cart) {
    const assignments = new Map(
      computeAssignments(cart.items ?? []).map((row) => [row.key, row]),
    );

    (cart.items ?? []).forEach((item, index) => {
      const assignment = assignments.get(item.key);
      if (!assignment) {
        return;
      }

      const row =
        findCartRow(item, index) ||
        document.querySelectorAll(".cart-item, .cart__item, cart-items-component cart-item, tbody tr")[
          index
        ];
      if (!row) {
        return;
      }

      row.classList.add("gk-backup-dress-row");
      row.dataset.gkHireTier = assignment.tier;

      let badge = row.querySelector(".gk-backup-dress-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "gk-backup-dress-badge";
        badge.setAttribute("data-gk-backup-badge", "true");
        const host = findPriceHost(row);
        host.appendChild(badge);
      }

      const isBackup = assignment.tier === BACKUP_TIER;
      badge.textContent = isBackup ? "BACKUP DRESS" : "MAIN HIRE";
      badge.classList.toggle("gk-backup-dress-badge--main", !isBackup);
      badge.classList.toggle("gk-backup-dress-badge--backup", isBackup);

      let priceOverlay = row.querySelector(".gk-backup-dress-price");
      if (!priceOverlay) {
        priceOverlay = document.createElement("div");
        priceOverlay.className = "gk-backup-dress-price";
        priceOverlay.setAttribute("data-gk-backup-price", "true");
        findPriceHost(row).appendChild(priceOverlay);
      }

      if (isBackup) {
        priceOverlay.innerHTML = `
          <span class="gk-backup-dress-price__current">${formatMoney(assignment.chargedCents)}</span>
          <span class="gk-backup-dress-price__compare">${formatMoney(assignment.originalCents)}</span>
          <span class="gk-backup-dress-price__saving">${BACKUP_LABEL}</span>
        `;
      } else {
        priceOverlay.innerHTML = `
          <span class="gk-backup-dress-price__current">${formatMoney(assignment.originalCents)}</span>
          <span class="gk-backup-dress-price__saving">${MAIN_LABEL}</span>
        `;
      }
    });
  }

  async function runBackupDressPricing(cart) {
    if (!cart) {
      try {
        const response = await fetch(`${ROOT}cart.js`, { credentials: "same-origin" });
        if (!response.ok) {
          return;
        }
        cart = await response.json();
      } catch {
        return;
      }
    }

    try {
      const synced = await syncBackupDressProperties(cart);
      enhanceBackupDressUi(synced);
    } catch {
      enhanceBackupDressUi(cart);
    }
  }

  window.__gkRunBackupDressPricing = runBackupDressPricing;

  if (/\/cart\/?$/i.test(window.location.pathname)) {
    document.addEventListener("cart:updated", () => runBackupDressPricing());
    document.addEventListener("cart:change", () => runBackupDressPricing());
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => runBackupDressPricing());
    } else {
      runBackupDressPricing();
    }
  }
})();