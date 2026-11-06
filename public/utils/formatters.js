(() => {
  const formatRateToken = (rate) => {
    if (!Number.isFinite(rate)) {
      return "";
    }
    const rounded = Math.round(rate * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  };

  const cloneJson = (value) => {
    if (value === null || value === undefined) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  };

  const currencyFormatters = new Map();

  const normalizeCurrencyCode = (currency) => {
    if (typeof currency !== "string") {
      return "USD";
    }
    const normalized = currency.trim().toUpperCase();
    return normalized || "USD";
  };

  const getCurrencyFormatter = (currency) => {
    const code = normalizeCurrencyCode(currency);
    let formatter = currencyFormatters.get(code);
    if (!formatter) {
      // useGrouping:false keeps USD output byte-identical to the prior
      // `$${Number(value).toFixed(2)}` path (no thousands separators).
      formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        useGrouping: false
      });
      currencyFormatters.set(code, formatter);
    }
    return formatter;
  };

  const formatCurrencyAmount = (value, currency = "USD") => {
    if (!Number.isFinite(value)) {
      return "";
    }
    const code = normalizeCurrencyCode(currency);
    const formatter = getCurrencyFormatter(code);
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits;
    // Round with the historical Number#toFixed rule before Intl formats the
    // value. Intl rounds the shortest decimal form of the double, which
    // disagrees with toFixed on exact half-step values (2.675 -> $2.68
    // instead of $2.67, 1.005 -> $1.01 instead of $1.00); pre-rounding keeps
    // USD output byte-identical to the prior path for every input.
    const rounded = Number(Number(value).toFixed(fractionDigits));
    const formatted = formatter.format(rounded);
    if (code === "USD" && formatted.startsWith("-$")) {
      // Intl renders USD negatives as "-$5.00"; the historical formatter
      // rendered "$-5.00" (sign after the symbol). Preserve the old bytes.
      return `$-${formatted.slice(2)}`;
    }
    return formatted;
  };

  const formatMoney = (value, currency = "USD") => formatCurrencyAmount(value, currency);

  const formatPreviewMoney = (value, currency = "USD") => {
    if (!Number.isFinite(value)) {
      return "—";
    }
    return formatCurrencyAmount(value, currency);
  };

  const formatLaborDuration = (hours) => {
    if (!Number.isFinite(hours) || hours <= 0) {
      return "";
    }
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return minutes > 0 ? `${minutes} min` : "";
    }
    const rounded = Math.round(hours * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
  };

  const generateInvoiceNumber = () => {
    const now = new Date();
    const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}${String(now.getUTCDate()).padStart(2, "0")}`;
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `INV-${ymd}-${suffix}`;
  };

  const polishLineItemDescription = (text) => {
    if (!text) {
      return "";
    }
    let cleaned = text.trim().replace(/\s+/g, " ").replace(/\.+$/, "");
    if (!cleaned) {
      return "";
    }
    cleaned = cleaned.replace(/^(i|we)\s+/i, "");
    cleaned = cleaned.replace(/^did\s+(an|a|the)?\s*/i, "");
    cleaned = cleaned.replace(
      /\b(?:about|around|roughly|approximately|maybe|quickly|real quick|kind of|sort of)\b/gi,
      ""
    );
    cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*(?:mins?|minutes?|hours?|hrs?)\b/gi, "");
    cleaned = cleaned.replace(/\b(?:at|@)\s*\$?\d+(?:\.\d+)?\s*\/?\s*(?:hr|hour)\b/gi, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    const nounMappings = [
      { re: /^(fixed|fix|repaired?|repair|patched?|patch)\s+(.+)/i, suffix: "repair" },
      { re: /^(replaced|replace|swapped?|swap)\s+(.+)/i, suffix: "replacement" },
      { re: /^(installed|install)\s+(.+)/i, suffix: "installation" },
      { re: /^(cleaned|clean)\s+(.+)/i, suffix: "cleaning" },
      { re: /^(inspected|inspect|checked|check)\s+(.+)/i, suffix: "inspection" },
      { re: /^(adjusted|adjust|tightened|tighten)\s+(.+)/i, suffix: "adjustment" },
      { re: /^(tuned|tune)\s+(.+)/i, suffix: "tuning" },
      { re: /^(painted|paint)\s+(.+)/i, suffix: "painting" },
      { re: /^(updated|update|tweaked|tweak)\s+(.+)/i, suffix: "update" },
      { re: /^(designed|design)\s+(.+)/i, suffix: "design" }
    ];
    const buildMappedPhrase = (segment) => {
      for (const mapping of nounMappings) {
        const match = segment.match(mapping.re);
        const objectText = match?.[2]?.trim();
        if (!objectText) {
          continue;
        }
        const normalizedObject = objectText
          .replace(/^(the|a|an|my|our|your|his|her|their)\s+/i, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!normalizedObject || normalizedObject.split(" ").length > 8) {
          continue;
        }
        return `${normalizedObject} ${mapping.suffix}`;
      }
      return null;
    };
    const compoundSegments = cleaned
      .split(/\s+(?:and|&)\s+/i)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (compoundSegments.length > 1) {
      const mappedSegments = compoundSegments.map((segment) => buildMappedPhrase(segment));
      if (mappedSegments.every(Boolean)) {
        cleaned = mappedSegments.join(" and ");
      } else {
        const mappedSingle = buildMappedPhrase(cleaned);
        if (mappedSingle) {
          cleaned = mappedSingle;
        }
      }
    } else {
      const mappedSingle = buildMappedPhrase(cleaned);
      if (mappedSingle) {
        cleaned = mappedSingle;
      }
    }
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : "";
  };

  const formatDisplayDescription = (text) => polishLineItemDescription(text);

  window.InvoiceFormatUtils = {
    formatRateToken,
    cloneJson,
    formatCurrencyAmount,
    formatMoney,
    formatPreviewMoney,
    formatLaborDuration,
    generateInvoiceNumber,
    polishLineItemDescription,
    formatDisplayDescription
  };
})();
