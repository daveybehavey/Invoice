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
  const { STYLE_PRESETS } = styleCatalogUtils;

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

  const normalizeLogoUrl = (value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizeBusinessRegistration = (value, index = 0) => {
    const entry = value && typeof value === "object" ? value : {};
    const label = normalizeText(entry.label).replace(/\n+/g, " ").trim();
    const number = normalizeText(entry.value ?? entry.number).replace(/\n+/g, " ").trim();
    const countryCode = typeof entry.countryCode === "string" ? entry.countryCode.trim().slice(0, 2).toUpperCase() : "";
    const regionCode = typeof entry.regionCode === "string" ? entry.regionCode.trim().slice(0, 16).toUpperCase() : "";
    const kind = typeof entry.kind === "string" ? entry.kind.trim().toLowerCase() : "other";
    const system = typeof entry.system === "string" ? entry.system.trim() : "";
    const visible = entry.visible !== false;
    if (!label && !number) {
      return null;
    }
    return {
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `registration-${index + 1}`,
      kind: kind || "other",
      system,
      label: label || "Registration",
      value: number,
      countryCode,
      regionCode,
      visible
    };
  };

  const normalizeBusinessRegistrations = (value) =>
    (Array.isArray(value) ? value : [])
      .map((entry, index) => normalizeBusinessRegistration(entry, index))
      .filter(Boolean);

  const normalizeBusinessProfile = (value) => {
    const profile = value && typeof value === "object" ? value : {};
    return {
      fromDetails: normalizeText(profile.fromDetails),
      accentColor: normalizeAccentColor(profile.accentColor ?? DEFAULT_ACCENT_COLOR),
      stylePreset: normalizeStylePreset(profile.stylePreset),
      logoUrl: normalizeLogoUrl(profile.logoUrl),
      businessRegistrations: normalizeBusinessRegistrations(profile.businessRegistrations),
      registrationBlockVisible: profile.registrationBlockVisible !== false
    };
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

    if (!normalizeLogoUrl(nextDraft.logoUrl) && profile.logoUrl) {
      nextDraft.logoUrl = profile.logoUrl;
    } else {
      nextDraft.logoUrl = normalizeLogoUrl(nextDraft.logoUrl);
    }

    const draftRegistrations = normalizeBusinessRegistrations(nextDraft.businessRegistrations);
    if (draftRegistrations.length === 0 && profile.businessRegistrations.length > 0) {
      nextDraft.businessRegistrations = profile.businessRegistrations;
    } else {
      nextDraft.businessRegistrations = draftRegistrations;
    }

    if (typeof nextDraft.registrationBlockVisible !== "boolean") {
      nextDraft.registrationBlockVisible = profile.registrationBlockVisible;
    }

    return nextDraft;
  };

  window.InvoiceBusinessProfile = {
    legacyStorageKey,
    getBusinessProfile,
    saveBusinessProfile,
    clearBusinessProfile,
    applyBusinessProfileToDraft,
    normalizeBusinessProfile
  };
})();
