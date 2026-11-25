(() => {
  if (window.__gkDrobeBackupPricingInit) {
    return;
  }
  window.__gkDrobeBackupPricingInit = true;

  const ROOT = window.Shopify?.routes?.root || "/";
  const PROXY_BASE = `${ROOT}apps/gk-drobe`;
  const MAIN_TIER = "main";
  const BACKUP_TIER = "backup";
  const TIER_PROP = "_gk_hire_tier";
  const GROUP_PROP = "_gk_hire_group";
  const TYPE_PROP = "Hire type";
  const MAIN_LABEL = "Main Hire";
  const BACKUP_LABEL = "Backup Dress · 80% OFF";
  const PAY_FRACTION = 0.2;
  const HIDDEN_PROPS = new Set([
    TIER_PROP,
    GROUP_PROP,
    TYPE_PROP,
    "Original hire price",
    "Backup discount",
  ]);

  let syncing = false;
  let variantMapCache = null;
  let variantMapFetchedAt = 0;

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

  function catalogPriceCents(item, variantMap) {
    const entry = variantMap?.variants?.[String(item.variant_id)];
    if (entry?.mainPriceCents) {
      return entry.mainPriceCents;
    }
    const unit = item.final_price ?? item.price ?? 0;
    if (entry?.isBackupVariant) {
      return Math.round(unit / PAY_FRACTION);
    }
    return unit;
  }

  async function fetchVariantMap(cartItems) {
    const ids = [...new Set((cartItems ?? []).map((item) => String(item.variant_id)).filter(Boolean))];
    if (!ids.length) {
      return { variants: {} };
    }

    const now = Date.now();
    if (variantMapCache && now - variantMapFetchedAt < 60_000) {
      const missing = ids.some((id) => !variantMapCache.variants[id]);
      if (!missing) {
        return variantMapCache;
      }
    }

    const response = await fetch(
      `${PROXY_BASE}/api/backup-variant-map?variantIds=${encodeURIComponent(ids.join(","))}`,
      { credentials: "same-origin" },
    );
    if (!response.ok) {
      return variantMapCache ?? { variants: {} };
    }
    const data = await response.json();
    variantMapCache = data;
    variantMapFetchedAt = now;
    return data;
  }

  function targetVariantId(item, tier, variantMap) {
    const entry = variantMap?.variants?.[String(item.variant_id)];
    if (!entry) {
      return null;
    }
    if (tier === BACKUP_TIER) {
      return entry.backupVariantId;
    }
    return entry.mainVariantId;
  }

  function computeAssignments(cartItems, variantMap) {
    const lines = cartItems.map((item) => ({
      key: item.key,
      variantId: String(item.variant_id),
      priceCents: catalogPriceCents(item, variantMap),
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

        const merged = {
          ...line.properties,
          [TIER_PROP]: tier,
          [GROUP_PROP]: groupKey,
          [TYPE_PROP]: tier === BACKUP_TIER ? BACKUP_LABEL : MAIN_LABEL,
        };

        Object.keys(merged).forEach((key) => {
          if (HIDDEN_PROPS.has(key) || key === "Original hire price" || key === "Backup discount") {
            delete merged[key];
          }
        });

        assignments.push({
          key: line.key,
          variantId: line.variantId,
          tier,
          targetVariantId: null,
          originalCents,
          chargedCents,
          discountCents: isBackup ? originalCents - chargedCents : 0,
          properties: merged,
        });
      });
    }

    const itemsByKey = new Map(
      (cartItems ?? []).map((item) => [item.key, item]),
    );

    for (const assignment of assignments) {
      const item = itemsByKey.get(assignment.key);
      if (!item) {
        continue;
      }
      assignment.targetVariantId = targetVariantId(item, assignment.tier, variantMap);
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

  async function swapLineVariant(item, targetVariantId, properties) {
    const quantity = item.quantity ?? 1;
    const addResponse = await fetch(`${ROOT}cart/add.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        items: [
          {
            id: Number(targetVariantId),
            quantity,
            properties,
          },
        ],
      }),
    });
    if (!addResponse.ok) {
      throw new Error("cart add failed");
    }
    let cart = await addResponse.json();

    const changeResponse = await fetch(`${ROOT}cart/change.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id: item.key, quantity: 0 }),
    });
    if (!changeResponse.ok) {
      throw new Error("cart change failed");
    }
    cart = await changeResponse.json();
    return cart;
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

  async function syncBackupDressCart(cart, variantMap) {
    if (syncing) {
      return cart;
    }

    const assignments = computeAssignments(cart.items ?? [], variantMap);
    if (!assignments.length) {
      return cart;
    }

    const itemsByKey = new Map(
      (cart.items ?? []).map((item) => [
        item.key,
        {
          properties: normalizeProperties(item.properties),
          quantity: item.quantity ?? 1,
          variantId: String(item.variant_id),
          raw: item,
        },
      ]),
    );

    let changed = false;
    syncing = true;
    try {
      for (const assignment of assignments) {
        const current = itemsByKey.get(assignment.key);
        if (!current) {
          continue;
        }

        const needsVariantSwap =
          assignment.targetVariantId &&
          String(assignment.targetVariantId) !== current.variantId;
        const needsProps = propertiesNeedUpdate(
          current.properties,
          assignment.properties,
        );

        if (!needsVariantSwap && !needsProps) {
          continue;
        }

        changed = true;
        if (needsVariantSwap) {
          cart = await swapLineVariant(
            current.raw,
            assignment.targetVariantId,
            assignment.properties,
          );
          itemsByKey.clear();
          for (const item of cart.items ?? []) {
            itemsByKey.set(item.key, {
              properties: normalizeProperties(item.properties),
              quantity: item.quantity ?? 1,
              variantId: String(item.variant_id),
              raw: item,
            });
          }
        } else if (needsProps) {
          cart = await changeLineProperties(
            assignment.key,
            current.quantity,
            assignment.properties,
          );
        }
      }
    } finally {
      syncing = false;
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
    const rows = document.querySelectorAll(
      ".cart-item, .cart__item, cart-items-component cart-item, tbody tr",
    );
    return rows[index] ?? null;
  }

  function findPriceHost(row) {
    return (
      row?.querySelector(
        [
          ".cart-item__price-wrapper",
          ".cart-item__price",
          ".cart-item__totals",
          ".cart-items__price",
          ".product-option",
          "[data-cart-item-price]",
          ".line-item__price",
          ".price",
        ].join(", "),
      ) ?? row
    );
  }

  function hideNativeLinePrice(row) {
    const hosts = row?.querySelectorAll(
      ".cart-item__price, .cart-item__totals .price, .price, .product-option--price, [data-cart-item-price]",
    );
    hosts?.forEach((node) => {
      if (node.closest(".gk-backup-dress-price-wrap")) {
        return;
      }
      node.classList.add("gk-backup-dress-price--hidden");
    });
  }

  function enhanceBackupDressUi(cart, variantMap) {
    const assignments = new Map(
      computeAssignments(cart.items ?? [], variantMap).map((row) => [row.key, row]),
    );

    (cart.items ?? []).forEach((item, index) => {
      const assignment = assignments.get(item.key);
      if (!assignment) {
        return;
      }

      const row = findCartRow(item, index);
      if (!row) {
        return;
      }

      row.classList.add("gk-backup-dress-row");
      row.dataset.gkHireTier = assignment.tier;
      hideNativeLinePrice(row);

      let topHost =
        row.querySelector(".cart-item__details, .cart-item__name, .cart-item__media") ||
        row;
      if (topHost === row && row.querySelector(".cart-item__details")) {
        topHost = row.querySelector(".cart-item__details");
      }

      let pill = row.querySelector(".gk-backup-dress-pill");
      if (!pill) {
        pill = document.createElement("div");
        pill.className = "gk-backup-dress-pill";
        pill.setAttribute("data-gk-backup-pill", "true");
        topHost.appendChild(pill);
      }

      const isBackup = assignment.tier === BACKUP_TIER;
      pill.textContent = isBackup ? BACKUP_LABEL : "Main Hire";
      pill.classList.toggle("gk-backup-dress-pill--main", !isBackup);
      pill.classList.toggle("gk-backup-dress-pill--backup", isBackup);

      let priceWrap = row.querySelector(".gk-backup-dress-price-wrap");
      if (!priceWrap) {
        priceWrap = document.createElement("div");
        priceWrap.className = "gk-backup-dress-price-wrap";
        priceWrap.setAttribute("data-gk-backup-price", "true");
        findPriceHost(row).appendChild(priceWrap);
      }

      const unitCents = catalogPriceCents(item, variantMap);
      const mapEntry = variantMap?.variants?.[String(item.variant_id)];
      const liveUnitCents = item.final_price ?? item.price ?? unitCents;
      const onBackupVariant = Boolean(mapEntry?.isBackupVariant);
      const chargedCents = isBackup
        ? onBackupVariant
          ? liveUnitCents
          : Math.round(unitCents * PAY_FRACTION)
        : liveUnitCents;
      const savingCents = isBackup ? unitCents - chargedCents : 0;

      if (isBackup) {
        priceWrap.innerHTML = `
          <div class="gk-backup-dress-price">
            <span class="gk-backup-dress-price__current">${formatMoney(chargedCents)}</span>
            <span class="gk-backup-dress-price__compare">${formatMoney(unitCents)}</span>
            <span class="gk-backup-dress-price__off">80% OFF</span>
            <span class="gk-backup-dress-price__saving">You save ${formatMoney(savingCents)}</span>
          </div>
        `;
      } else {
        priceWrap.innerHTML = `
          <div class="gk-backup-dress-price gk-backup-dress-price--main">
            <span class="gk-backup-dress-price__current">${formatMoney(unitCents)}</span>
          </div>
        `;
      }
    });

    updateCartSubtotalBanner(cart, variantMap);
  }

  function cartSubtotalCents(cart, variantMap) {
    return (cart.items ?? []).reduce((sum, item) => {
      const qty = item.quantity ?? 1;
      const assignment = computeAssignments([item], variantMap)[0];
      if (assignment) {
        const unit =
          assignment.tier === BACKUP_TIER
            ? (item.final_price ?? assignment.chargedCents)
            : (item.final_price ?? assignment.chargedCents);
        return sum + unit * qty;
      }
      return sum + (item.final_line_price ?? item.line_price ?? 0);
    }, 0);
  }

  function updateCartSubtotalBanner(cart, variantMap) {
    const assignments = computeAssignments(cart.items ?? [], variantMap);
    let banner = document.querySelector(".gk-backup-dress-subtotal-note");
    if (!assignments.length) {
      banner?.remove();
      return;
    }

    const subtotalCents = cartSubtotalCents(cart, variantMap);

    if (!banner) {
      banner = document.createElement("div");
      banner.className = "gk-backup-dress-subtotal-note";
      const anchor =
        document.querySelector(".cart__footer, .cart__blocks, #main-cart-footer, .totals") ||
        document.querySelector("form[action='/cart']");
      if (anchor) {
        anchor.prepend(banner);
      }
    }

    const pendingSwap = assignments.some((row) => {
      const item = (cart.items ?? []).find((line) => line.key === row.key);
      return (
        item &&
        row.targetVariantId &&
        String(row.targetVariantId) !== String(item.variant_id)
      );
    });

    banner.innerHTML = `
      <p class="gk-backup-dress-subtotal-note__label">Estimated total</p>
      <p class="gk-backup-dress-subtotal-note__amount">${formatMoney(subtotalCents)}</p>
      ${pendingSwap ? '<p class="gk-backup-dress-subtotal-note__hint">Updating line prices…</p>' : ""}
    `;
    banner.classList.toggle("gk-backup-dress-subtotal-note--syncing", pendingSwap);
  }

  async function runBackupDressPricing(cart, options = {}) {
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
      const variantMap = await fetchVariantMap(cart.items ?? []);
      let synced = cart;
      if (!options.uiOnly) {
        synced = await syncBackupDressCart(cart, variantMap);
        if (synced !== cart) {
          variantMapCache = null;
          window.dispatchEvent(new CustomEvent("cart:updated"));
        }
      }
      enhanceBackupDressUi(synced, variantMap);
      return synced;
    } catch (error) {
      enhanceBackupDressUi(cart, variantMapCache ?? { variants: {} });
    }
  }

  window.__gkRunBackupDressPricing = runBackupDressPricing;

  document.addEventListener("cart:updated", () => runBackupDressPricing());
  document.addEventListener("cart:change", () => runBackupDressPricing());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => runBackupDressPricing());
  } else {
    runBackupDressPricing();
  }
})();