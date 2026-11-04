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

  const signInDraftKey = "invoicePendingSignInDraft";
  const rememberSignInDraft = (draft) => {
    const nonce = window.crypto.randomUUID();
    // Carry editable content only, never another identity's saved-record authority.
    const copy = { ...draft, savedInvoiceId: null, savedInvoiceStatus: "draft",
      paymentLinkUrl: "", portalAccessToken: "", paymentRecords: [] };
    window.sessionStorage.setItem(signInDraftKey, JSON.stringify({ nonce, createdAt: Date.now(), draft: copy }));
    return nonce;
  };

  const resumeSignInDraft = (draftStorageKey) => {
    const nonce = new URLSearchParams(window.location.search).get("resumeDraft");
    if (!nonce || !window.InvoiceRequestIdentity?.getAuthSession?.()?.userId) return null;
    try {
      const pending = JSON.parse(window.sessionStorage.getItem(signInDraftKey) || "null");
      if (!pending || pending.nonce !== nonce || !Number.isFinite(pending.createdAt) ||
          Date.now() - pending.createdAt > 30 * 60 * 1000 || pending.createdAt > Date.now() ||
          !Array.isArray(pending.draft?.lineItems)) return null;
      window.localStorage.setItem(draftStorageKey, JSON.stringify(pending.draft));
      window.sessionStorage.removeItem(signInDraftKey);
      return pending.draft;
    } catch { return null; }
  };

  const resolveInitialDraftMeta = ({ draftStorageKey, legacyDraftStorageKey }) => {
    const resumedDraft = resumeSignInDraft(draftStorageKey);
    if (resumedDraft) return { draft: resumedDraft, fromLegacy: false };
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
    rememberSignInDraft,
    resolveInitialDraftMeta
  };
})(typeof window !== "undefined" ? window : globalThis);
