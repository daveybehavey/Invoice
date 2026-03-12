(function attachManualDraftStorage(globalScope) {
  const readDraftFromStorage = (key) => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (_error) {
      return null;
    }
  };

  const resolveInitialDraftMeta = ({ draftStorageKey, legacyDraftStorageKey }) => {
    const scopedDraft = readDraftFromStorage(draftStorageKey);
    if (scopedDraft) {
      return { draft: scopedDraft, fromLegacy: false };
    }

    if (draftStorageKey !== legacyDraftStorageKey) {
      const legacyDraft = readDraftFromStorage(legacyDraftStorageKey);
      if (legacyDraft) {
        return { draft: legacyDraft, fromLegacy: true };
      }
    }

    return { draft: null, fromLegacy: false };
  };

  globalScope.InvoiceManualDraftStorage = {
    readDraftFromStorage,
    resolveInitialDraftMeta
  };
})(typeof window !== "undefined" ? window : globalThis);
