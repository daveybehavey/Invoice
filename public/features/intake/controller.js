(() => {
  const intakeHelpers = window.InvoiceIntakeHelpers;
  if (!intakeHelpers) {
    throw new Error(
      "Missing /utils/intakeHelpers.js load. Ensure it is loaded before /features/intake/controller.js."
    );
  }
  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/intake/controller.js."
    );
  }
  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/intake/controller.js."
    );
  }

  const { normalizeSnippet, extractKeywords } = intakeHelpers;
  const { applyClientMemoryToDraft } = clientMemoryUtils;
  const {
    formatMoney,
    formatDisplayDescription,
    polishLineItemDescription,
    generateInvoiceNumber
  } = formatUtils;

  const applyDecisionActionToInvoice = (invoice, action) => {
    if (!invoice || !action) {
      return invoice;
    }
    if (action.type !== "exclude" || !action.snippet) {
      return invoice;
    }
    const decisionKeywords = new Set(extractKeywords(action.snippet));
    if (decisionKeywords.size === 0) {
      return invoice;
    }
    const nextLineItems = Array.isArray(invoice.lineItems)
      ? invoice.lineItems.map((item) => {
          const itemKeywords = new Set(extractKeywords(item.description ?? ""));
          let overlapCount = 0;
          decisionKeywords.forEach((keyword) => {
            if (itemKeywords.has(keyword)) {
              overlapCount += 1;
            }
          });
          if (overlapCount < 2) {
            return item;
          }
          return {
            ...item,
            unitPrice: 0,
            amount: 0
          };
        })
      : invoice.lineItems;
    return {
      ...invoice,
      lineItems: nextLineItems
    };
  };

  const orderLineItemsForTranscript = (lineItems, transcript) => {
    if (!Array.isArray(lineItems) || lineItems.length <= 1) {
      return lineItems;
    }
    const normalizedTranscript = normalizeSnippet(transcript ?? "");
    if (!normalizedTranscript) {
      return lineItems;
    }
    return lineItems
      .map((item, index) => {
        const keywords = extractKeywords(item.description ?? "");
        let position = Number.POSITIVE_INFINITY;
        keywords.forEach((keyword) => {
          const idx = normalizedTranscript.indexOf(keyword);
          if (idx >= 0 && idx < position) {
            position = idx;
          }
        });
        return { item, position, index };
      })
      .sort((a, b) => {
        if (a.position === b.position) {
          return a.index - b.index;
        }
        return a.position - b.position;
      })
      .map((entry) => entry.item);
  };

  const extractTaxRateFromText = (text) => {
    if (!text) {
      return null;
    }
    const taxMatch =
      text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:sales\s+)?tax/i) ||
      text.match(/tax[^\\d]{0,10}(\d+(?:\.\d+)?)\s*%/i);
    if (!taxMatch) {
      return null;
    }
    const rate = Number.parseFloat(taxMatch[1]);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return null;
    }
    return rate;
  };

  const isExplicitNoTax = (text) =>
    /\b(no\s+tax|without\s+tax|exclude\s+tax|skip\s+tax|tax\s+exempt|tax[-\s]*free)\b/i.test(text);

  const mergeUniqueList = (current, incoming) => {
    const seen = new Set(current.map((item) => normalizeSnippet(item)));
    const merged = [...current];
    incoming.forEach((item) => {
      const normalized = normalizeSnippet(item);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      merged.push(item);
    });
    return merged;
  };

  const mergeDecisionLists = (current, incoming) => {
    const merged = new Map();
    current.forEach((decision) => {
      const key = decision.id ?? decision.prompt ?? JSON.stringify(decision);
      merged.set(key, decision);
    });
    incoming.forEach((decision) => {
      const key = decision.id ?? decision.prompt ?? JSON.stringify(decision);
      if (!merged.has(key)) {
        merged.set(key, decision);
      }
    });
    return Array.from(merged.values());
  };

  const buildTranscript = (nextMessages) =>
    nextMessages
      .filter((message) => message.role === "user")
      .map((message) => message.text.trim())
      .filter(Boolean)
      .join("\n");

  const buildSummaryText = (invoice, decisions = [], unparsedCount = 0, qualityBlockerCount = 0) => {
    if (!invoice) {
      return "I need a little more detail before I can draft the invoice.";
    }
    const summaryLines = [];
    const itemCount = invoice.lineItems.length;
    summaryLines.push(`Captured ${itemCount} line item${itemCount > 1 ? "s" : ""}.`);
    if (decisions.length > 0) {
      summaryLines.push(
        `${decisions.length} decision${decisions.length > 1 ? "s" : ""} need${
          decisions.length > 1 ? "" : "s"
        } your call.`
      );
    }
    if (unparsedCount > 0) {
      summaryLines.push(
        `${unparsedCount} note${unparsedCount > 1 ? "s" : ""} need${
          unparsedCount > 1 ? "" : "s"
        } review.`
      );
    }
    if (qualityBlockerCount > 0) {
      summaryLines.push(
        `${qualityBlockerCount} review item${qualityBlockerCount > 1 ? "s" : ""} need${
          qualityBlockerCount > 1 ? "" : "s"
        } cleanup.`
      );
    }
    summaryLines.push("Check the draft snapshot below.");
    if (decisions.length > 0) {
      return `${summaryLines.join(" ")}\n\nNext: choose Add or Skip in Decisions.`;
    }
    if (qualityBlockerCount > 0) {
      return `${summaryLines.join(" ")}\n\nNext: fix flagged review items.`;
    }
    return `${summaryLines.join(" ")}\n\nReady to generate.`;
  };

  const buildReviewPayload = (
    invoice,
    decisions = [],
    unparsed = [],
    transcript = "",
    qualityGate = null
  ) => {
    if (!invoice) {
      return null;
    }
    const orderedLineItems = orderLineItemsForTranscript(invoice.lineItems ?? [], transcript);
    return {
      id: `review-${Date.now()}`,
      customerName: invoice.customerName ?? "",
      servicePeriodStart: invoice.servicePeriodStart ?? "",
      servicePeriodEnd: invoice.servicePeriodEnd ?? "",
      notes: invoice.notes ?? "",
      lineItems: orderedLineItems.map((item, index) => ({
        id: item.id ?? `review-line-${index}`,
        type: item.type ?? "other",
        description: formatDisplayDescription(item.description),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount
      })),
      decisions: decisions.map((decision) => ({
        id: decision.id,
        kind: decision.kind,
        prompt: decision.prompt,
        sourceSnippet: decision.sourceSnippet
      })),
      unparsed: Array.isArray(unparsed) ? unparsed : [],
      qualityGate
    };
  };

  const buildDecisionFollowUp = (decisions) => {
    const lines = decisions.map((decision) => `- ${decision.prompt}`);
    return `Open decisions:\n${lines.join("\n")}\n\nNext: choose Add or Skip.`;
  };

  const buildDraftFromInvoice = (invoice, taxOverride, transcript = "") => {
    const today = new Date().toISOString().slice(0, 10);
    const issueDate =
      typeof invoice?.issueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(invoice.issueDate)
        ? invoice.issueDate.slice(0, 10)
        : "";
    const orderedLineItems = orderLineItemsForTranscript(invoice?.lineItems ?? [], transcript);
    const lineItems =
      orderedLineItems?.map((lineItem, index) => {
        const hasQuantity = Number.isFinite(lineItem.quantity);
        const hasUnitPrice = Number.isFinite(lineItem.unitPrice);
        const hasAmount = Number.isFinite(lineItem.amount);
        const qtyValue = hasQuantity ? String(lineItem.quantity) : "";
        const rateValue = hasUnitPrice
          ? String(lineItem.unitPrice)
          : !hasQuantity && !hasUnitPrice && hasAmount && lineItem.amount > 0
            ? String(lineItem.amount)
            : "";
        const finalQty = rateValue && !qtyValue ? "1" : qtyValue;
        return {
          id: lineItem.id ?? `line-${Date.now()}-${index}`,
          description: polishLineItemDescription(lineItem.description),
          qty: finalQty,
          rate: rateValue
        };
      }) ?? [];

    const draft = {
      invoiceNumber:
        typeof invoice?.invoiceNumber === "string" && invoice.invoiceNumber.trim()
          ? invoice.invoiceNumber
          : generateInvoiceNumber(),
      invoiceDate: issueDate || today,
      fromDetails: "",
      billToDetails: invoice?.customerName ?? "",
      notes: invoice?.notes ?? "",
      taxRate: taxOverride ?? "0",
      lineItems: lineItems.length
        ? lineItems
        : [{ id: `line-${Date.now()}`, description: "", qty: "", rate: "" }],
      logoUrl: null,
      stylePreset: "default"
    };
    return applyClientMemoryToDraft(draft);
  };

  const extractDecisionSnippet = (prompt) => {
    const quoted = prompt.match(/"([^"]+)"/);
    if (quoted?.[1]) {
      return quoted[1];
    }
    return prompt.replace(/^Bill this item\?\s*/i, "").replace(/^Confirm:\s*/i, "").trim();
  };

  const cleanDecisionSnippet = (snippet) => {
    if (!snippet) {
      return "";
    }
    let cleaned = snippet.trim();
    cleaned = cleaned.replace(
      /^(on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b[,:-]?\s*/i,
      ""
    );
    cleaned = cleaned.replace(/\b(not sure if i should bill|up to you|do what makes sense).*$/i, "");
    cleaned = cleaned.replace(/\bmaybe\b/gi, "");
    cleaned = cleaned.replace(/\s*[-–—]\s*$/g, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    return cleaned;
  };

  const shortenSnippet = (snippet, maxLength = 48) => {
    if (snippet.length <= maxLength) {
      return snippet;
    }
    return `${snippet.slice(0, maxLength - 3)}...`;
  };

  const buildDecisionAckMessage = (action, resolvedCount, remainingDecisions = null) => {
    const progressText =
      Number.isFinite(remainingDecisions) && remainingDecisions >= 0
        ? remainingDecisions === 0
          ? "Ready to generate."
          : `${remainingDecisions} decision${remainingDecisions > 1 ? "s" : ""} left.`
        : "";
    if (!resolvedCount || resolvedCount <= 0) {
      return null;
    }
    if (!action) {
      return progressText
        ? `Updated. ${progressText}`
        : `Updated ${resolvedCount} item${resolvedCount > 1 ? "s" : ""}.`;
    }
    if (action.type === "bulk_include") {
      return progressText
        ? `Included all pending items. ${progressText}`
        : `Included all pending items. ${resolvedCount} resolved.`;
    }
    if (action.type === "bulk_exclude") {
      return progressText
        ? `Skipped all pending items. ${progressText}`
        : `Skipped all pending items. ${resolvedCount} resolved.`;
    }
    if (action.kind === "tax") {
      if (action.type === "tax_apply") {
        return progressText ? `Tax will be applied. ${progressText}` : "Tax will be applied.";
      }
      if (action.type === "tax_skip") {
        return progressText ? `Keeping tax at 0%. ${progressText}` : "Keeping tax at 0%.";
      }
    }
    const snippet = action.snippet ? shortenSnippet(action.snippet, 36) : "that item";
    if (action.type === "include") {
      return progressText ? `Added ${snippet}. ${progressText}` : `Added ${snippet}.`;
    }
    if (action.type === "exclude") {
      return progressText ? `Skipped ${snippet}. ${progressText}` : `Skipped ${snippet}.`;
    }
    return progressText
      ? `Updated. ${progressText}`
      : `Updated ${resolvedCount} item${resolvedCount > 1 ? "s" : ""}.`;
  };

  const buildDecisionActions = (decision) => {
    const rawSnippet = extractDecisionSnippet(decision.prompt ?? "");
    const cleanedSnippet = cleanDecisionSnippet(rawSnippet) || rawSnippet;
    const snippet = shortenSnippet(cleanedSnippet);
    const cleanedActionSnippet = (rawSnippet || decision.prompt || "this item").replace(
      /^bill\s+/i,
      ""
    );
    const cleanedDisplaySnippet = snippet.replace(/^bill\s+/i, "");
    const baseAction = { id: decision.id, kind: decision.kind, snippet: rawSnippet };
    const display =
      decision.kind === "tax"
        ? "Apply tax?"
        : rawSnippet
          ? `Bill ${cleanedDisplaySnippet}?`
          : decision.prompt ?? "Decision needed";
    const includeLabel = decision.kind === "tax" ? "Apply tax" : "Add";
    const excludeLabel = decision.kind === "tax" ? "No tax" : "Skip";
    const includeValue =
      decision.kind === "tax" ? "Apply tax." : `Bill ${cleanedActionSnippet}.`;
    const excludeValue =
      decision.kind === "tax" ? "No tax." : `Don't bill ${cleanedActionSnippet}.`;
    return {
      display,
      includeLabel,
      excludeLabel,
      includeValue,
      excludeValue,
      includeAction:
        decision.kind === "tax"
          ? { ...baseAction, type: "tax_apply" }
          : { ...baseAction, type: "include" },
      excludeAction:
        decision.kind === "tax"
          ? { ...baseAction, type: "tax_skip" }
          : { ...baseAction, type: "exclude" }
    };
  };

  window.InvoiceIntakeController = {
    applyDecisionActionToInvoice,
    orderLineItemsForTranscript,
    extractTaxRateFromText,
    isExplicitNoTax,
    mergeUniqueList,
    mergeDecisionLists,
    buildTranscript,
    buildSummaryText,
    buildReviewPayload,
    buildDecisionFollowUp,
    buildDraftFromInvoice,
    extractDecisionSnippet,
    cleanDecisionSnippet,
    shortenSnippet,
    buildDecisionAckMessage,
    buildDecisionActions
  };
})();
