(() => {
  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/intake/readiness.js."
    );
  }

  const { generateInvoiceNumber, polishLineItemDescription } = formatUtils;
  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/intake/readiness.js."
    );
  }
  const { applyClientMemoryToDraft } = clientMemoryUtils;

  const isReadinessDebugEnabled = () => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("readinessDebug") === "1") {
        return true;
      }
      return window.localStorage.getItem("invoiceReadinessDebug") === "true";
    } catch (_error) {
      return false;
    }
  };

  const logReadinessEvent = (event, payload) => {
    if (!isReadinessDebugEnabled()) {
      return;
    }
    console.log(`[readiness:${event}]`, payload);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("invoice:readiness-debug", {
          detail: {
            event,
            payload,
            timestamp: Date.now()
          }
        })
      );
    }
  };

  // Keep this in sync with src/services/intakeReadiness.ts.
  const evaluateIntakeReadiness = ({
    intakePhase,
    followUp,
    finishedInvoice,
    openDecisionCount,
    qualityBlockerCount,
    pendingLaborRate
  }) => {
    const normalizedDecisionCount =
      Number.isFinite(openDecisionCount) && openDecisionCount > 0 ? Math.floor(openDecisionCount) : 0;
    const normalizedQualityBlockerCount =
      Number.isFinite(qualityBlockerCount) && Number(qualityBlockerCount) > 0
        ? Math.floor(Number(qualityBlockerCount))
        : 0;
    const hasFinishedInvoice = Boolean(finishedInvoice);
    // Data authority first: follow-up payload drives follow-up state, not phase labels.
    const needsFollowUp = Boolean(followUp);
    const needsLaborHoursOnly = needsFollowUp && Number.isFinite(pendingLaborRate);
    const canGenerate =
      hasFinishedInvoice &&
      normalizedDecisionCount === 0 &&
      normalizedQualityBlockerCount === 0 &&
      !needsFollowUp;
    const needsSummaryConfirmation = canGenerate && intakePhase !== "ready_to_generate";

    let lockReason = "missing_input";
    if (canGenerate) {
      lockReason = "ready";
    } else if (needsLaborHoursOnly) {
      lockReason = "labor_hours_missing";
    } else if (needsFollowUp) {
      lockReason = "labor_pricing_missing";
    } else if (normalizedDecisionCount > 0) {
      lockReason = "open_decisions";
    } else if (normalizedQualityBlockerCount > 0) {
      lockReason = "output_quality_review";
    } else if (hasFinishedInvoice) {
      lockReason = "review_required";
    }

    const helperTextByReason = {
      ready: "Ready to generate.",
      labor_hours_missing: "Add missing hours to continue.",
      labor_pricing_missing: "Add labor pricing to continue.",
      open_decisions: "Choose Add or Skip to continue.",
      output_quality_review: "Review flagged items to continue.",
      review_required: "Review the draft, then generate.",
      missing_input: "Paste notes to start."
    };

    const wizardStep = (() => {
      if (!hasFinishedInvoice && !needsFollowUp) {
        return "paste";
      }
      if (needsFollowUp || normalizedDecisionCount > 0) {
        return "decisions";
      }
      if (normalizedQualityBlockerCount > 0) {
        return "review";
      }
      if (hasFinishedInvoice && normalizedDecisionCount === 0) {
        return "confirm";
      }
      return "review";
    })();

    const targetPhase = (() => {
      if (needsFollowUp) {
        return "awaiting_follow_up";
      }
      if (!hasFinishedInvoice) {
        return "collecting";
      }
      if (normalizedDecisionCount > 0) {
        return "ready_to_summarize";
      }
      if (intakePhase === "ready_to_generate") {
        return "ready_to_generate";
      }
      return "ready_to_summarize";
    })();

    return {
      hasFinishedInvoice,
      needsFollowUp,
      needsLaborHoursOnly,
      openDecisionCount: normalizedDecisionCount,
      qualityBlockerCount: normalizedQualityBlockerCount,
      canGenerate,
      needsSummaryConfirmation,
      lockReason,
      helperText: helperTextByReason[lockReason] ?? helperTextByReason.missing_input,
      wizardStep,
      targetPhase
    };
  };

  const evaluateResponseReadiness = ({
    followUp,
    finishedInvoice,
    openDecisionCount,
    qualityBlockerCount = 0,
    pendingLaborRate = null
  }) =>
    evaluateIntakeReadiness({
      intakePhase: "collecting",
      followUp,
      finishedInvoice,
      openDecisionCount,
      qualityBlockerCount,
      pendingLaborRate
    });

  const buildDraftFromFinishedInvoice = (invoice, options = {}) => {
    const today = new Date().toISOString().slice(0, 10);
    const useFreshDraft = options.freshDraft === true;
    const issueDate =
      typeof invoice?.issueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(invoice.issueDate)
        ? invoice.issueDate.slice(0, 10)
        : "";
    const lineItems =
      invoice?.lineItems?.map((lineItem, index) => {
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
          description: polishLineItemDescription(lineItem.description ?? ""),
          qty: finalQty,
          rate: rateValue
        };
      }) ?? [];

    const draft = {
      invoiceNumber:
        typeof options.invoiceNumber === "string"
          ? options.invoiceNumber
          : useFreshDraft
            ? generateInvoiceNumber()
            : typeof invoice?.invoiceNumber === "string" && invoice.invoiceNumber.trim()
              ? invoice.invoiceNumber
              : generateInvoiceNumber(),
      invoiceDate:
        typeof options.invoiceDate === "string"
          ? options.invoiceDate
          : useFreshDraft
            ? today
            : issueDate || today,
      fromDetails: "",
      billToDetails: invoice?.customerName ?? "",
      notes: invoice?.notes ?? "",
      paymentLinkUrl: invoice?.paymentLinkUrl ?? "",
      taxRate: options.taxRate ?? "0",
      lineItems: lineItems.length
        ? lineItems
        : [{ id: `line-${Date.now()}`, description: "", qty: "", rate: "" }],
      logoUrl: null,
      stylePreset: "default",
      savedInvoiceId: options.savedInvoiceId ?? ""
    };
    return applyClientMemoryToDraft(draft);
  };

  window.InvoiceIntakeReadiness = {
    isReadinessDebugEnabled,
    logReadinessEvent,
    evaluateIntakeReadiness,
    evaluateResponseReadiness,
    buildDraftFromFinishedInvoice
  };
})();
