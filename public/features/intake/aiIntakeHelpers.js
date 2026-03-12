(function attachAIIntakeHelpers(globalScope) {
  const initialIntakeMessages = [
    {
      id: "msg-1",
      role: "ai",
      text: "Paste your notes in any format. I will structure them into an invoice draft."
    }
  ];

  const normalizePreviewText = (value) => (typeof value === "string" ? value.trim() : "");

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

  const readStoredLaborRate = (storageKey = "invoiceLastLaborRate") => {
    if (typeof window === "undefined") {
      return null;
    }
    const stored = Number.parseFloat(window.localStorage.getItem(storageKey) || "");
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  };

  const storeLaborRate = (rate, storageKey = "invoiceLastLaborRate") => {
    if (typeof window === "undefined") {
      return;
    }
    if (Number.isFinite(rate) && rate > 0) {
      window.localStorage.setItem(storageKey, String(rate));
    }
  };

  const buildBillieChangePreview = (beforeInvoice, afterInvoice) => {
    const entries = [];
    const beforeLines = Array.isArray(beforeInvoice?.lineItems) ? beforeInvoice.lineItems : [];
    const afterLines = Array.isArray(afterInvoice?.lineItems) ? afterInvoice.lineItems : [];

    for (let index = 0; index < Math.max(beforeLines.length, afterLines.length); index += 1) {
      const beforeLine = beforeLines[index];
      const afterLine = afterLines[index];
      if (!beforeLine || !afterLine) {
        continue;
      }
      const beforeDescription = normalizePreviewText(beforeLine.description);
      const afterDescription = normalizePreviewText(afterLine.description);
      if (!beforeDescription || !afterDescription || beforeDescription === afterDescription) {
        continue;
      }
      entries.push({
        id: afterLine.id ?? beforeLine.id ?? `line-${index}`,
        label: "Line item",
        before: beforeDescription,
        after: afterDescription
      });
    }

    const beforeNotes = normalizePreviewText(beforeInvoice?.notes);
    const afterNotes = normalizePreviewText(afterInvoice?.notes);
    if (beforeNotes && afterNotes && beforeNotes !== afterNotes) {
      entries.push({
        id: "notes",
        label: "Notes",
        before: beforeNotes,
        after: afterNotes
      });
    }

    return entries.slice(0, 3);
  };

  const STOP_WORDS = new Set([
    "and",
    "the",
    "for",
    "with",
    "from",
    "that",
    "this",
    "was",
    "were",
    "job",
    "work",
    "service",
    "visit"
  ]);

  const tokenize = (value) =>
    normalizePreviewText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  const parsePositiveRate = (value) => {
    const parsed = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
  };

  const buildLaborRateSuggestions = ({ laborItems, lineItemLibrary, savedLaborRate, maxSuggestions = 4 }) => {
    const fallbackRates = [85, 95, 120];
    const laborTokenSets = (Array.isArray(laborItems) ? laborItems : [])
      .map((item) => new Set(tokenize(item?.description)))
      .filter((tokenSet) => tokenSet.size > 0);

    const matchedSuggestions = (Array.isArray(lineItemLibrary) ? lineItemLibrary : [])
      .map((entry) => {
        const rate = parsePositiveRate(entry?.rate ?? entry?.unitPrice);
        if (!rate) {
          return null;
        }
        const entryTokens = tokenize(entry?.description);
        if (entryTokens.length === 0 || laborTokenSets.length === 0) {
          return null;
        }
        const score = laborTokenSets.reduce((bestScore, tokenSet) => {
          let overlap = 0;
          entryTokens.forEach((token) => {
            if (tokenSet.has(token)) {
              overlap += 1;
            }
          });
          return Math.max(bestScore, overlap);
        }, 0);
        if (score <= 0) {
          return null;
        }
        return {
          source: "matched",
          rate,
          description: normalizePreviewText(entry?.description),
          score,
          updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : ""
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return (right.updatedAt || "").localeCompare(left.updatedAt || "");
      });

    const dedupeByRate = new Set();
    const ordered = [];
    matchedSuggestions.forEach((suggestion) => {
      if (dedupeByRate.has(suggestion.rate)) {
        return;
      }
      dedupeByRate.add(suggestion.rate);
      ordered.push(suggestion);
    });

    const savedRate = parsePositiveRate(savedLaborRate);
    if (savedRate && !dedupeByRate.has(savedRate)) {
      dedupeByRate.add(savedRate);
      ordered.push({
        source: "last_used",
        rate: savedRate,
        description: ""
      });
    }

    fallbackRates.forEach((fallbackRate) => {
      if (dedupeByRate.has(fallbackRate)) {
        return;
      }
      dedupeByRate.add(fallbackRate);
      ordered.push({
        source: "common",
        rate: fallbackRate,
        description: ""
      });
    });

    return ordered.slice(0, Math.max(1, maxSuggestions));
  };

  const buildLaborQuickReplies = ({
    intakePhase,
    followUp,
    pendingLaborRate,
    savedLaborRate,
    lineItemLibrary,
    formatRateToken
  }) => {
    if (intakePhase !== "awaiting_follow_up" || followUp?.type !== "labor_pricing") {
      return [];
    }
    const laborItems = Array.isArray(followUp?.laborItems) ? followUp.laborItems : [];
    const missingCount = laborItems.filter((item) => typeof item.hours !== "number").length;
    const targetCount = missingCount > 0 ? missingCount : laborItems.length;
    if (targetCount <= 0) {
      return [];
    }

    const formatLabel = (hoursList) => `Use ${hoursList.map((hour) => `${hour}h`).join(", ")}`;
    const formatValue = (hoursList) =>
      `${hoursList
        .map((hour) => `${hour} hour${hour === 1 ? "" : "s"}`)
        .join(", ")}.`;
    const buildHourSuggestions = (count) => {
      if (count <= 0) {
        return [];
      }
      if (count === 1) {
        return [[1], [2], [3]];
      }
      if (count === 2) {
        return [
          [1, 1],
          [2, 1],
          [2, 2]
        ];
      }
      if (count === 3) {
        return [
          [2, 1, 1],
          [1, 1, 1],
          [2, 2, 2]
        ];
      }
      return [];
    };

    if (Number.isFinite(pendingLaborRate)) {
      return buildHourSuggestions(targetCount).map((hoursList, index) => ({
        id: `labor-hours-${index}`,
        label: formatLabel(hoursList),
        value: formatValue(hoursList)
      }));
    }

    const rateSuggestions = buildLaborRateSuggestions({
      laborItems,
      lineItemLibrary,
      savedLaborRate,
      maxSuggestions: 4
    });
    return rateSuggestions
      .map((suggestion, index) => {
        const safeRate = Number.isFinite(suggestion?.rate) ? suggestion.rate : null;
        if (!safeRate) {
          return null;
        }
        const source = suggestion?.source;
        const label =
          source === "matched"
            ? `Use saved match ($${formatRateToken(safeRate)}/hr)`
            : source === "last_used"
              ? `Use last ($${formatRateToken(safeRate)}/hr)`
              : `Use $${formatRateToken(safeRate)}/hr`;
        return {
          id: `labor-rate-${source || "common"}-${safeRate}-${index}`,
          label,
          value: `Hourly $${formatRateToken(safeRate)}/hr.`
        };
      })
      .filter(Boolean);
  };

  globalScope.InvoiceAIIntakeHelpers = {
    initialIntakeMessages,
    readDraftFromStorage,
    readStoredLaborRate,
    storeLaborRate,
    normalizePreviewText,
    buildBillieChangePreview,
    buildLaborRateSuggestions,
    buildLaborQuickReplies
  };
})(typeof window !== "undefined" ? window : globalThis);
