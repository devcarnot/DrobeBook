(() => {
  if (window.__gkDrobeStorefrontHireVariants) {
    return;
  }

  function optionValues(variant) {
    if (!variant) {
      return [];
    }
    if (Array.isArray(variant.options) && variant.options.length) {
      return variant.options.map((value) => String(value ?? ""));
    }
    return [variant.option1, variant.option2, variant.option3]
      .filter((value) => value != null && String(value).trim())
      .map((value) => String(value));
  }

  function isBackupHireText(value) {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      normalized === "backup (80% off)" ||
      normalized.includes("backup (80% off)") ||
      normalized.endsWith("· backup") ||
      normalized.endsWith("(backup") ||
      /backup.*80%/.test(normalized) ||
      (normalized.includes("backup") && normalized.includes("80%"))
    );
  }

  function isBackupStorefrontVariant(variant) {
    if (!variant) {
      return false;
    }
    const bits = [
      variant.title,
      variant.name,
      variant.public_title,
      ...optionValues(variant),
    ];
    if (bits.some((value) => isBackupHireText(value))) {
      return true;
    }
    const title = String(variant.title ?? "").toLowerCase();
    return title
      .split("/")
      .map((part) => part.trim())
      .some((part) => isBackupHireText(part));
  }

  function standardStorefrontVariants(variants) {
    return (variants ?? []).filter((variant) => !isBackupStorefrontVariant(variant));
  }

  function variantPriceCents(variant) {
    const text = String(variant?.price ?? "").trim();
    const raw = Number.parseFloat(text);
    if (!Number.isFinite(raw)) {
      return 0;
    }
    if (/\.\d{1,2}$/.test(text)) {
      return Math.round(raw * 100);
    }
    if (raw >= 1000) {
      return Math.round(raw);
    }
    return Math.round(raw * 100);
  }

  function mainHireMinCentsFromVariants(variants) {
    const standard = standardStorefrontVariants(variants);
    if (standard.length) {
      return Math.min(...standard.map((variant) => variantPriceCents(variant)));
    }

    const backups = (variants ?? []).filter(isBackupStorefrontVariant);
    if (backups.length) {
      return Math.min(...backups.map((variant) => variantPriceCents(variant) * 5));
    }

    return null;
  }

  window.__gkDrobeStorefrontHireVariants = {
    isBackupStorefrontVariant,
    standardStorefrontVariants,
    mainHireMinCentsFromVariants,
    variantPriceCents,
    isBackupHireText,
    optionValues,
  };
})();