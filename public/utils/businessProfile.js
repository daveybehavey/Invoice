(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /utils/businessProfile.js."
    );
  }

  const brandThemeUtils = window.InvoiceBrandTheme;
  if (!brandThemeUtils) {
    throw new Error(
      "Missing /utils/brandTheme.js load. Ensure it is loaded before /utils/businessProfile.js."
    );
  }

  const styleCatalogUtils = window.InvoiceManualStyleCatalog;
  if (!styleCatalogUtils) {
    throw new Error(
      "Missing /utils/manualStyleCatalog.js load. Ensure it is loaded before /utils/businessProfile.js."
    );
  }

  const { DEFAULT_ACCENT_COLOR, normalizeAccentColor } = brandThemeUtils;
  const { STYLE_PRESETS, HEADER_LAYOUT_PRESETS, SPACING_DENSITY_PRESETS } = styleCatalogUtils;
  const DEFAULT_HEADER_LAYOUT = "split";
  const DEFAULT_SPACING_DENSITY = "balanced";
  const TAX_REGION_PRESET_CATALOG = Object.freeze([
    {
      key: "CA-BC",
      label: "BC",
      defaultRate: "12",
      matchers: [/\bBRITISH COLUMBIA\b/i, /(?:^|[,\n\t ])BC(?:$|[,\n\t ])/i]
    },
    {
      key: "CA-AB",
      label: "AB",
      defaultRate: "5",
      matchers: [/\bALBERTA\b/i, /(?:^|[,\n\t ])AB(?:$|[,\n\t ])/i]
    },
    {
      key: "CA-ON",
      label: "ON",
      defaultRate: "13",
      matchers: [/\bONTARIO\b/i, /,\s*ON(?:\s+[A-Z]\d[A-Z])?/i]
    },
    {
      key: "CA-QC",
      label: "QC",
      defaultRate: "14.975",
      matchers: [/\bQUEBEC\b/i, /\bQU[ÉE]BEC\b/i, /(?:^|[,\n\t ])QC(?:$|[,\n\t ])/i]
    }
  ]);

  const legacyStorageKey = "invoiceBusinessProfile";
  const buildStorageKey = () =>
    requestIdentity.getScopedStorageKey?.(legacyStorageKey) ?? legacyStorageKey;

  const normalizeText = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    return value
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();
  };

  const normalizeStylePreset = (value) => {
    const presetId = typeof value === "string" ? value.trim() : "";
    if (presetId && STYLE_PRESETS[presetId]) {
      return presetId;
    }
    return "default";
  };

  const normalizeHeaderLayout = (value) => {
    const layoutId = typeof value === "string" ? value.trim() : "";
    if (layoutId && HEADER_LAYOUT_PRESETS?.[layoutId]) {
      return layoutId;
    }
    return DEFAULT_HEADER_LAYOUT;
  };

  const normalizeSpacingDensity = (value) => {
    const densityId = typeof value === "string" ? value.trim() : "";
    if (densityId && SPACING_DENSITY_PRESETS?.[densityId]) {
      return densityId;
    }
    return DEFAULT_SPACING_DENSITY;
  };

  const normalizeVisibilityFlag = (value, fallback = true) => {
    if (typeof value === "boolean") {
      return value;
    }
    return fallback;
  };

  const normalizeLogoUrl = (value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizeTaxRate = (value) => {
    const parsed =
      typeof value === "number" && Number.isFinite(value)
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsed)) {
      return "0";
    }
    const bounded = Math.max(0, Math.min(100, parsed));
    const rounded = Math.round(bounded * 1000) / 1000;
    return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  };

  const normalizeTaxRegionRates = (value) => {
    const source = value && typeof value === "object" ? value : {};
    const rates = {};
    for (const preset of TAX_REGION_PRESET_CATALOG) {
      rates[preset.key] = normalizeTaxRate(source[preset.key] ?? preset.defaultRate);
    }
    return rates;
  };

  const normalizeBusinessProfile = (value) => {
    const profile = value && typeof value === "object" ? value : {};
    return {
      fromDetails: normalizeText(profile.fromDetails),
      accentColor: normalizeAccentColor(profile.accentColor ?? DEFAULT_ACCENT_COLOR),
      stylePreset: normalizeStylePreset(profile.stylePreset),
      headerLayout: normalizeHeaderLayout(profile.headerLayout),
      spacingDensity: normalizeSpacingDensity(profile.spacingDensity),
      logoUrl: normalizeLogoUrl(profile.logoUrl),
      logoVisible: normalizeVisibilityFlag(profile.logoVisible, true),
      notesVisible: normalizeVisibilityFlag(profile.notesVisible, true),
      defaultTaxRate: normalizeTaxRate(profile.defaultTaxRate),
      taxRegionRates: normalizeTaxRegionRates(profile.taxRegionRates)
    };
  };

  const resolveTaxRegionPresets = (profileOverride) => {
    const profile = normalizeBusinessProfile(profileOverride ?? getBusinessProfile());
    return TAX_REGION_PRESET_CATALOG.map((preset) => ({
      key: preset.key,
      label: preset.label,
      defaultRate: preset.defaultRate,
      rate: profile.taxRegionRates?.[preset.key] ?? normalizeTaxRate(preset.defaultRate)
    }));
  };

  const extractDraftTaxRegionSearchText = (draft) => {
    if (!draft || typeof draft !== "object") {
      return "";
    }
    const fragments = [
      draft.billToDetails,
      draft.customerName,
      draft.customerAddress,
      draft.customerLocation,
      draft.clientAddress
    ]
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    return fragments.join("\n");
  };

  const inferTaxRegionPreset = (draft, profileOverride) => {
    const searchText = extractDraftTaxRegionSearchText(draft);
    if (!searchText) {
      return null;
    }
    const regionPresets = resolveTaxRegionPresets(profileOverride);
    for (const preset of regionPresets) {
      const catalogPreset = TAX_REGION_PRESET_CATALOG.find((entry) => entry.key === preset.key);
      const matched =
        Array.isArray(catalogPreset?.matchers) &&
        catalogPreset.matchers.some((matcher) => matcher.test(searchText));
      if (matched) {
        return {
          key: preset.key,
          label: preset.label,
          rate: preset.rate
        };
      }
    }
    return null;
  };

  const readProfile = (storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }
      return normalizeBusinessProfile(JSON.parse(raw));
    } catch (_error) {
      return null;
    }
  };

  const writeProfile = (storageKey, profile) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(profile));
    } catch (_error) {
      // Best-effort write only.
    }
  };

  const removeProfile = (storageKey) => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch (_error) {
      // Best-effort write only.
    }
  };

  const getBusinessProfile = () => {
    const scopedStorageKey = buildStorageKey();
    const scopedProfile = readProfile(scopedStorageKey);
    if (scopedProfile) {
      return scopedProfile;
    }
    if (scopedStorageKey !== legacyStorageKey) {
      const legacyProfile = readProfile(legacyStorageKey);
      if (legacyProfile) {
        writeProfile(scopedStorageKey, legacyProfile);
        return legacyProfile;
      }
    }
    return normalizeBusinessProfile({});
  };

  const saveBusinessProfile = (nextProfile) => {
    const scopedStorageKey = buildStorageKey();
    const current = getBusinessProfile();
    const merged = normalizeBusinessProfile({ ...current, ...nextProfile });
    writeProfile(scopedStorageKey, merged);
    return merged;
  };

  const clearBusinessProfile = () => {
    const scopedStorageKey = buildStorageKey();
    removeProfile(scopedStorageKey);
  };

  const applyBusinessProfileToDraft = (draft, profileOverride) => {
    const baseDraft = draft && typeof draft === "object" ? { ...draft } : {};
    const profile = normalizeBusinessProfile(profileOverride ?? getBusinessProfile());
    const nextDraft = { ...baseDraft };

    if (!normalizeText(nextDraft.fromDetails) && profile.fromDetails) {
      nextDraft.fromDetails = profile.fromDetails;
    }

    const nextAccent = normalizeAccentColor(nextDraft.accentColor ?? DEFAULT_ACCENT_COLOR);
    if (!nextDraft.accentColor || nextAccent === DEFAULT_ACCENT_COLOR) {
      nextDraft.accentColor = profile.accentColor;
    } else {
      nextDraft.accentColor = nextAccent;
    }

    if (
      !nextDraft.stylePreset ||
      !STYLE_PRESETS[nextDraft.stylePreset] ||
      nextDraft.stylePreset === "default"
    ) {
      nextDraft.stylePreset = profile.stylePreset;
    }

    if (
      !nextDraft.headerLayout ||
      typeof nextDraft.headerLayout !== "string" ||
      !HEADER_LAYOUT_PRESETS?.[nextDraft.headerLayout]
    ) {
      nextDraft.headerLayout = profile.headerLayout;
    }

    if (
      !nextDraft.spacingDensity ||
      typeof nextDraft.spacingDensity !== "string" ||
      !SPACING_DENSITY_PRESETS?.[nextDraft.spacingDensity]
    ) {
      nextDraft.spacingDensity = profile.spacingDensity;
    }

    if (!normalizeLogoUrl(nextDraft.logoUrl) && profile.logoUrl) {
      nextDraft.logoUrl = profile.logoUrl;
    } else {
      nextDraft.logoUrl = normalizeLogoUrl(nextDraft.logoUrl);
    }

    if (typeof nextDraft.logoVisible !== "boolean") {
      nextDraft.logoVisible = profile.logoVisible;
    }

    if (typeof nextDraft.notesVisible !== "boolean") {
      nextDraft.notesVisible = profile.notesVisible;
    }

    const currentTaxRate = typeof nextDraft.taxRate === "string" ? nextDraft.taxRate.trim() : "";
    const currentTaxNumber = Number(currentTaxRate);
    const inferredTaxRegionPreset = inferTaxRegionPreset(nextDraft, profile);
    if (!currentTaxRate || !Number.isFinite(currentTaxNumber) || currentTaxNumber === 0) {
      nextDraft.taxRate = inferredTaxRegionPreset?.rate ?? profile.defaultTaxRate;
    }
    if (
      (!nextDraft.taxRegionPresetKey || typeof nextDraft.taxRegionPresetKey !== "string") &&
      inferredTaxRegionPreset?.key
    ) {
      nextDraft.taxRegionPresetKey = inferredTaxRegionPreset.key;
    }

    return nextDraft;
  };

  window.InvoiceBusinessProfile = {
    legacyStorageKey,
    TAX_REGION_PRESETS: TAX_REGION_PRESET_CATALOG.map((preset) => ({
      key: preset.key,
      label: preset.label,
      defaultRate: preset.defaultRate
    })),
    getBusinessProfile,
    saveBusinessProfile,
    clearBusinessProfile,
    applyBusinessProfileToDraft,
    normalizeBusinessProfile,
    resolveTaxRegionPresets,
    inferTaxRegionPreset
  };
})();
