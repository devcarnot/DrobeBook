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
  let pricingRunLock = false;
  let pricingScheduleTimer = 0;
  let pricingFollowUpTimer = 0;
  let pricingFollowUpsLeft = 0;
  const PRICING_DEBOUNCE_MS = 350;
  const PRICING_MUTATION_GAP_MS = 900;
  const MAX_PRICING_FOLLOW_UPS = 5;
  const PRIORITY_STORAGE_KEY = "gkDrobeCartBackupPricing";
  const IGNORE_MUTATION_MS = 3200;
  const RATE_LIMIT_PAUSE_MS = 90_000;
  let lastPricingMutationAt = 0;
  let pricingPausedUntil = 0;

  function isCartPage() {
    return /\/cart(\/|$|\?)/i.test(`${window.location.pathname}${window.location.search}`);
  }

  function setPricingMutating(active) {
    window.__gkDrobeBackupPricingMutating = Boolean(active);
  }

  function markIgnoreStorefrontCartHandlers(ms = IGNORE_MUTATION_MS) {
    const until = Date.now() + ms;
    window.__gkDrobeIgnoreCartMutationsUntil = until;
    window.__gkDrobeLastPricingMutationAt = Date.now();
    lastPricingMutationAt = Date.now();
  }

  function isRateLimited() {
    return Date.now() < pricingPausedUntil;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function postCartChange(payload, attempt = 0) {
    if (isRateLimited()) {
      throw new Error("Cart rate limit — wait a minute and refresh.");
    }
    markIgnoreStorefrontCartHandlers();
    setPricingMutating(true);
    const response = await fetch(`${ROOT}cart/change.js`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gk-Drobe-Backup": "1",
      },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    if (response.status === 429) {
      pricingPausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
      pricingFollowUpsLeft = 0;
      if (attempt < 1) {
        await sleep(4000);
        setPricingMutating(false);
        return postCartChange(payload, attempt + 1);
      }
      throw new Error("Please try again in a few minutes");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message =
        body?.description || body?.message || `cart change failed (${response.status})`;
      throw new Error(message);
    }
    const json = await response.json();
    window.setTimeout(() => setPricingMutating(false), IGNORE_MUTATION_MS);
    return json;
  }

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
    const query = ids.length
      ? `variantIds=${encodeURIComponent(ids.join(","))}`
      : "variantIds=";

    const now = Date.now();
    if (variantMapCache && now - variantMapFetchedAt < 60_000) {
      const missing = ids.length ? ids.some((id) => !variantMapCache.variants?.[id]) : false;
      if (!missing) {
        return variantMapCache;
      }
    }

    const response = await fetch(`${PROXY_BASE}/api/backup-variant-map?${query}`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      return variantMapCache ?? { enabled: true, variants: {} };
    }
    const data = await response.json();
    const normalized = {
      enabled: data?.enabled !== false,
      variants: data?.variants ?? {},
    };
    variantMapCache = normalized;
    variantMapFetchedAt = now;
    return normalized;
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
    if (isRateLimited()) {
      throw new Error("Cart rate limit — wait a minute and refresh.");
    }
    markIgnoreStorefrontCartHandlers();
    setPricingMutating(true);
    const quantity = item.quantity ?? 1;
    const variantId = Number.parseInt(String(targetVariantId), 10);
    const addResponse = await fetch(`${ROOT}cart/add.js`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gk-Drobe-Backup": "1",
      },
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

    try {
      return await postCartChange({ id: item.key, quantity: 0 });
    } finally {
      window.setTimeout(() => setPricingMutating(false), IGNORE_MUTATION_MS);
    }
  }

  async function changeLineProperties(key, quantity, properties) {
    return postCartChange({ id: key, quantity, properties });
  }

  async function fetchServerCartPlan(cart, variantMap) {
    if (variantMap?.enabled === false) {
      return [];
    }
    const lines = (cart.items ?? [])
      .filter((item) => isGownHireLine(normalizeProperties(item.properties)))
      .map((item, index) => ({
        key: item.key,
        variantId: String(item.variant_id),
        quantity: Math.min(1, item.quantity ?? 1),
        priceCents: catalogPriceCents(item, variantMap),
        createdAt: index,
        properties: normalizeProperties(item.properties),
      }));
    if (!lines.length) {
      return [];
    }
    try {
      const response = await fetch(`${PROXY_BASE}/api/backup-cart-plan`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      if (!response.ok) {
        return null;
      }
      const plan = await response.json();
      return (plan.actions ?? []).map((action) => ({
        key: action.lineKey,
        tier: action.tier,
        targetVariantId: action.targetVariantId,
        properties: action.displayProperties ?? {},
      }));
    } catch {
      return null;
    }
  }

  async function syncBackupDressCart(cart, variantMap) {
    if (syncing) {
      return { cart, changed: false };
    }

    const serverPlan = await fetchServerCartPlan(cart, variantMap);
    const assignments =
      serverPlan === null
        ? computeAssignments(cart.items ?? [], variantMap)
        : serverPlan;
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
        } else {
          cart = await changeLineProperties(
            assignment.key,
            current.quantity,
            assignment.properties,
          );
        }
        return { cart, changed: true };
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
        } else {
          cart = await changeLineProperties(item.key, item.quantity ?? 1, cleaned);
        }
        return { cart, changed: true };
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

  function setCartPricingBusy(active) {
    document.documentElement.classList.toggle("gk-backup-pricing-busy", Boolean(active));
  }

  function consumePriorityPricingRun() {
    try {
      if (!sessionStorage.getItem(PRIORITY_STORAGE_KEY)) {
        return false;
      }
      sessionStorage.removeItem(PRIORITY_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
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
        return { cart, changed: true };
      }
    } finally {
      syncing = false;
    }
    return { cart, changed };
  }

  function schedulePricingFollowUp() {
    if (pricingFollowUpsLeft <= 0) {
      return;
    }
    window.clearTimeout(pricingFollowUpTimer);
    pricingFollowUpTimer = window.setTimeout(() => {
      pricingFollowUpsLeft -= 1;
      void executeBackupPricingRun({ uiOnly: false, fromFollowUp: true });
    }, PRICING_MUTATION_GAP_MS);
  }

  function pauseBackupPricing(ms = 180_000) {
    window.__gkDrobePauseBackupPricingUntil = Date.now() + ms;
    pricingFollowUpsLeft = 0;
    window.clearTimeout(pricingScheduleTimer);
    window.clearTimeout(pricingFollowUpTimer);
  }

  function isBackupPricingPaused() {
    return Date.now() < (window.__gkDrobePauseBackupPricingUntil || 0);
  }

  function scheduleBackupPricingRun(delay = PRICING_DEBOUNCE_MS, priority = false) {
    if (!isCartPage()) {
      return;
    }
    if (isBackupPricingPaused() || isRateLimited()) {
      return;
    }
    window.clearTimeout(pricingScheduleTimer);
    pricingScheduleTimer = window.setTimeout(() => {
      void executeBackupPricingRun({ uiOnly: false, priority });
    }, delay);
  }

  async function executeBackupPricingRun(options = {}) {
    if (!isCartPage() && !options.cart) {
      if (!options.uiOnly) {
        return null;
      }
    }
    if ((isRateLimited() || isBackupPricingPaused()) && !options.uiOnly) {
      if (options.cart || isCartPage()) {
        enhanceBackupDressUi(
          options.cart ?? null,
          variantMapCache ?? { enabled: true, variants: {} },
        );
      }
      return null;
    }
    if (pricingRunLock || window.__gkDrobeBackupPricingMutating) {
      if (!options.uiOnly) {
        scheduleBackupPricingRun(PRICING_DEBOUNCE_MS);
      }
      return null;
    }

    const sinceMutation = Date.now() - lastPricingMutationAt;
    if (
      !options.uiOnly &&
      !options.fromFollowUp &&
      !options.priority &&
      sinceMutation < PRICING_MUTATION_GAP_MS
    ) {
      scheduleBackupPricingRun(PRICING_MUTATION_GAP_MS - sinceMutation);
      return null;
    }

    pricingRunLock = true;
    if (!options.uiOnly) {
      setCartPricingBusy(true);
    }
    let cart = options.cart;
    try {
    if (!cart) {
        const response = await fetch(`${ROOT}cart.js`, { credentials: "same-origin" });
        if (!response.ok) {
          return null;
        }
        cart = await response.json();
      }

      let variantMap = await fetchVariantMap(cart.items ?? []);
      let synced = cart;
      const discountOn = variantMap.enabled !== false;
      let didChange = false;

      if (!options.uiOnly && discountOn && (cart.items ?? []).length > 0) {
        const syncResult = await syncBackupDressCart(synced, variantMap);
        synced = syncResult.cart;
        didChange = syncResult.changed;
      }

      if (!options.uiOnly && didChange) {
        variantMapCache = null;
        synced = await refreshCartState(synced);
        variantMap = await fetchVariantMap(synced.items ?? []);
        if (typeof window.__gkDrobeRefreshCartAfterBackupPricing === "function") {
          await window.__gkDrobeRefreshCartAfterBackupPricing(synced);
          synced = await refreshCartState(synced);
          variantMap = await fetchVariantMap(synced.items ?? []);
        }
        pricingFollowUpsLeft = MAX_PRICING_FOLLOW_UPS;
        schedulePricingFollowUp();
        if (options.priority || options.fromFollowUp) {
          scheduleBackupPricingRun(PRICING_DEBOUNCE_MS, true);
        }
      } else if (options.fromFollowUp) {
        pricingFollowUpsLeft = 0;
      }

      enhanceBackupDressUi(synced, variantMap);
      return synced;
    } catch (error) {
      console.warn("[gk backup pricing]", error);
      enhanceBackupDressUi(cart, variantMapCache ?? { enabled: true, variants: {} });
      return cart ?? null;
    } finally {
      pricingRunLock = false;
      setCartPricingBusy(false);
    }
  }

  window.__gkRunBackupDressPricing = executeBackupPricingRun;
  window.__gkDrobeScheduleBackupPricing = () => scheduleBackupPricingRun(PRICING_DEBOUNCE_MS);
  window.__gkDrobePauseBackupPricing = pauseBackupPricing;

  function bootBackupPricingOnCart() {
    if (!isCartPage()) {
      return;
    }
    const priority = consumePriorityPricingRun();
    if (priority) {
      void executeBackupPricingRun({ priority: true });
      return;
    }
    scheduleBackupPricingRun(120);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootBackupPricingOnCart);
  } else {
    bootBackupPricingOnCart();
  }
})();