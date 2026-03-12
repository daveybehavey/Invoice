(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);

  const normalizedText = (value) => (typeof value === "string" ? value.trim() : "");
  const asNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const numberEqual = (left, right) => {
    const a = asNumber(left);
    const b = asNumber(right);
    if (a === null && b === null) {
      return true;
    }
    if (a === null || b === null) {
      return false;
    }
    return Math.abs(a - b) < 0.0001;
  };
  const textEqual = (left, right) => normalizedText(left) === normalizedText(right);
  const topLevelProtectedFields = [
    "invoiceNumber",
    "issueDate",
    "servicePeriodStart",
    "servicePeriodEnd",
    "customerName",
    "currency",
    "discountAmount",
    "discountReason",
    "subtotal",
    "total",
    "balanceDue"
  ];
  const topLevelAllowedFields = new Set(["lineItems", "notes"]);

  const buildBilliePatch = (beforeInvoice, afterInvoice) => {
    const patch = {
      kind: "billie_patch",
      changedFields: [],
      changedLineItemIds: [],
      changedLineItemDescriptions: [],
      hasChanges: false,
      numbersUnchanged: true,
      violations: []
    };
    if (!beforeInvoice || !afterInvoice) {
      patch.violations.push({
        code: "missing_invoice",
        type: "structural",
        field: "invoice",
        message: "Invoice is missing."
      });
      return patch;
    }

    topLevelProtectedFields.forEach((field) => {
      const beforeValue = beforeInvoice[field];
      const afterValue = afterInvoice[field];
      const changed =
        typeof beforeValue === "number" || typeof afterValue === "number"
          ? !numberEqual(beforeValue, afterValue)
          : !textEqual(beforeValue, afterValue);
      if (changed) {
        const violationType =
          field === "subtotal" || field === "total" || field === "discountAmount" || field === "balanceDue"
            ? "money"
            : field === "discountReason"
              ? "money"
              : "structural";
        patch.violations.push({
          code: "protected_top_level_change",
          type: violationType,
          field,
          message: `${field} cannot be edited in Billie workspace.`
        });
      }
    });

    const beforeLines = Array.isArray(beforeInvoice.lineItems) ? beforeInvoice.lineItems : [];
    const afterLines = Array.isArray(afterInvoice.lineItems) ? afterInvoice.lineItems : [];
    if (beforeLines.length !== afterLines.length) {
      patch.violations.push({
        code: "line_count_change",
        type: "structural",
        field: "lineItems",
        message: "Billie cannot add or remove line items in this mode."
      });
    }

    const maxLength = Math.max(beforeLines.length, afterLines.length);
    for (let index = 0; index < maxLength; index += 1) {
      const beforeLine = beforeLines[index];
      const afterLine = afterLines[index];
      if (!beforeLine || !afterLine) {
        continue;
      }
      if (beforeLine.id && afterLine.id && beforeLine.id !== afterLine.id) {
        patch.violations.push({
          code: "line_order_change",
          type: "structural",
          field: "lineItems",
          message: "Billie cannot reorder line items in this mode."
        });
      }
      if (
        beforeLine.type !== afterLine.type ||
        !numberEqual(beforeLine.quantity, afterLine.quantity) ||
        !numberEqual(beforeLine.unitPrice, afterLine.unitPrice) ||
        !numberEqual(beforeLine.amount, afterLine.amount)
      ) {
        patch.violations.push({
          code: "line_money_change",
          type: "money",
          field: `lineItems[${index}]`,
          message: "Billie cannot change quantities, rates, or amounts in this mode."
        });
      }
      if (!textEqual(beforeLine.sourceSessionDate, afterLine.sourceSessionDate)) {
        patch.violations.push({
          code: "line_source_change",
          type: "structural",
          field: `lineItems[${index}].sourceSessionDate`,
          message: "Billie cannot change service-date mapping in this mode."
        });
      }
      if (!textEqual(beforeLine.description, afterLine.description)) {
        patch.changedFields.push(`lineItems[${index}].description`);
        patch.changedLineItemIds.push(afterLine.id ?? beforeLine.id ?? `line-${index}`);
        patch.changedLineItemDescriptions.push(normalizedText(afterLine.description));
      }
    }

    if (!textEqual(beforeInvoice.notes, afterInvoice.notes)) {
      patch.changedFields.push("notes");
    }

    const beforeKeys = Object.keys(beforeInvoice);
    const afterKeys = Object.keys(afterInvoice);
    const allKeys = Array.from(new Set([...beforeKeys, ...afterKeys]));
    allKeys.forEach((key) => {
      if (topLevelAllowedFields.has(key) || topLevelProtectedFields.includes(key)) {
        return;
      }
      if (textEqual(beforeInvoice[key], afterInvoice[key])) {
        return;
      }
      patch.violations.push({
        code: "unsupported_field_change",
        type: "structural",
        field: key,
        message: `${key} cannot be changed in Billie workspace mode.`
      });
    });

    patch.hasChanges = patch.changedFields.length > 0;
    patch.numbersUnchanged = !patch.violations.some((violation) => violation.type === "money");
    return patch;
  };

  const parseLaborPricing = (text, laborItems = [], options = {}) => {
    const pendingRate = Number.isFinite(options.pendingRate) ? Number(options.pendingRate) : null;
    const normalized = text.toLowerCase();
    const laborKeywords = new Set([
      "labor",
      "hour",
      "hours",
      "hr",
      "rate",
      "time",
      "visit",
      "work",
      "service"
    ]);
    const itemKeywords = new Set();
    laborItems.forEach((item) => {
      const description = item?.description ?? "";
      description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
        .forEach((word) => itemKeywords.add(word));
    });
    const hasLaborContext =
      Array.from(laborKeywords).some((word) => normalized.includes(word)) ||
      Array.from(itemKeywords).some((word) => normalized.includes(word));
    const isNegative =
      normalized.includes("not included") ||
      normalized.includes("not covered") ||
      normalized.includes("not in the fee");
    const includedInFlat =
      (normalized.includes("included in the flat") ||
        normalized.includes("included in flat") ||
        normalized.includes("included in the fee") ||
        normalized.includes("included in the $")) &&
      !isNegative;
    const noCharge =
      (normalized.includes("no extra charge") ||
        normalized.includes("no extra hourly") ||
        normalized.includes("no extra fee") ||
        normalized.includes("no charge")) &&
      !isNegative;
    const alreadyCovered =
      (normalized.includes("already covered") || normalized.includes("covered already")) &&
      !isNegative;
    const declinedBilling =
      (normalized.includes("no billing") ||
        normalized.includes("dont bill") ||
        normalized.includes("don't bill") ||
        normalized.includes("do not bill")) &&
      !isNegative;
    const resolutionType = includedInFlat
      ? "included_in_flat_fee"
      : noCharge
        ? "no_charge"
        : alreadyCovered
          ? "already_covered"
          : declinedBilling
            ? "declined_billing"
            : null;
    if (resolutionType && hasLaborContext) {
      return { resolutionType };
    }

    const hourlyIntent =
      normalized.includes("hourly") ||
      normalized.includes("/hr") ||
      normalized.includes("per hour") ||
      normalized.includes("hr");
    const flatIntent =
      normalized.includes("flat") ||
      normalized.includes("flat fee") ||
      normalized.includes("total") ||
      normalized.includes("lump sum");

    const rateMatch =
      text.match(/(?:rate|hourly|per hour|\/hr|hr)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
      text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hr)/i);
    const rate = rateMatch ? Number(rateMatch[1]) : null;

    const hourMatches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/gi)).map(
      (match) => Number(match[1])
    );
    const hasHours = hourMatches.length > 0;
    const shouldTreatHourly = hourlyIntent || Boolean(rateMatch) || (pendingRate && hasHours);

    if (shouldTreatHourly) {
      const effectiveRate = rate ?? pendingRate;
      if (!effectiveRate) {
        return { error: "Please include an hourly rate (e.g. $95/hr)." };
      }
      const existingHours = laborItems.map((item) => item.hours).filter((value) => value !== undefined);
      const missingCount = laborItems.length - existingHours.length;
      const parsedHours = hourMatches.length > 0 ? hourMatches : missingCount === 0 ? existingHours : [];

      let lineHours = [];
      if (missingCount === 0 && existingHours.length === laborItems.length) {
        lineHours = existingHours;
      } else if (parsedHours.length === laborItems.length) {
        lineHours = parsedHours;
      } else if (parsedHours.length === missingCount && existingHours.length > 0) {
        let parsedIndex = 0;
        lineHours = laborItems.map((item) => {
          if (typeof item.hours === "number") {
            return item.hours;
          }
          const nextHour = parsedHours[parsedIndex];
          parsedIndex += 1;
          return nextHour;
        });
      }

      if (lineHours.length !== laborItems.length || lineHours.some((value) => !Number.isFinite(value))) {
        if (!hasHours && missingCount > 0) {
          return { rateOnly: effectiveRate };
        }
        return {
          error: `Please provide hours for each labor line (${laborItems.length} total).`
        };
      }

      return {
        laborPricing: {
          billingType: "hourly",
          rate: effectiveRate,
          lineHours
        }
      };
    }

    if (flatIntent) {
      const flatMatch =
        text.match(/flat\s*(?:fee|amount)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
        text.match(/total\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
        text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      const flatAmount = flatMatch ? Number(flatMatch[1]) : null;
      if (!flatAmount) {
        return { error: "Please include a flat amount (e.g. flat $250)." };
      }
      return {
        laborPricing: {
          billingType: "flat",
          flatAmount
        }
      };
    }

    return {
      error: "Please reply with a flat amount or an hourly rate plus hours."
    };
  };

  const createIntakeActionHandlers = ({
    requestIdRef,
    lastDecisionResolutionRef,
    lastTranscriptRef,
    setMessages,
    setInputValue,
    setPendingTaxRate,
    setPendingLaborRate,
    setLaborPricingNote,
    setSavedLaborRate,
    setFinishedInvoice,
    setIntakePhase,
    setIsTyping,
    appendAiMessage,
    appendSummaryMessage,
    runIntakeRequest,
    runDecisionActionRequest,
    runLaborPricingRequest,
    evaluateIntakeReadiness,
    logReadinessEvent,
    buildSummaryText,
    buildReviewPayload,
    buildTranscript,
    extractTaxRateFromText,
    isExplicitNoTax,
    storeLaborRate,
    onBilliePatchApplied,
    onBilliePatchRejected,
    onBillieEditLifecycle,
    rejectionKeywords,
    getDecisionAction,
    getState
  }) => {
    const applyBilliePayload = ({
      initialInvoice,
      payload,
      requestId,
      requestStartedAt,
      latestState,
      completeEditLifecycle
    }) => {
      const candidateInvoice = payload?.invoice ?? initialInvoice;
      const mergedLineItems = Array.isArray(candidateInvoice?.lineItems)
        ? candidateInvoice.lineItems.map((lineItem, index) => ({
            ...(initialInvoice?.lineItems?.[index] ?? {}),
            ...lineItem
          }))
        : initialInvoice?.lineItems;
      const nextInvoice = {
        ...initialInvoice,
        ...candidateInvoice,
        lineItems: mergedLineItems
      };
      const patch = buildBilliePatch(initialInvoice, nextInvoice);
      if (patch.violations.length > 0) {
        const moneyViolation = patch.violations.find((violation) => violation.type === "money");
        if (moneyViolation) {
          appendAiMessage("Money decision required. I did not change numbers. Use Decisions or manual fields.");
        } else {
          appendAiMessage("No changes applied. Billie can only adjust wording in this mode.");
        }
        onBilliePatchRejected?.({
          patch,
          requestId,
          requestStartedAt,
          responseAt: Date.now()
        });
        completeEditLifecycle("rejected", { patch });
        if (payload?.followUp) {
          appendAiMessage(payload.followUp);
        }
        return;
      }
      if (!patch.hasChanges) {
        appendAiMessage("No new wording changes detected.");
        completeEditLifecycle("no_change");
        return;
      }
      onBilliePatchApplied?.({
        patch,
        previousInvoice: initialInvoice,
        nextInvoice,
        requestId,
        requestStartedAt,
        responseAt: Date.now()
      });
      setFinishedInvoice(nextInvoice);
      appendSummaryMessage(
        buildSummaryText(
          nextInvoice,
          latestState.openDecisions,
          latestState.unparsedLines.length,
          latestState.outputQuality?.blockerCount ?? 0
        ),
        buildReviewPayload(
          nextInvoice,
          latestState.openDecisions,
          latestState.unparsedLines,
          lastTranscriptRef.current,
          latestState.outputQuality ?? null,
          latestState.structuredInvoice ?? null
        )
      );
      if (payload?.followUp) {
        appendAiMessage(payload.followUp);
      }
      const editReadiness = evaluateIntakeReadiness({
        intakePhase: "ready_to_generate",
        followUp: null,
        finishedInvoice: nextInvoice,
        openDecisionCount: latestState.openDecisions.length,
        qualityBlockerCount: latestState.outputQuality?.blockerCount ?? 0,
        pendingLaborRate: latestState.pendingLaborRate
      });
      logReadinessEvent("edit_response", {
        requestId,
        editTargetPhase: editReadiness.targetPhase,
        editLockReason: editReadiness.lockReason,
        editCanGenerate: editReadiness.canGenerate,
        openDecisionCount: latestState.openDecisions.length,
        hasInvoice: Boolean(nextInvoice)
      });
      setIntakePhase(editReadiness.targetPhase);
      completeEditLifecycle("success", { patch });
    };

    const runInvoiceEditRequest = async (instruction) => {
      const state = getState();
      if (!state.finishedInvoice) {
        appendAiMessage("Generate a draft first, then I can apply edits.");
        return;
      }
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const requestStartedAt = Date.now();
      let editLifecycleCompleted = false;
      const completeEditLifecycle = (outcome, extra = {}) => {
        if (editLifecycleCompleted) {
          return;
        }
        editLifecycleCompleted = true;
        onBillieEditLifecycle?.({
          phase: "complete",
          outcome,
          requestId,
          requestStartedAt,
          ...extra
        });
      };
      onBillieEditLifecycle?.({
        phase: "start",
        requestId,
        requestStartedAt,
        instruction
      });
      setIsTyping(true);
      try {
        const response = await apiFetch("/api/invoices/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice: state.finishedInvoice,
            instruction
          })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Edit failed.");
        }
        if (requestId !== requestIdRef.current) {
          completeEditLifecycle("ignored");
          return;
        }
        const latestState = getState();
        applyBilliePayload({
          initialInvoice: state.finishedInvoice,
          payload,
          requestId,
          requestStartedAt,
          latestState,
          completeEditLifecycle
        });
        completeEditLifecycle("success", { patch });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          completeEditLifecycle("ignored");
          return;
        }
        appendAiMessage("Something went wrong while updating the draft. Please try again.");
        completeEditLifecycle("error", { errorMessage: error?.message ?? "Edit failed." });
      } finally {
        if (requestId === requestIdRef.current) {
          setIsTyping(false);
        }
      }
    };

    const runScopedWordingRequest = async ({
      instruction,
      tone,
      routePath,
      buildRequestBody,
      targetType = "full_invoice"
    }) => {
      const state = getState();
      if (!state.finishedInvoice) {
        appendAiMessage("Generate a draft first, then I can apply edits.");
        return;
      }
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const requestStartedAt = Date.now();
      let editLifecycleCompleted = false;
      const completeEditLifecycle = (outcome, extra = {}) => {
        if (editLifecycleCompleted) {
          return;
        }
        editLifecycleCompleted = true;
        onBillieEditLifecycle?.({
          phase: "complete",
          outcome,
          requestId,
          requestStartedAt,
          ...extra
        });
      };
      onBillieEditLifecycle?.({
        phase: "start",
        requestId,
        requestStartedAt,
        instruction,
        targetType
      });
      setIsTyping(true);
      try {
        const response = await apiFetch(routePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRequestBody(state.finishedInvoice))
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Wording refine failed.");
        }
        if (requestId !== requestIdRef.current) {
          completeEditLifecycle("ignored");
          return;
        }
        applyBilliePayload({
          initialInvoice: state.finishedInvoice,
          payload,
          requestId,
          requestStartedAt,
          latestState: getState(),
          completeEditLifecycle
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          completeEditLifecycle("ignored");
          return;
        }
        appendAiMessage("Something went wrong while refining wording. Please try again.");
        completeEditLifecycle("error", { errorMessage: error?.message ?? "Wording refine failed." });
      } finally {
        if (requestId === requestIdRef.current) {
          setIsTyping(false);
        }
      }
    };

    const runInvoiceWordingRequest = async (tone, instruction) =>
      runScopedWordingRequest({
        instruction,
        tone,
        targetType: "full_invoice",
        routePath: "/api/invoices/reword-full",
        buildRequestBody: (invoice) => ({
          invoice,
          tone
        })
      });

    const refineBillieLineItem = async (lineItemId, tone, lineDescription) =>
      runScopedWordingRequest({
        instruction: `Refine ${lineDescription || "selected line"} while keeping numbers locked.`,
        tone,
        targetType: "line_item",
        routePath: "/api/invoices/reword-line",
        buildRequestBody: (invoice) => ({
          invoice,
          lineItemId,
          tone
        })
      });

    const refineBillieNotes = async (tone) =>
      runScopedWordingRequest({
        instruction: "Refine notes only while keeping numbers locked.",
        tone,
        targetType: "notes",
        routePath: "/api/invoices/reword-notes",
        buildRequestBody: (invoice) => ({
          invoice,
          tone
        })
      });

    const submitUserMessage = (text, options = {}) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return false;
      }
      const state = getState();
      const normalized = trimmed.toLowerCase();
      if (isExplicitNoTax(normalized)) {
        setPendingTaxRate(null);
      }
      const hasTaxRateInstruction =
        /\b(tax\s*rate|apply\s+tax|add\s+tax|include\s+tax|charge\s+tax|set\s+tax)\b/i.test(trimmed);
      const detectedTaxRate = hasTaxRateInstruction ? extractTaxRateFromText(trimmed) : null;
      if (detectedTaxRate !== null) {
        setPendingTaxRate(String(detectedTaxRate));
      }
      if (state.isTyping) {
        logReadinessEvent("submit_blocked", {
          reason: "typing",
          messageLength: trimmed.length,
          intakePhase: state.intakePhase,
          lockReason: state.intakeReadiness.lockReason,
          canGenerate: state.intakeReadiness.canGenerate
        });
        return false;
      }
      const userMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        text: trimmed
      };
      const nextMessages = [...state.messages, userMessage];
      setMessages(nextMessages);
      setInputValue("");

      const shouldEditDraft =
        state.intakeReadiness.canGenerate &&
        (state.intakePhase === "ready_to_generate" || state.hasReviewCard);
      if (shouldEditDraft) {
        logReadinessEvent("submit_route", {
          route: options.billieRefineTone ? "reword_full" : "edit_draft",
          messageLength: trimmed.length,
          intakePhase: state.intakePhase,
          lockReason: state.intakeReadiness.lockReason
        });
        if (options.billieRefineTone) {
          runInvoiceWordingRequest(options.billieRefineTone, trimmed);
        } else {
          runInvoiceEditRequest(trimmed);
        }
        return true;
      }

      if (state.intakePhase === "ready_to_summarize") {
        const isNegative = rejectionKeywords.some((keyword) => normalized.includes(keyword));
        const hasNumbers = /\d/.test(normalized);
        const wordCount = normalized.split(/\s+/).length;

        if (isNegative && !hasNumbers && wordCount <= 4) {
          setIntakePhase("collecting");
          appendAiMessage("Got it. Tell me what you want changed.");
          return true;
        }
      }

      if (state.intakePhase === "awaiting_follow_up" && state.followUp?.type === "labor_pricing") {
        logReadinessEvent("submit_route", {
          route: "labor_follow_up",
          messageLength: trimmed.length,
          intakePhase: state.intakePhase,
          lockReason: state.intakeReadiness.lockReason
        });
        const parseResult = parseLaborPricing(trimmed, state.followUp?.laborItems ?? [], {
          pendingRate: state.pendingLaborRate
        });
        if (parseResult?.resolutionType) {
          const resolutionCopy = {
            included_in_flat_fee: "Included in the flat fee. No separate charge.",
            no_charge: "Marked as no charge.",
            already_covered: "Marked as already covered.",
            declined_billing: "Marked as not billed separately."
          }[parseResult.resolutionType];
          setLaborPricingNote(resolutionCopy ?? "");
          setPendingLaborRate(null);
          appendAiMessage(resolutionCopy ?? "Marked as no separate charge.");
          setIntakePhase("collecting");
          const shouldResolveDecisions =
            state.intakeReadiness.lockReason === "open_decisions" && state.openDecisions.length > 0;
          const resolutionText = shouldResolveDecisions
            ? trimmed
            : lastDecisionResolutionRef.current || undefined;
          if (shouldResolveDecisions) {
            lastDecisionResolutionRef.current = trimmed;
          }
          runIntakeRequest(nextMessages, resolutionText);
          return true;
        }
        if (parseResult?.laborPricing) {
          const parsedHourlyRate =
            parseResult.laborPricing.billingType === "hourly"
              ? Number(parseResult.laborPricing.hourlyRate ?? parseResult.laborPricing.rate)
              : null;
          if (Number.isFinite(parsedHourlyRate) && parsedHourlyRate > 0) {
            const nextRate = Math.round(parsedHourlyRate * 100) / 100;
            setSavedLaborRate(nextRate);
            storeLaborRate(nextRate);
          }
          setPendingLaborRate(null);
          setLaborPricingNote("");
          appendAiMessage(
            parseResult.laborPricing.billingType === "flat"
              ? "Flat labor amount captured."
              : "Hourly rate captured."
          );
          runLaborPricingRequest(parseResult.laborPricing, buildTranscript(nextMessages), trimmed);
          return true;
        }
        if (parseResult?.rateOnly) {
          const rate = parseResult.rateOnly;
          setSavedLaborRate(rate);
          storeLaborRate(rate);
          setPendingLaborRate(rate);
          const itemCount = state.followUp?.laborItems?.length ?? 0;
          const rateNote = itemCount
            ? `Saved $${rate}/hr. Add hours for ${itemCount} labor line${itemCount > 1 ? "s" : ""}.`
            : `Saved $${rate}/hr. Add hours for each labor line.`;
          setLaborPricingNote(rateNote);
          appendAiMessage(
            `Got it: $${rate}/hr. Now share hours for each labor line (example: "2 hours, 1 hour").`
          );
          return true;
        }
        if (parseResult?.error) {
          appendAiMessage(parseResult.error);
          return true;
        }
      }

      const shouldResolveDecisions =
        state.intakeReadiness.lockReason === "open_decisions" && state.openDecisions.length > 0;
      const resolutionText = shouldResolveDecisions
        ? trimmed
        : lastDecisionResolutionRef.current || undefined;
      const decisionAction =
        shouldResolveDecisions && typeof getDecisionAction === "function" ? getDecisionAction() : null;
      const useDeterministicDecisionPath = shouldResolveDecisions && Boolean(decisionAction);
      if (shouldResolveDecisions) {
        lastDecisionResolutionRef.current = trimmed;
      }
      logReadinessEvent("submit_route", {
        route: useDeterministicDecisionPath
          ? "resolve_decision_local"
          : shouldResolveDecisions
            ? "resolve_decision"
            : "intake_parse",
        messageLength: trimmed.length,
        intakePhase: state.intakePhase,
        lockReason: state.intakeReadiness.lockReason,
        openDecisionCount: state.openDecisions.length
      });
      if (useDeterministicDecisionPath && typeof runDecisionActionRequest === "function") {
        runDecisionActionRequest(nextMessages, decisionAction, {
          lastUserMessage: resolutionText,
          pendingTaxRate: state.pendingTaxRate,
          clickTimeMs: Number.isFinite(options.clickTimeMs) ? Number(options.clickTimeMs) : null
        });
        return true;
      }
      runIntakeRequest(nextMessages, resolutionText);
      return true;
    };

    return {
      buildBilliePatch,
      runInvoiceEditRequest,
      refineBillieLineItem,
      refineBillieNotes,
      submitUserMessage
    };
  };

  window.InvoiceIntakeActions = {
    parseLaborPricing,
    buildBilliePatch,
    createIntakeActionHandlers
  };
})();
