(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /utils/clientMemory.js."
    );
  }

  const legacyStorageKey = "invoiceClientMemory";
  const MAX_CLIENTS = 12;

  const buildStorageKey = () =>
    requestIdentity.getScopedStorageKey?.(legacyStorageKey) ?? legacyStorageKey;

  const normalizeText = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    return value
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  };

  const normalizeClientName = (value) => normalizeText(value).split("\n")[0] ?? "";

  const normalizeClientEntry = (value) => {
    const details = normalizeText(value?.details ?? value);
    const name = normalizeClientName(value?.name ?? details);
    if (!name || !details) {
      return null;
    }
    return {
      name,
      lookupKey: name.toLocaleLowerCase(),
      details,
      updatedAt:
        typeof value?.updatedAt === "string" && value.updatedAt.trim()
          ? value.updatedAt
          : new Date().toISOString()
    };
  };

  const normalizeCollection = (value) => {
    const list = Array.isArray(value) ? value : [];
    const deduped = new Map();
    list.forEach((item) => {
      const entry = normalizeClientEntry(item);
      if (!entry) {
        return;
      }
      const existing = deduped.get(entry.lookupKey);
      if (!existing || existing.updatedAt < entry.updatedAt) {
        deduped.set(entry.lookupKey, entry);
      }
    });
    return Array.from(deduped.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_CLIENTS);
  };

  const readCollection = (storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return [];
      }
      return normalizeCollection(JSON.parse(raw));
    } catch (_error) {
      return [];
    }
  };

  const writeCollection = (storageKey, value) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(normalizeCollection(value)));
    } catch (_error) {
      // Best-effort write only.
    }
  };

  const getClientMemory = () => {
    const scopedStorageKey = buildStorageKey();
    const scopedCollection = readCollection(scopedStorageKey);
    if (scopedCollection.length > 0) {
      return scopedCollection;
    }
    if (scopedStorageKey !== legacyStorageKey) {
      const legacyCollection = readCollection(legacyStorageKey);
      if (legacyCollection.length > 0) {
        writeCollection(scopedStorageKey, legacyCollection);
        return legacyCollection;
      }
    }
    return [];
  };

  const saveClientMemory = (nextMemory) => {
    const scopedStorageKey = buildStorageKey();
    const normalized = normalizeCollection(nextMemory);
    writeCollection(scopedStorageKey, normalized);
    return normalized;
  };

  const rememberClientDetails = (details) => {
    const entry = normalizeClientEntry(details);
    if (!entry) {
      return getClientMemory();
    }
    const nextMemory = [entry, ...getClientMemory().filter((item) => item.lookupKey !== entry.lookupKey)];
    return saveClientMemory(nextMemory);
  };

  const getClientDetails = (name) => {
    const normalizedName = normalizeClientName(name).toLocaleLowerCase();
    if (!normalizedName) {
      return "";
    }
    const match = getClientMemory().find((entry) => entry.lookupKey === normalizedName);
    return match?.details ?? "";
  };

  const applyClientMemoryToDraft = (draft) => {
    const baseDraft = draft && typeof draft === "object" ? { ...draft } : {};
    const currentBillTo = normalizeText(baseDraft.billToDetails);
    if (!currentBillTo) {
      return baseDraft;
    }
    const rememberedDetails = getClientDetails(currentBillTo);
    if (!rememberedDetails || normalizeText(rememberedDetails) === currentBillTo) {
      return baseDraft;
    }
    return {
      ...baseDraft,
      billToDetails: rememberedDetails
    };
  };

  window.InvoiceClientMemory = {
    legacyStorageKey,
    getClientMemory,
    saveClientMemory,
    rememberClientDetails,
    getClientDetails,
    applyClientMemoryToDraft
  };
})();
