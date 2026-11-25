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
  const MIN_GROUP_FOR_BACKUP = 2;

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
      return { enabled: true, variants: {} };
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
      return variantMapCache ?? { enabled: true, variants: {} };
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
      if (groupLines.length < MIN_GROUP_FOR_BACKUP) {
        continue;
      }
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

        delete merged["Backup discount"];
        delete merged[TIER_PROP];
        delete merged[GROUP_PROP];
        if (isBackup) {
          merged["Original hire price"] = formatMoney(originalCents);
        } else {
          delete merged["Original hire price"];
        }

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

  function cleanupSoloGownProperties(properties) {
    const next = { ...properties };
    delete next[TIER_PROP];
    delete next[GROUP_PROP];
    delete next[TYPE_PROP];
    delete next["Original hire price"];
    delete next["Backup discount"];
    return next;
  }

  function soloGownHasBackupArtifacts(properties, variantMap, variantId) {
    const entry = variantMap?.variants?.[String(variantId)];
    if (entry?.isBackupVariant) {
      return true;
    }
    const cleaned = cleanupSoloGownProperties(properties);
    return propertiesNeedUpdate(properties, cleaned);
  }

  async function swapLineVariant(item, targetVariantId, properties) {
    const quantity = item.quantity ?? 1;
    const variantId = Number.parseInt(String(targetVariantId), 10);
    const addResponse = await fetch(`${ROOT}cart/add.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        items: [
          {
            id: variantId,
            quantity,
            properties,
          },
        ],
      }),
    });
    if (!addResponse.ok) {
      const body = await addResponse.json().catch(() => ({}));
      const message =
        body?.description || body?.message || `cart add failed (${addResponse.status})`;
      throw new Error(message);
    }

    const changeResponse = await fetch(`${ROOT}cart/change.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id: item.key, quantity: 0 }),
    });
    if (!changeResponse.ok) {
      throw new Error("cart change failed");
    }
    return changeResponse.json();
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
      return { cart, changed: false };
    }

    const assignments = computeAssignments(cart.items ?? [], variantMap);
    if (!assignments.length) {
      return { cart, changed: false };
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

    const assignedKeys = new Set(assignments.map((row) => row.key));
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

      for (const item of cart.items ?? []) {
        if (assignedKeys.has(item.key)) {
          continue;
        }
        const props = normalizeProperties(item.properties);
        if (!isGownHireLine(props)) {
          continue;
        }

        const current = itemsByKey.get(item.key);
        if (!current) {
          continue;
        }

        const cleaned = cleanupSoloGownProperties(props);
        const entry = variantMap?.variants?.[String(item.variant_id)];
        const onBackupVariant = Boolean(entry?.isBackupVariant);
        const mainVariantId = onBackupVariant ? entry?.mainVariantId : null;

        if (
          !onBackupVariant &&
          !soloGownHasBackupArtifacts(props, variantMap, item.variant_id)
        ) {
          continue;
        }

        changed = true;
        if (onBackupVariant && mainVariantId) {
          cart = await swapLineVariant(item, mainVariantId, cleaned);
          itemsByKey.clear();
          for (const row of cart.items ?? []) {
            itemsByKey.set(row.key, {
              properties: normalizeProperties(row.properties),
              quantity: row.quantity ?? 1,
              variantId: String(row.variant_id),
              raw: row,
            });
          }
        } else {
          cart = await changeLineProperties(item.key, item.quantity ?? 1, cleaned);
        }
      }
    } finally {
      syncing = false;
    }

    return { cart, changed };
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

  function findPillHost(row) {
    const name =
      row.querySelector(
        ".cart-item__name, .cart-item__details > a, .cart-item__details > h2, .cart-item__details > h3",
      ) ?? row.querySelector(".cart-item__details");
    return name?.parentElement ?? name ?? row;
  }

  function findTotalsHost(row) {
    return (
      row.querySelector(".cart-item__totals, .cart-items__totals, td:last-child") ??
      row
    );
  }

  function hideStrayPricesInDetails(row) {
    const details = row.querySelector(".cart-item__details, .cart-item__info");
    if (!details) {
      return;
    }
    details.querySelectorAll(".price, .product-option").forEach((node) => {
      if (node.closest(".gk-backup-dress-price-wrap")) {
        return;
      }
      node.classList.add("gk-backup-dress-price--hidden");
    });
  }

  function pricingIsLive(assignment, item, variantMap) {
    if (assignment.tier !== BACKUP_TIER) {
      return true;
    }
    const mapEntry = variantMap?.variants?.[String(item.variant_id)];
    if (mapEntry?.isBackupVariant) {
      return true;
    }
    return (
      assignment.targetVariantId &&
      String(assignment.targetVariantId) === String(item.variant_id)
    );
  }

  function clearBackupUiArtifacts() {
    document
      .querySelectorAll(".gk-backup-dress-subtotal-note, .gk-backup-dress-setup-note")
      .forEach((node) => node.remove());
  }

  function clearRowBackupDressUi(row) {
    if (!row) {
      return;
    }
    row.classList.remove("gk-backup-dress-row");
    delete row.dataset.gkHireTier;
    row.querySelector(".gk-backup-dress-pill")?.remove();
    row.querySelector(".gk-backup-dress-price-wrap")?.remove();
    row.querySelectorAll(".gk-backup-dress-price--hidden").forEach((node) => {
      node.classList.remove("gk-backup-dress-price--hidden");
    });
  }

  function patchThemeSubtotals(cart) {
    if (!cart) {
      return;
    }
    const subtotalCents = cart.items_subtotal_price ?? 0;
    const totalCents = cart.total_price ?? subtotalCents;
    const subtotalText = formatMoney(subtotalCents);
    const totalText = formatMoney(totalCents);

    const subtotalSelectors = [
      ".totals__subtotal-value",
      ".cart__subtotal .price",
      "[data-cart-subtotal]",
      "#main-cart-footer .totals .product-option",
    ];
    subtotalSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.textContent = subtotalText;
      });
    });

    document.querySelectorAll(".totals__total-value, .cart__total .price").forEach((node) => {
      node.textContent = totalText;
    });
  }

  function showSetupNoticeIfNeeded(cart, variantMap) {
    const assignments = computeAssignments(cart.items ?? [], variantMap);
    const needsSetup = assignments.some((row) => {
      if (row.tier !== BACKUP_TIER) {
        return false;
      }
      const item = (cart.items ?? []).find((line) => line.key === row.key);
      return item && !row.targetVariantId && !pricingIsLive(row, item, variantMap);
    });

    document.querySelector(".gk-backup-dress-setup-note")?.remove();
    if (!needsSetup) {
      return;
    }

    const note = document.createElement("div");
    note.className = "gk-backup-dress-setup-note";
    note.innerHTML =
      '<p><strong>Backup pricing variants are still syncing.</strong> Open DrobeBook → Backup dress discount → “Sync backup variants”, then refresh this page.</p>';

    const anchor =
      document.querySelector(".cart__footer .totals, #main-cart-footer .totals, .cart__footer") ??
      document.querySelector("form[action='/cart']");
    anchor?.prepend(note);
  }

  function enhanceBackupDressUi(cart, variantMap) {
    clearBackupUiArtifacts();
    document.querySelectorAll(".gk-backup-dress-pill, .gk-backup-dress-price-wrap").forEach((node) => {
      node.remove();
    });
    document.querySelectorAll(".gk-backup-dress-price--hidden").forEach((node) => {
      node.classList.remove("gk-backup-dress-price--hidden");
    });

    const assignments = new Map(
      computeAssignments(cart.items ?? [], variantMap).map((row) => [row.key, row]),
    );

    (cart.items ?? []).forEach((item, index) => {
      const assignment = assignments.get(item.key);
      const row = findCartRow(item, index);
      if (!row) {
        return;
      }
      row.classList.remove("gk-backup-dress-row");
      delete row.dataset.gkHireTier;
      if (!assignment) {
        return;
      }
      row.classList.add("gk-backup-dress-row");
      row.dataset.gkHireTier = assignment.tier;
    });

    showSetupNoticeIfNeeded(cart, variantMap);
    patchThemeSubtotals(cart);

    if (typeof window.__gkDrobeEnhanceCartUi === "function") {
      window.__gkDrobeEnhanceCartUi();
    }
  }

  async function refreshCartState(cart) {
    try {
      const response = await fetch(`${ROOT}cart.js`, { credentials: "same-origin" });
      if (response.ok) {
        return response.json();
      }
    } catch {
      /* ignore */
    }
    return cart;
  }

  async function revertAllBackupPricing(cart, variantMap) {
    if (syncing) {
      return { cart, changed: false };
    }
    syncing = true;
    let changed = false;
    try {
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

      for (const item of cart.items ?? []) {
        const props = normalizeProperties(item.properties);
        if (!isGownHireLine(props) && !props[TYPE_PROP]) {
          continue;
        }
        const current = itemsByKey.get(item.key);
        if (!current) {
          continue;
        }
        const cleaned = cleanupSoloGownProperties(props);
        const entry = variantMap?.variants?.[String(item.variant_id)];
        const onBackupVariant = Boolean(entry?.isBackupVariant);
        const mainVariantId = onBackupVariant ? entry?.mainVariantId : null;
        if (
          !onBackupVariant &&
          !soloGownHasBackupArtifacts(props, variantMap, item.variant_id)
        ) {
          continue;
        }
        changed = true;
        if (onBackupVariant && mainVariantId) {
          cart = await swapLineVariant(item, mainVariantId, cleaned);
        } else {
          cart = await changeLineProperties(item.key, item.quantity ?? 1, cleaned);
        }
        itemsByKey.clear();
        for (const row of cart.items ?? []) {
          itemsByKey.set(row.key, {
            properties: normalizeProperties(row.properties),
            quantity: row.quantity ?? 1,
            variantId: String(row.variant_id),
            raw: row,
          });
        }
      }
    } finally {
      syncing = false;
    }
    return { cart, changed };
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
      let variantMap = await fetchVariantMap(cart.items ?? []);
      let synced = cart;
      const discountOn = variantMap.enabled !== false;

      if (!options.uiOnly) {
        if (!discountOn) {
          const revert = await revertAllBackupPricing(cart, variantMap);
          synced = revert.cart;
          if (revert.changed) {
            variantMapCache = null;
            synced = await refreshCartState(synced);
            variantMap = await fetchVariantMap(synced.items ?? []);
          }
        } else {
          let passes = 0;
          let changed = true;
          while (changed && passes < 4) {
            passes += 1;
            const syncResult = await syncBackupDressCart(synced, variantMap);
            synced = syncResult.cart;
            changed = syncResult.changed;
            if (changed) {
              variantMapCache = null;
              synced = await refreshCartState(synced);
              variantMap = await fetchVariantMap(synced.items ?? []);
            }
          }
          if (passes > 1 && changed) {
            window.dispatchEvent(new CustomEvent("cart:updated"));
          }
        }
      }

      enhanceBackupDressUi(synced, variantMap);
      return synced;
    } catch (error) {
      console.warn("[gk backup pricing]", error);
      enhanceBackupDressUi(cart, variantMapCache ?? { enabled: true, variants: {} });
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