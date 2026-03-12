(() => {
  const normalizeInstruction = (instruction) =>
    typeof instruction === "string" ? instruction.trim().toLowerCase() : "";

  const resolveTargetLineIndex = (normalizedInstruction, lineItems = []) => {
    if (!normalizedInstruction || lineItems.length === 0) {
      return null;
    }
    if (lineItems.length === 1) {
      return 0;
    }
    const numberedMatch = normalizedInstruction.match(/\b(?:line|item)\s+(\d+)\b/);
    if (numberedMatch) {
      const parsed = Number.parseInt(numberedMatch[1], 10);
      return Number.isInteger(parsed) && parsed > 0 && parsed <= lineItems.length ? parsed - 1 : null;
    }
    if (/\bfirst\b/.test(normalizedInstruction)) return 0;
    if (/\bsecond\b/.test(normalizedInstruction) && lineItems.length >= 2) return 1;
    if (/\bthird\b/.test(normalizedInstruction) && lineItems.length >= 3) return 2;
    return null;
  };

  const resolveBillieStyleCommand = (instruction, options = {}) => {
    const normalized = normalizeInstruction(instruction);
    if (!normalized) {
      return null;
    }

    const stylePresets = options.stylePresets ?? {};
    const spacingDensityPresets = options.spacingDensityPresets ?? {};
    const hasStyleContext = /\b(template|style|layout|look|accent|color)\b/.test(normalized);
    const hasLogoInstruction = /\blogo\b/.test(normalized);
    const styleAccents = Array.isArray(options.styleAccents) ? options.styleAccents : [];
    const result = {
      stylePreset: null,
      styleLabel: null,
      accentColor: null,
      accentLabel: null,
      logoVisible: null,
      notesVisible: null,
      headerLayout: null,
      headerLabel: null,
      spacingDensity: null,
      spacingLabel: null
    };

    if (hasStyleContext || /\bclassic\b/.test(normalized)) {
      if (/\b(classic|default)\b/.test(normalized)) {
        result.stylePreset = "default";
        result.styleLabel = stylePresets.default?.label ?? "Classic";
      } else if (/\b(minimal|compact)\b/.test(normalized)) {
        result.stylePreset = "compact";
        result.styleLabel = stylePresets.compact?.label ?? "Compact";
      } else if (/\b(bold|spacious)\b/.test(normalized)) {
        result.stylePreset = "spacious";
        result.styleLabel = stylePresets.spacious?.label ?? "Spacious";
      }
    }

    const matchedAccent = styleAccents.find((accent) =>
      Array.isArray(accent.matches) ? accent.matches.some((pattern) => pattern.test(normalized)) : false
    );
    if (matchedAccent) {
      result.accentColor = matchedAccent.value;
      result.accentLabel = matchedAccent.label;
    }

    if (/\bheader\b/.test(normalized) && /\b(center|centered|stacked)\b/.test(normalized)) {
      result.headerLayout = "centered";
      result.headerLabel = "Centered";
    } else if (/\bheader\b/.test(normalized) && /\bsplit\b/.test(normalized)) {
      result.headerLayout = "split";
      result.headerLabel = "Split";
    }

    const hasSpacingInstruction =
      /\b(spacing|density|padding)\b/.test(normalized) || /breathing room/.test(normalized);
    if (hasSpacingInstruction && /\b(tight|tighter|dense|denser)\b/.test(normalized)) {
      result.spacingDensity = "tight";
      result.spacingLabel = spacingDensityPresets.tight?.label ?? "Tight";
    } else if (
      hasSpacingInstruction &&
      (/\b(airy|airier|loose|looser)\b/.test(normalized) || /breathing room/.test(normalized))
    ) {
      result.spacingDensity = "airy";
      result.spacingLabel = spacingDensityPresets.airy?.label ?? "Airy";
    } else if (hasSpacingInstruction && /\b(standard|balanced|normal)\b/.test(normalized)) {
      result.spacingDensity = "balanced";
      result.spacingLabel = spacingDensityPresets.balanced?.label ?? "Balanced";
    }

    if (hasLogoInstruction && /\b(hide|remove)\b/.test(normalized)) {
      if (options.logoUrl) {
        result.logoVisible = false;
      } else {
        return { responseText: "No uploaded logo yet. Add one from Style first." };
      }
    } else if (hasLogoInstruction && /\b(show|restore)\b/.test(normalized)) {
      if (options.logoUrl) {
        result.logoVisible = true;
      } else {
        return { responseText: "No uploaded logo yet. Add one from Style first." };
      }
    }

    if (/\b(notes?|terms?)\b/.test(normalized) && /\b(hide|remove)\b/.test(normalized)) {
      result.notesVisible = false;
    } else if (/\b(notes?|terms?)\b/.test(normalized) && /\b(show|restore)\b/.test(normalized)) {
      result.notesVisible = true;
    }

    if (
      !result.stylePreset &&
      !result.accentColor &&
      result.logoVisible === null &&
      result.notesVisible === null &&
      !result.headerLayout &&
      !result.spacingDensity
    ) {
      return null;
    }

    const parts = [];
    if (result.styleLabel) {
      parts.push(`template → ${result.styleLabel}`);
    }
    if (result.accentLabel) {
      parts.push(`accent → ${result.accentLabel}`);
    }
    if (result.logoVisible !== null) {
      parts.push(`logo → ${result.logoVisible ? "visible" : "hidden"}`);
    }
    if (result.notesVisible !== null) {
      parts.push(`notes → ${result.notesVisible ? "visible" : "hidden"}`);
    }
    if (result.headerLabel) {
      parts.push(`header → ${result.headerLabel}`);
    }
    if (result.spacingLabel) {
      parts.push(`spacing → ${result.spacingLabel}`);
    }

    return {
      ...result,
      responseText: `Applied style updates: ${parts.join(", ")}.`
    };
  };

  const resolveBillieWordingCommand = (instruction) => {
    const normalized = normalizeInstruction(instruction);
    if (!normalized) {
      return null;
    }

    const hasWordingVerb =
      /\b(rewrite|refine|polish|clean up|improve|make|shorten|simplify)\b/.test(normalized) ||
      /\b(formal|professional|friendly|clearer|clear|concise|simpler|plain)\b/.test(normalized);
    if (!hasWordingVerb) {
      return null;
    }

    let scope = "full";
    if (/\b(notes?|terms?)\b/.test(normalized)) {
      scope = "notes";
    } else if (/\b(descriptions?|line items?|items?)\b/.test(normalized)) {
      scope = "descriptions";
    }

    let tone = "Neutral";
    if (/\b(stronger|assertive)\b/.test(normalized)) {
      tone = "Stronger";
    } else if (/\b(formal|professional)\b/.test(normalized)) {
      tone = "Formal";
    } else if (/\b(friendly|warmer|softer)\b/.test(normalized)) {
      tone = "Friendly";
    } else if (/\b(simpler|simple|plain|clearer|clear|concise|shorter)\b/.test(normalized)) {
      tone = "Neutral";
    }

    const label =
      scope === "notes" ? "notes" : scope === "descriptions" ? "descriptions" : "wording";
    return { scope, tone, loadingText: `Billie is refining ${label}…` };
  };

  const resolveBillieTaxCommand = (instruction) => {
    const normalized = normalizeInstruction(instruction);
    if (!normalized || !/\btax\b/.test(normalized)) {
      return null;
    }
    if (
      /\b(no tax|remove tax|tax off|zero tax)\b/.test(normalized) ||
      (/\btax\b/.test(normalized) && /\b0\s*%/.test(normalized))
    ) {
      return { taxRate: "0", responseText: "Applied tax → 0%." };
    }
    if (!/\b(set|make|use|apply|change|update|add)\b/.test(normalized)) {
      return null;
    }
    const explicitRate = normalized.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!explicitRate) {
      return null;
    }
    return {
      taxRate: explicitRate[1],
      responseText: `Applied tax → ${explicitRate[1]}%.`
    };
  };

  const resolveBillieDiscountCommand = (instruction, options = {}) => {
    const normalized = normalizeInstruction(instruction);
    if (!normalized || !/\bdiscount\b|\boff\b/.test(normalized)) {
      return null;
    }

    if (/\b(no discount|remove discount|delete discount|clear discount|discount off)\b/.test(normalized)) {
      return { discountAmount: "0", responseText: "Applied discount → $0.00." };
    }

    const subtotal = Number.isFinite(options.subtotal) ? Number(options.subtotal) : 0;
    const roundMoney = (value) => Math.round(value * 100) / 100;

    const percentMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%\s*(?:discount|off)\b/);
    if (percentMatch) {
      if (subtotal <= 0) {
        return { responseText: "Add priced line items before applying a discount." };
      }
      const percent = Number.parseFloat(percentMatch[1]);
      if (!Number.isFinite(percent) || percent < 0) {
        return null;
      }
      const amount = roundMoney(Math.min(subtotal, subtotal * (percent / 100)));
      return {
        discountAmount: String(amount),
        responseText: `Applied discount → $${amount.toFixed(2)} (${percentMatch[1]}%).`
      };
    }

    const amountMatch =
      normalized.match(/\$\s*(\d+(?:\.\d{1,2})?)/) ??
      normalized.match(/\bdiscount\b[^0-9]{0,16}(\d+(?:\.\d{1,2})?)\b/) ??
      normalized.match(/\b(\d+(?:\.\d{1,2})?)\s*dollars?\s+off\b/);
    if (!amountMatch) {
      return null;
    }
    if (subtotal <= 0) {
      return { responseText: "Add priced line items before applying a discount." };
    }
    const amount = Number.parseFloat(amountMatch[1]);
    if (!Number.isFinite(amount) || amount < 0) {
      return null;
    }
    const cappedAmount = roundMoney(Math.min(subtotal, amount));
    return {
      discountAmount: String(cappedAmount),
      responseText: `Applied discount → $${cappedAmount.toFixed(2)}.`
    };
  };

  const resolveBilliePaymentLinkCommand = (instruction) => {
    const normalized = normalizeInstruction(instruction);
    if (!normalized) {
      return null;
    }
    const mentionsPaymentLink =
      /\b(payment|pay)\s*(link|url)\b/.test(normalized) ||
      /\bpay online\b/.test(normalized) ||
      /\bonline payment\b/.test(normalized);
    if (!mentionsPaymentLink) {
      return null;
    }

    if (/\b(clear|remove|delete|hide|no)\b/.test(normalized)) {
      return {
        paymentLinkUrl: "",
        responseText: "Cleared payment link."
      };
    }

    const urlMatch = instruction.match(/https?:\/\/[^\s)]+/i);
    if (!urlMatch) {
      return {
        responseText: "Share the full payment URL, like https://pay.example.com/invoice/123."
      };
    }
    const normalizedUrl = urlMatch[0].replace(/[.,!?]+$/g, "");
    try {
      const parsed = new URL(normalizedUrl);
      if (!/^https?:$/i.test(parsed.protocol)) {
        return {
          responseText: "Use an http or https payment link."
        };
      }
      return {
        paymentLinkUrl: parsed.toString(),
        responseText: `Applied payment link → ${parsed.toString()}.`
      };
    } catch (_error) {
      return {
        responseText: "That payment link doesn't look valid yet."
      };
    }
  };

  const resolveBillieLineValueCommand = (instruction, options = {}) => {
    const normalized = normalizeInstruction(instruction);
    const lineItems = Array.isArray(options.lineItems)
      ? options.lineItems.filter((item) => {
          const description = typeof item?.description === "string" ? item.description.trim() : "";
          const quantity = `${item?.qty ?? ""}`.trim();
          const rate = `${item?.rate ?? ""}`.trim();
          return Boolean(description || quantity || rate);
        })
      : [];
    if (!normalized || lineItems.length === 0) {
      return null;
    }

    const hasValueIntent =
      /\b(rate|price|qty|quantity|hours?|hrs?)\b/.test(normalized) ||
      /@\s*\$?\d/.test(normalized) ||
      /\bat\s+\$?\d/.test(normalized);
    const hasChangeVerb = /\b(set|change|update|make|use)\b/.test(normalized);
    if (!hasValueIntent || !hasChangeVerb) {
      return null;
    }

    const targetIndex = resolveTargetLineIndex(normalized, lineItems);
    if (targetIndex === null) {
      return {
        responseText: "Specify which line item to update, like “set line 2 rate to $150”."
      };
    }

    const quantityMatch =
      normalized.match(/\b(?:qty|quantity)\s*(?:to)?\s*(\d+(?:\.\d+)?)\b/) ??
      normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
    const rateMatch =
      normalized.match(/\brate\s*(?:to|at)?\s*\$?\s*(\d+(?:\.\d+)?)\b/) ??
      normalized.match(/@\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:\/hr|per hour|hr|hour)?\b/) ??
      normalized.match(/\bat\s+\$?\s*(\d+(?:\.\d+)?)\s*(?:\/hr|per hour|hr|hour)\b/);

    const quantity = quantityMatch ? Number.parseFloat(quantityMatch[1]) : undefined;
    const rate = rateMatch ? Number.parseFloat(rateMatch[1]) : undefined;
    const updates = {};
    if (Number.isFinite(quantity) && quantity >= 0) {
      updates.qty = String(quantity);
    }
    if (Number.isFinite(rate) && rate >= 0) {
      updates.rate = String(rate);
    }
    if (!("qty" in updates) && !("rate" in updates)) {
      return null;
    }

    const responseParts = [];
    if ("qty" in updates) {
      responseParts.push(`qty ${updates.qty}`);
    }
    if ("rate" in updates) {
      responseParts.push(`rate $${Number.parseFloat(updates.rate).toFixed(2)}`);
    }

    return {
      targetLineId: lineItems[targetIndex]?.id,
      targetLineIndex: targetIndex,
      updates,
      responseText: `Updated line ${targetIndex + 1} → ${responseParts.join(", ")}.`
    };
  };

  const resolveBillieLineWordingCommand = (instruction, options = {}) => {
    const normalized = normalizeInstruction(instruction);
    const lineItems = Array.isArray(options.lineItems)
      ? options.lineItems.filter((item) => typeof item?.description === "string" && item.description.trim().length > 0)
      : [];
    if (!normalized || lineItems.length === 0) {
      return null;
    }

    const hasWordingVerb =
      /\b(rewrite|reword|refine|polish|clean up|improve|make)\b/.test(normalized) ||
      /\b(formal|professional|friendly|simple|simpler|clear|clearer|concise|stronger)\b/.test(normalized);
    const mentionsLine = /\b(line|item)\b/.test(normalized) || /\b(first|second|third)\b/.test(normalized);
    const includesValueIntent = /\b(rate|price|qty|quantity|hours?|hrs?)\b/.test(normalized);
    if (!hasWordingVerb || !mentionsLine || includesValueIntent) {
      return null;
    }

    const targetIndex = resolveTargetLineIndex(normalized, lineItems);
    if (targetIndex === null) {
      return {
        responseText: "Specify which line wording to refine, like “refine line 2 wording”."
      };
    }

    let tone = "Neutral";
    if (/\b(formal|professional|stronger)\b/.test(normalized)) {
      tone = "Formal";
    } else if (/\b(friendly|warmer|softer)\b/.test(normalized)) {
      tone = "Friendly";
    }

    return {
      tone,
      targetLineId: lineItems[targetIndex]?.id,
      targetLineIndex: targetIndex,
      responseText: `Line ${targetIndex + 1} updated. Numbers unchanged.`,
      loadingText: `Billie is refining line ${targetIndex + 1}…`
    };
  };

  const buildAssistantChangePreview = (beforeInvoice, afterInvoice, scope, targetLineId = null) => {
    if (scope === "notes") {
      const beforeText = (beforeInvoice?.notes ?? "").trim();
      const afterText = (afterInvoice?.notes ?? "").trim();
      if (!beforeText || !afterText || beforeText === afterText) {
        return [];
      }
      return [{ label: "Notes", before: beforeText, after: afterText }];
    }

    const beforeItems = Array.isArray(beforeInvoice?.lineItems) ? beforeInvoice.lineItems : [];
    const afterItems = Array.isArray(afterInvoice?.lineItems) ? afterInvoice.lineItems : [];
    const changes = [];
    for (let index = 0; index < Math.min(beforeItems.length, afterItems.length); index += 1) {
      const beforeItem = beforeItems[index];
      const afterItem = afterItems[index];
      if (targetLineId && afterItem?.id !== targetLineId && beforeItem?.id !== targetLineId) {
        continue;
      }
      const beforeText = (beforeItem?.description ?? "").trim();
      const afterText = (afterItem?.description ?? "").trim();
      if (!beforeText || !afterText || beforeText === afterText) {
        continue;
      }
      changes.push({
        label: `Line ${changes.length + 1}`,
        before: beforeText,
        after: afterText
      });
      if (changes.length >= 2) {
        break;
      }
    }
    return changes;
  };

  window.InvoiceManualAssistantHelpers = {
    resolveBillieStyleCommand,
    resolveBillieWordingCommand,
    resolveBillieTaxCommand,
    resolveBillieDiscountCommand,
    resolveBilliePaymentLinkCommand,
    resolveBillieLineValueCommand,
    resolveBillieLineWordingCommand,
    buildAssistantChangePreview
  };
})();
