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

  const normalizeEmail = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : "";
  };
  const normalizeIntervalDays = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const rounded = Math.round(parsed);
    return rounded >= 1 && rounded <= 365 ? rounded : null;
  };

  const normalizeClientEntry = (value) => {
    const details = normalizeText(value?.details ?? value);
    const name = normalizeClientName(value?.name ?? details);
    if (!name) {
      return null;
    }
    const recipientEmail = normalizeEmail(value?.recipientEmail);
    const defaultNotes = normalizeText(value?.defaultNotes);
    const recurringIntervalDays = normalizeIntervalDays(value?.recurringIntervalDays);
    return {
      name,
      lookupKey: name.toLocaleLowerCase(),
      details: details || name,
      ...(recipientEmail ? { recipientEmail } : {}),
      ...(defaultNotes ? { defaultNotes } : {}),
      ...(recurringIntervalDays ? { recurringIntervalDays } : {}),
      updatedAt:
        typeof value?.updatedAt === "string" && value.updatedAt.trim()
          ? value.updatedAt
          : new Date().toISOString()
    };
  };

  const mergeEntries = (current, next) => {
    if (!current) {
      return next;
    }
    if (!next) {
      return current;
    }
    const preferred = current.updatedAt < next.updatedAt ? next : current;
    const fallback = preferred === next ? current : next;
    return {
      ...preferred,
      details: preferred.details || fallback.details,
      recipientEmail: preferred.recipientEmail || fallback.recipientEmail,
      defaultNotes: preferred.defaultNotes || fallback.defaultNotes,
      recurringIntervalDays: preferred.recurringIntervalDays || fallback.recurringIntervalDays
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
      deduped.set(entry.lookupKey, mergeEntries(deduped.get(entry.lookupKey), entry));
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

  const deleteClientMemoryEntry = (nameOrDetails) => {
    const normalizedName = normalizeClientName(nameOrDetails).toLocaleLowerCase();
    if (!normalizedName) {
      return getClientMemory();
    }
    return saveClientMemory(getClientMemory().filter((entry) => entry.lookupKey !== normalizedName));
  };

  const clearClientMemory = () => {
    const scopedStorageKey = buildStorageKey();
    try {
      window.localStorage.removeItem(scopedStorageKey);
      if (scopedStorageKey !== legacyStorageKey) {
        window.localStorage.removeItem(legacyStorageKey);
      }
    } catch (_error) {
      // Best-effort clear only.
    }
    return [];
  };

  const mergeClientEntry = (entry) => {
    if (!entry) {
      return getClientMemory();
    }
    const existing = getClientMemory().find((item) => item.lookupKey === entry.lookupKey);
    const nextEntry = mergeEntries(existing, entry);
    return saveClientMemory([
      nextEntry,
      ...getClientMemory().filter((item) => item.lookupKey !== entry.lookupKey)
    ]);
  };

  const rememberClientDetails = (details, options = {}) => {
    return mergeClientEntry(
      normalizeClientEntry({
        details,
        recipientEmail: options?.recipientEmail,
        defaultNotes: options?.defaultNotes,
        recurringIntervalDays: options?.recurringIntervalDays
      })
    );
  };

  const rememberClientRecipientEmail = (nameOrDetails, recipientEmail) => {
    const currentDetails = getClientDetails(nameOrDetails) || normalizeText(nameOrDetails);
    return mergeClientEntry(
      normalizeClientEntry({
        name: normalizeClientName(nameOrDetails),
        details: currentDetails,
        recipientEmail
      })
    );
  };

  const rememberClientRecurringInterval = (nameOrDetails, intervalDays) => {
    const currentDetails = getClientDetails(nameOrDetails) || normalizeText(nameOrDetails);
    return mergeClientEntry(
      normalizeClientEntry({
        name: normalizeClientName(nameOrDetails),
        details: currentDetails,
        recurringIntervalDays: intervalDays
      })
    );
  };

  const getClientDetails = (name) => {
    const normalizedName = normalizeClientName(name).toLocaleLowerCase();
    if (!normalizedName) {
      return "";
    }
    const match = getClientMemory().find((entry) => entry.lookupKey === normalizedName);
    return match?.details ?? "";
  };

  const getClientRecipientEmail = (name) => {
    const normalizedName = normalizeClientName(name).toLocaleLowerCase();
    if (!normalizedName) {
      return "";
    }
    const match = getClientMemory().find((entry) => entry.lookupKey === normalizedName);
    return match?.recipientEmail ?? "";
  };

  const getClientDefaultNotes = (name) => {
    const normalizedName = normalizeClientName(name).toLocaleLowerCase();
    if (!normalizedName) {
      return "";
    }
    const match = getClientMemory().find((entry) => entry.lookupKey === normalizedName);
    return match?.defaultNotes ?? "";
  };

  const getClientRecurringInterval = (name) => {
    const normalizedName = normalizeClientName(name).toLocaleLowerCase();
    if (!normalizedName) {
      return null;
    }
    const match = getClientMemory().find((entry) => entry.lookupKey === normalizedName);
    return normalizeIntervalDays(match?.recurringIntervalDays);
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
    deleteClientMemoryEntry,
    clearClientMemory,
    rememberClientDetails,
    rememberClientRecipientEmail,
    rememberClientRecurringInterval,
    getClientDetails,
    getClientRecipientEmail,
    getClientDefaultNotes,
    getClientRecurringInterval,
    applyClientMemoryToDraft
  };
})();
