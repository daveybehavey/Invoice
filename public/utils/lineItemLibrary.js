(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /utils/lineItemLibrary.js."
    );
  }

  const legacyStorageKey = "invoiceLineItemLibrary";
  const MAX_ITEMS = 24;

  const buildStorageKey = () =>
    requestIdentity.getScopedStorageKey?.(legacyStorageKey) ?? legacyStorageKey;

  const normalizeText = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/\s+/g, " ").trim();
  };

  const normalizeNumericString = (value) => {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    const parsed = Number.parseFloat(String(value));
    if (!Number.isFinite(parsed)) {
      return "";
    }
    return String(parsed);
  };

  const normalizeClientName = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/\s+/g, " ").trim();
  };

  const buildLookupKey = (description, qty, rate, clientName) =>
    [description.toLocaleLowerCase(), qty, rate, clientName.toLocaleLowerCase()].join("|");

  const normalizeEntry = (value) => {
    const description = normalizeText(value?.description);
    const qty = normalizeNumericString(value?.qty ?? value?.quantity);
    const rate = normalizeNumericString(value?.rate ?? value?.unitPrice);
    const clientName = normalizeClientName(value?.clientName);
    if (!description) {
      return null;
    }
    return {
      description,
      qty,
      rate,
      clientName,
      lookupKey: buildLookupKey(description, qty, rate, clientName),
      updatedAt:
        typeof value?.updatedAt === "string" && value.updatedAt.trim()
          ? value.updatedAt
          : new Date().toISOString()
    };
  };

  const normalizeCollection = (value) => {
    const entries = Array.isArray(value) ? value : [];
    const deduped = new Map();
    entries.forEach((entry) => {
      const normalized = normalizeEntry(entry);
      if (!normalized) {
        return;
      }
      const existing = deduped.get(normalized.lookupKey);
      if (!existing || existing.updatedAt < normalized.updatedAt) {
        deduped.set(normalized.lookupKey, normalized);
      }
    });
    return Array.from(deduped.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_ITEMS);
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

  const writeCollection = (storageKey, items) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(normalizeCollection(items)));
    } catch (_error) {
      // Best-effort write only.
    }
  };

  const getLineItemLibrary = () => {
    const scopedStorageKey = buildStorageKey();
    const scopedItems = readCollection(scopedStorageKey);
    if (scopedItems.length > 0) {
      return scopedItems;
    }
    if (scopedStorageKey !== legacyStorageKey) {
      const legacyItems = readCollection(legacyStorageKey);
      if (legacyItems.length > 0) {
        writeCollection(scopedStorageKey, legacyItems);
        return legacyItems;
      }
    }
    return [];
  };

  const saveLineItemLibrary = (items) => {
    const scopedStorageKey = buildStorageKey();
    const normalized = normalizeCollection(items);
    writeCollection(scopedStorageKey, normalized);
    return normalized;
  };

  const rememberLineItems = (lineItems, options = {}) => {
    const clientName = normalizeClientName(options?.clientName);
    const normalizedItems = (Array.isArray(lineItems) ? lineItems : [])
      .map((item) =>
        normalizeEntry({
          ...item,
          clientName
        })
      )
      .filter(Boolean);
    if (normalizedItems.length === 0) {
      return getLineItemLibrary();
    }
    const existing = getLineItemLibrary().filter(
      (entry) => !normalizedItems.some((item) => item.lookupKey === entry.lookupKey)
    );
    return saveLineItemLibrary([...normalizedItems, ...existing]);
  };

  window.InvoiceLineItemLibrary = {
    legacyStorageKey,
    getLineItemLibrary,
    saveLineItemLibrary,
    rememberLineItems
  };
})();
