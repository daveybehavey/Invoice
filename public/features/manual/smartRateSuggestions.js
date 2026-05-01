((globalScope) => {
  const MATCH_STOP_WORDS = new Set([
    "and",
    "the",
    "for",
    "with",
    "from",
    "that",
    "this",
    "job",
    "work",
    "service",
    "visit"
  ]);

  const normalizeMatchText = (value) =>
    typeof value === "string" ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";

  const tokenizeMatchText = (value) =>
    normalizeMatchText(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token));

  const extractClientNameFromBillTo = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    const [firstLine] = value.split("\n");
    return firstLine?.trim() ?? "";
  };

  const parsePositiveRate = (value) => {
    const parsed = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
  };
  const parseUsageCount = (value) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };
  const resolveMatchConfidence = ({ clientMatch, overlap, usageCount }) => {
    if (clientMatch && (overlap >= 2 || usageCount >= 3)) {
      return "high";
    }
    if (clientMatch || overlap >= 2) {
      return "medium";
    }
    return "low";
  };

  const resolveBestSavedRateSuggestion = ({ lineDescription, currentClientName, lineItemLibrary }) => {
    const lineTokens = tokenizeMatchText(lineDescription);
    if (!lineTokens.length) {
      return null;
    }
    const lineTokenSet = new Set(lineTokens);
    const normalizedClient = normalizeMatchText(currentClientName);
    let bestMatch = null;
    for (const entry of Array.isArray(lineItemLibrary) ? lineItemLibrary : []) {
      const rate = parsePositiveRate(entry?.rate ?? entry?.unitPrice);
      if (!rate) {
        continue;
      }
      const normalizedEntryClient = normalizeMatchText(entry?.clientName);
      const clientMatch =
        Boolean(normalizedClient) &&
        Boolean(normalizedEntryClient) &&
        normalizedClient === normalizedEntryClient;
      const overlap = tokenizeMatchText(entry?.description).reduce(
        (score, token) => (lineTokenSet.has(token) ? score + 1 : score),
        0
      );
      if (overlap <= 0) {
        continue;
      }
      const updatedAtTs = Number.parseInt(
        String(Date.parse(typeof entry?.updatedAt === "string" ? entry.updatedAt : "")),
        10
      );
      const candidate = {
        rate,
        clientMatch,
        overlap,
        usageCount: parseUsageCount(entry?.usageCount),
        confidence: resolveMatchConfidence({
          clientMatch,
          overlap,
          usageCount: parseUsageCount(entry?.usageCount)
        }),
        description: typeof entry?.description === "string" ? entry.description.trim() : "",
        qty:
          entry?.qty === null || entry?.qty === undefined || entry?.qty === ""
            ? ""
            : String(entry.qty).trim(),
        clientName:
          typeof entry?.clientName === "string" ? entry.clientName.trim() : "",
        updatedAtTs: Number.isFinite(updatedAtTs) ? updatedAtTs : 0
      };
      if (!bestMatch) {
        bestMatch = candidate;
        continue;
      }
      if (Boolean(candidate.clientMatch) !== Boolean(bestMatch.clientMatch)) {
        if (candidate.clientMatch) {
          bestMatch = candidate;
        }
        continue;
      }
      if (candidate.overlap !== bestMatch.overlap) {
        if (candidate.overlap > bestMatch.overlap) {
          bestMatch = candidate;
        }
        continue;
      }
      if (candidate.usageCount !== bestMatch.usageCount) {
        if (candidate.usageCount > bestMatch.usageCount) {
          bestMatch = candidate;
        }
        continue;
      }
      if (candidate.updatedAtTs > bestMatch.updatedAtTs) {
        bestMatch = candidate;
      }
    }
    return bestMatch;
  };

  const rankSavedLineItems = ({ billToDetails, lineItems, savedLineItemLibrary }) => {
    const normalizedClientName = normalizeMatchText(extractClientNameFromBillTo(billToDetails));
    const currentLineTokens = new Set(
      (Array.isArray(lineItems) ? lineItems : [])
        .flatMap((item) => tokenizeMatchText(item?.description))
        .filter(Boolean)
    );
    return (Array.isArray(savedLineItemLibrary) ? savedLineItemLibrary : [])
      .map((entry) => {
        const normalizedEntryClient = normalizeMatchText(entry?.clientName);
        const clientMatch =
          Boolean(normalizedClientName) &&
          Boolean(normalizedEntryClient) &&
          normalizedClientName === normalizedEntryClient;
        const serviceMatchScore = tokenizeMatchText(entry?.description).reduce(
          (score, token) => (currentLineTokens.has(token) ? score + 1 : score),
          0
        );
        const usageCount = parseUsageCount(entry?.usageCount);
        const updatedAtTs = Number.parseInt(
          String(Date.parse(typeof entry?.updatedAt === "string" ? entry.updatedAt : "")),
          10
        );
        return {
          entry,
          clientMatch,
          serviceMatchScore,
          usageCount,
          updatedAtTs: Number.isFinite(updatedAtTs) ? updatedAtTs : 0
        };
      })
      .sort((left, right) => {
        if (Boolean(right.clientMatch) !== Boolean(left.clientMatch)) {
          return right.clientMatch ? 1 : -1;
        }
        if (right.serviceMatchScore !== left.serviceMatchScore) {
          return right.serviceMatchScore - left.serviceMatchScore;
        }
        if (right.usageCount !== left.usageCount) {
          return right.usageCount - left.usageCount;
        }
        return right.updatedAtTs - left.updatedAtTs;
      });
  };

  const buildSavedRateContextsByLineId = ({
    billToDetails,
    lineItems,
    savedLineItemLibrary,
    includeRatedLines = false
  }) => {
    const currentClientName = extractClientNameFromBillTo(billToDetails);
    const suggestions = {};
    (Array.isArray(lineItems) ? lineItems : []).forEach((item) => {
      if (!item?.id) {
        return;
      }
      if (!includeRatedLines && parsePositiveRate(item?.rate ?? item?.unitPrice)) {
        return;
      }
      const description = typeof item?.description === "string" ? item.description.trim() : "";
      if (!description) {
        return;
      }
      const suggestion = resolveBestSavedRateSuggestion({
        lineDescription: description,
        currentClientName,
        lineItemLibrary: savedLineItemLibrary
      });
      if (suggestion) {
        suggestions[item.id] = suggestion;
      }
    });
    return suggestions;
  };

  const buildLineRateSuggestionsByLineId = (options) =>
    buildSavedRateContextsByLineId({
      ...options,
      includeRatedLines: false
    });

  globalScope.InvoiceManualSmartRateSuggestions = {
    rankSavedLineItems,
    buildLineRateSuggestionsByLineId,
    buildSavedRateContextsByLineId
  };
})(typeof window !== "undefined" ? window : globalThis);
