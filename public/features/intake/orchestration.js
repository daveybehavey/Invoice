(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);
  const isDecisionTimingDebugEnabled = () => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("decisionTimingDebug") === "1") {
        return true;
      }
      return window.localStorage.getItem("invoiceDecisionTimingDebug") === "true";
    } catch (_error) {
      return false;
    }
  };

  const createIntakeOrchestrator = ({
    slowResponseTimeoutRef,
    requestIdRef,
    auditRequestIdRef,
    timeoutMessageIdRef,
    abortControllerRef,
    lastMessagesRef,
    lastTranscriptRef,
    lastUserMessageRef,
    lastIntakeModeRef,
    openDecisionSignatureRef,
    lastSummaryMetaRef,
    intakePhaseRef,
    summaryLockRef,
    openDecisionsRef,
    assumptionsRef,
    unparsedLinesRef,
    decisionActionRef,
    pendingDecisionUndoRef,
    lastDecisionResolutionRef,
    setIsTyping,
    setAuditStatus,
    setAuditSummary,
    setAuditSummaryAt,
    setOpenDecisions,
    setAssumptions,
    setUnparsedLines,
    setOutputQuality,
    setPendingLaborRate,
    setPendingTaxRate,
    setLaborPricingNote,
    setFollowUp,
    setStructuredInvoice,
    setFinishedInvoice,
    setIntakePhase,
    appendAiMessage,
    appendSummaryMessage,
    showDecisionToast,
    startDecisionUndoWindow,
    clearDecisionUndoState,
    evaluateResponseReadiness,
    logReadinessEvent,
    shouldUseFastMode,
    shouldRunDeepAudit,
    getSlowResponseDelay,
    clearSlowResponseTimer,
    dismissTimeoutMessage,
    appendTimeoutMessage,
    shouldIgnorePostSummaryResponse,
    abortOngoingRequest,
    onDecisionRequestComplete,
    mergeDecisionLists,
    mergeUniqueList,
    buildDecisionAckMessage,
    applyDecisionActionToInvoice,
    buildDecisionFollowUp,
    buildSummaryText,
    buildReviewPayload,
    buildTranscript,
    structuredInvoice
  }) => {
    const runDeepAudit = async ({ structuredInvoice, sourceText, decisionSignature, summaryRequestId }) => {
      if (!structuredInvoice || !sourceText) {
        return;
      }
      setAuditStatus("running");
      setAuditSummary("");
      setAuditSummaryAt(null);
      auditRequestIdRef.current += 1;
      const auditRequestId = auditRequestIdRef.current;

      try {
        const response = await apiFetch("/api/invoices/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredInvoice,
            sourceText,
            lastUserMessage: lastDecisionResolutionRef.current || undefined
          })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Audit failed.");
        }
        if (auditRequestId !== auditRequestIdRef.current) {
          return;
        }
        if (
          summaryRequestId !== undefined &&
          summaryRequestId !== null &&
          summaryRequestId !== lastSummaryMetaRef.current?.requestId
        ) {
          return;
        }
        if (summaryLockRef.current || intakePhaseRef.current !== "ready_to_summarize") {
          return;
        }
        if (decisionSignature && decisionSignature !== openDecisionSignatureRef.current) {
          return;
        }

        const currentDecisions = openDecisionsRef.current ?? [];
        const currentAssumptions = assumptionsRef.current ?? [];
        const currentUnparsed = unparsedLinesRef.current ?? [];
        const incomingDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
        const incomingAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
        const incomingUnparsed = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];

        const mergedDecisions = mergeDecisionLists(currentDecisions, incomingDecisions);
        const mergedAssumptions = mergeUniqueList(currentAssumptions, incomingAssumptions);
        const mergedUnparsed = mergeUniqueList(currentUnparsed, incomingUnparsed);

        const addedDecisions = mergedDecisions.length - currentDecisions.length;
        const addedAssumptions = mergedAssumptions.length - currentAssumptions.length;
        const addedUnparsed = mergedUnparsed.length - currentUnparsed.length;

        if (addedDecisions || addedAssumptions || addedUnparsed) {
          setOpenDecisions(mergedDecisions);
          setAssumptions(mergedAssumptions);
          setUnparsedLines(mergedUnparsed);
          openDecisionSignatureRef.current = mergedDecisions
            .map((decision) => decision.prompt)
            .sort()
            .join("|");
          const updates = [];
          if (addedDecisions) {
            updates.push(`${addedDecisions} new decision${addedDecisions > 1 ? "s" : ""}`);
          }
          if (addedUnparsed) {
            updates.push(`${addedUnparsed} new note${addedUnparsed > 1 ? "s" : ""} not captured`);
          }
          if (addedAssumptions) {
            updates.push(`${addedAssumptions} new assumption${addedAssumptions > 1 ? "s" : ""}`);
          }
          appendAiMessage(`Deep check complete — ${updates.join(", ")}.`);
          setAuditSummary(`Deep check added ${updates.join(", ")}.`);
        } else {
          setAuditSummary("Deep check complete — no changes found.");
        }
        setAuditSummaryAt(Date.now());

        setAuditStatus("completed");
      } catch (error) {
        setAuditStatus("failed");
      }
    };

    const maybeRunDeepAudit = ({
      auditStatus: nextAuditStatus,
      transcript,
      structuredInvoice,
      decisionSignature,
      summaryRequestId
    }) => {
      if (!shouldRunDeepAudit(nextAuditStatus, transcript)) {
        return;
      }
      runDeepAudit({
        structuredInvoice,
        sourceText: transcript,
        decisionSignature,
        summaryRequestId
      });
    };

    const runIntakeRequest = async (nextMessages, lastUserMessage, options = {}) => {
      const transcript = buildTranscript(nextMessages);
      if (!transcript) {
        return;
      }
      const preferredMode = options.mode ?? (shouldUseFastMode(transcript) ? "fast" : "full");
      const requestMode = preferredMode === "fast" ? "fast" : "full";
      lastMessagesRef.current = nextMessages;
      lastTranscriptRef.current = transcript;
      lastUserMessageRef.current = lastUserMessage ?? "";
      lastIntakeModeRef.current = requestMode;
      if (timeoutMessageIdRef.current) {
        dismissTimeoutMessage(timeoutMessageIdRef.current);
      }
      abortOngoingRequest();
      auditRequestIdRef.current += 1;
      setAuditStatus(null);
      setAuditSummary("");
      setAuditSummaryAt(null);
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const requestStartedAt = Date.now();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsTyping(true);
      clearSlowResponseTimer();
      const slowDelay = getSlowResponseDelay(transcript);
      if (slowDelay) {
        slowResponseTimeoutRef.current = window.setTimeout(() => {
          if (requestId === requestIdRef.current && !summaryLockRef.current) {
            appendTimeoutMessage(requestMode, "intake");
          }
        }, slowDelay);
      }
      try {
        const response = await apiFetch("/api/invoices/from-input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messyInput: transcript, lastUserMessage, mode: requestMode }),
          signal: controller.signal
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Intake failed.");
        }
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (shouldIgnorePostSummaryResponse(requestStartedAt, requestId, "intake")) {
          return;
        }
        if (timeoutMessageIdRef.current) {
          dismissTimeoutMessage(timeoutMessageIdRef.current);
        }
        if (summaryLockRef.current) {
          return;
        }
        const nextOpenDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
        const nextAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
        const nextUnparsedLines = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];
        const nextOutputQuality = payload?.qualityGate ?? null;
        const nextAuditStatus = payload?.auditStatus ?? null;
        setAuditStatus(nextAuditStatus);
        setOpenDecisions(nextOpenDecisions);
        setAssumptions(nextAssumptions);
        setUnparsedLines(nextUnparsedLines);
        setOutputQuality(nextOutputQuality);
        setPendingLaborRate(null);
        const previousDecisions = openDecisionsRef.current ?? [];
        const resolvedCount = Math.max(0, previousDecisions.length - nextOpenDecisions.length);
        const decisionAction = decisionActionRef.current;
        decisionActionRef.current = null;
        const decisionUndoSnapshot = pendingDecisionUndoRef.current;
        pendingDecisionUndoRef.current = null;
        const decisionAck = buildDecisionAckMessage(
          decisionAction,
          resolvedCount,
          nextOpenDecisions.length
        );
        const canUndoDecision = Boolean(decisionAction && resolvedCount > 0 && decisionUndoSnapshot);
        if (canUndoDecision) {
          startDecisionUndoWindow(decisionUndoSnapshot, decisionAck);
        } else if (decisionAction) {
          clearDecisionUndoState();
        }
        const adjustedInvoice = applyDecisionActionToInvoice(payload.invoice ?? null, decisionAction);
        const nextFollowUp = payload?.needsFollowUp ? payload.followUp ?? null : null;
        const responseReadiness = evaluateResponseReadiness({
          followUp: nextFollowUp,
          finishedInvoice: payload?.needsFollowUp ? null : adjustedInvoice,
          openDecisionCount: nextOpenDecisions.length,
          qualityBlockerCount: nextOutputQuality?.blockerCount ?? 0,
          pendingLaborRate: null
        });
        logReadinessEvent("intake_response", {
          requestId,
          payloadNeedsFollowUp: Boolean(payload?.needsFollowUp),
          responseTargetPhase: responseReadiness.targetPhase,
          responseLockReason: responseReadiness.lockReason,
          responseCanGenerate: responseReadiness.canGenerate,
          openDecisionCount: nextOpenDecisions.length,
          qualityBlockerCount: nextOutputQuality?.blockerCount ?? 0,
          hasInvoice: Boolean(adjustedInvoice)
        });

        if (payload?.needsFollowUp) {
          setOutputQuality(null);
          setLaborPricingNote("");
          setPendingLaborRate(null);
          setFollowUp(payload.followUp ?? null);
          setStructuredInvoice(payload.structuredInvoice ?? null);
          setFinishedInvoice(null);
          setIntakePhase(responseReadiness.targetPhase);
          const followUpText = payload?.followUp?.message
            ? `${payload.followUp.message} Reply with either "flat $300" or "$95/hr" plus hours per line. You can also tap a suggestion below.`
            : "I still need labor pricing. Share either a flat amount or an hourly rate plus hours.";
          if (decisionAck) {
            appendAiMessage(decisionAck);
            showDecisionToast(decisionAck, { durationMs: canUndoDecision ? 9000 : 3500 });
          }
          appendAiMessage(followUpText);
          return;
        }
        setFollowUp(null);
        setStructuredInvoice(payload.structuredInvoice ?? null);
        setFinishedInvoice(adjustedInvoice);
        setIntakePhase(responseReadiness.targetPhase);
        const decisionSignature = nextOpenDecisions.map((decision) => decision.prompt).sort().join("|");
        if (nextOpenDecisions.length > 0) {
          const isRepeatDecision =
            decisionSignature && decisionSignature === openDecisionSignatureRef.current;
          const followUpMessage = isRepeatDecision
            ? buildDecisionFollowUp(nextOpenDecisions)
            : buildSummaryText(
                adjustedInvoice ?? payload.invoice,
                nextOpenDecisions,
                nextUnparsedLines.length,
                nextOutputQuality?.blockerCount ?? 0
              );
          openDecisionSignatureRef.current = decisionSignature;
          if (decisionAck) {
            appendAiMessage(decisionAck);
            showDecisionToast(decisionAck, { durationMs: canUndoDecision ? 9000 : 3500 });
          }
          isRepeatDecision
            ? appendAiMessage(followUpMessage)
            : appendSummaryMessage(
                followUpMessage,
                buildReviewPayload(
                  adjustedInvoice ?? payload.invoice,
                  nextOpenDecisions,
                  nextUnparsedLines,
                  transcript,
                  nextOutputQuality
                )
              );
          maybeRunDeepAudit({
            auditStatus: nextAuditStatus,
            transcript,
            structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
            decisionSignature,
            summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null
          });
        } else {
          openDecisionSignatureRef.current = "";
          if (decisionAck) {
            appendAiMessage(decisionAck);
            showDecisionToast(decisionAck, { durationMs: canUndoDecision ? 9000 : 3500 });
          }
          appendSummaryMessage(
            buildSummaryText(
              adjustedInvoice ?? payload.invoice,
              [],
              nextUnparsedLines.length,
              nextOutputQuality?.blockerCount ?? 0
            ),
            buildReviewPayload(
              adjustedInvoice ?? payload.invoice,
              [],
              nextUnparsedLines,
              transcript,
              nextOutputQuality
            )
          );
          maybeRunDeepAudit({
            auditStatus: nextAuditStatus,
            transcript,
            structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
            decisionSignature: "",
            summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null
          });
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        decisionActionRef.current = null;
        pendingDecisionUndoRef.current = null;
        if (timeoutMessageIdRef.current) {
          dismissTimeoutMessage(timeoutMessageIdRef.current);
        }
        appendAiMessage("Something went wrong. Please try again.");
      } finally {
        if (requestId === requestIdRef.current) {
          setIsTyping(false);
        }
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        clearSlowResponseTimer();
      }
    };

    const runDecisionActionRequest = async (nextMessages, decisionAction, options = {}) => {
      let decisionRequestCompleted = false;
      const completeDecisionRequest = (status, extra = {}) => {
        if (decisionRequestCompleted) {
          return;
        }
        decisionRequestCompleted = true;
        if (typeof onDecisionRequestComplete === "function") {
          onDecisionRequestComplete({ status, ...extra });
        }
      };
      const timingDebug = isDecisionTimingDebugEnabled();
      const clickTimeMs = Number.isFinite(options.clickTimeMs)
        ? Number(options.clickTimeMs)
        : null;
      if (!structuredInvoice) {
        appendAiMessage("I need to re-check the details first. Please resend your notes.");
        setIntakePhase("collecting");
        completeDecisionRequest("error", { reason: "missing_structured_invoice" });
        return;
      }
      const transcript = buildTranscript(nextMessages);
      if (transcript) {
        lastTranscriptRef.current = transcript;
      }
      const pendingTaxRate = options.pendingTaxRate ?? null;
      const currentOpenDecisions = openDecisionsRef.current ?? [];
      const currentAssumptions = assumptionsRef.current ?? [];
      const currentUnparsedLines = unparsedLinesRef.current ?? [];
      const resolvedAction = decisionAction ?? decisionActionRef.current;
      if (!resolvedAction) {
        completeDecisionRequest("ignored", { reason: "missing_action" });
        runIntakeRequest(nextMessages, options.lastUserMessage);
        return;
      }

      lastMessagesRef.current = nextMessages;
      if (options.lastUserMessage) {
        lastUserMessageRef.current = options.lastUserMessage;
      }
      if (timeoutMessageIdRef.current) {
        dismissTimeoutMessage(timeoutMessageIdRef.current);
      }
      abortOngoingRequest();
      auditRequestIdRef.current += 1;
      setAuditStatus("skipped");
      setAuditSummary("");
      setAuditSummaryAt(null);
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const requestStartedAt = Date.now();
      const requestStartMs = window.performance.now();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsTyping(true);
      clearSlowResponseTimer();

      try {
        const response = await apiFetch("/api/invoices/apply-decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredInvoice,
            openDecisions: currentOpenDecisions,
            assumptions: currentAssumptions,
            unparsedLines: currentUnparsedLines,
            decisionAction: resolvedAction,
            pendingTaxRate,
            debugTiming: timingDebug
          }),
          signal: controller.signal
        });
        const payload = await response.json();
        const responseReceivedMs = window.performance.now();
        if (!response.ok) {
          throw new Error(payload?.error || "Decision update failed.");
        }
        if (requestId !== requestIdRef.current) {
          completeDecisionRequest("ignored", { reason: "stale_response" });
          return;
        }
        if (shouldIgnorePostSummaryResponse(requestStartedAt, requestId, "decision")) {
          completeDecisionRequest("ignored", { reason: "summary_guard" });
          return;
        }
        if (summaryLockRef.current) {
          completeDecisionRequest("ignored", { reason: "summary_lock" });
          return;
        }
        const nextOpenDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
        const nextAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
        const nextUnparsedLines = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];
        const nextOutputQuality = payload?.qualityGate ?? null;
        const resolvedCount = Math.max(0, currentOpenDecisions.length - nextOpenDecisions.length);
        const decisionUndoSnapshot = pendingDecisionUndoRef.current;
        pendingDecisionUndoRef.current = null;
        const decisionAck = buildDecisionAckMessage(
          resolvedAction,
          resolvedCount,
          nextOpenDecisions.length
        );
        const canUndoDecision = Boolean(resolvedAction && resolvedCount > 0 && decisionUndoSnapshot);
        decisionActionRef.current = null;
        if (canUndoDecision) {
          startDecisionUndoWindow(decisionUndoSnapshot, decisionAck);
        } else if (resolvedAction) {
          clearDecisionUndoState();
        }

        const responseReadiness = evaluateResponseReadiness({
          followUp: null,
          finishedInvoice: payload?.invoice ?? null,
          openDecisionCount: nextOpenDecisions.length,
          qualityBlockerCount: nextOutputQuality?.blockerCount ?? 0,
          pendingLaborRate: null
        });
        logReadinessEvent("decision_response", {
          requestId,
          responseTargetPhase: responseReadiness.targetPhase,
          responseLockReason: responseReadiness.lockReason,
          responseCanGenerate: responseReadiness.canGenerate,
          openDecisionCount: nextOpenDecisions.length,
          qualityBlockerCount: nextOutputQuality?.blockerCount ?? 0,
          hasInvoice: Boolean(payload?.invoice)
        });

        setOpenDecisions(nextOpenDecisions);
        setAssumptions(nextAssumptions);
        setUnparsedLines(nextUnparsedLines);
        setOutputQuality(nextOutputQuality);
        setPendingLaborRate(null);
        setFollowUp(null);
        setStructuredInvoice(payload?.structuredInvoice ?? structuredInvoice);
        setFinishedInvoice(payload?.invoice ?? null);
        setIntakePhase(responseReadiness.targetPhase);
        setPendingTaxRate(
          typeof payload?.pendingTaxRate === "string" && payload.pendingTaxRate.trim().length > 0
            ? payload.pendingTaxRate.trim()
            : null
        );
        const stateDispatchedMs = window.performance.now();

        const decisionSignature = nextOpenDecisions.map((decision) => decision.prompt).sort().join("|");
        if (nextOpenDecisions.length > 0) {
          openDecisionSignatureRef.current = decisionSignature;
          if (decisionAck) {
            appendAiMessage(decisionAck);
            showDecisionToast(decisionAck, { durationMs: canUndoDecision ? 9000 : 3500 });
          }
          appendSummaryMessage(
            buildSummaryText(
              payload?.invoice,
              nextOpenDecisions,
              nextUnparsedLines.length,
              nextOutputQuality?.blockerCount ?? 0
            ),
            buildReviewPayload(
              payload?.invoice,
              nextOpenDecisions,
              nextUnparsedLines,
              transcript || lastTranscriptRef.current,
              nextOutputQuality
            )
          );
        } else {
          openDecisionSignatureRef.current = "";
          if (decisionAck) {
            appendAiMessage(decisionAck);
            showDecisionToast(decisionAck, { durationMs: canUndoDecision ? 9000 : 3500 });
          }
          appendSummaryMessage(
            buildSummaryText(
              payload?.invoice,
              [],
              nextUnparsedLines.length,
              nextOutputQuality?.blockerCount ?? 0
            ),
            buildReviewPayload(
              payload?.invoice,
              [],
              nextUnparsedLines,
              transcript || lastTranscriptRef.current,
              nextOutputQuality
            )
          );
        }

        if (timingDebug) {
          await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
          const stateAppliedMs = window.performance.now();
          const serverApplyMs =
            typeof payload?._timing?.serverApplyMs === "number" ? payload._timing.serverApplyMs : null;
          const serverTotalMs =
            typeof payload?._timing?.serverTotalMs === "number" ? payload._timing.serverTotalMs : null;
          const requestRoundTripMs = Number((responseReceivedMs - requestStartMs).toFixed(3));
          const networkRttMs =
            typeof serverTotalMs === "number"
              ? Number(Math.max(0, requestRoundTripMs - serverTotalMs).toFixed(3))
              : null;
          const stateCommitMs = Number((stateAppliedMs - responseReceivedMs).toFixed(3));
          const clickToRequestMs =
            clickTimeMs === null ? null : Number(Math.max(0, requestStartMs - clickTimeMs).toFixed(3));
          const decisionTiming = {
            requestId,
            clickToRequestMs,
            requestRoundTripMs,
            serverApplyMs,
            serverTotalMs,
            networkRttMs,
            responseToStateDispatchMs: Number((stateDispatchedMs - responseReceivedMs).toFixed(3)),
            stateCommitMs
          };
          window.__invoiceDecisionTiming = decisionTiming;
          window.dispatchEvent(
            new CustomEvent("invoice:decision-timing", {
              detail: decisionTiming
            })
          );
          logReadinessEvent("decision_timing", decisionTiming);
        }

        completeDecisionRequest("success", {
          remainingDecisions: nextOpenDecisions.length
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          completeDecisionRequest("ignored", { reason: "stale_error" });
          return;
        }
        decisionActionRef.current = null;
        pendingDecisionUndoRef.current = null;
        appendAiMessage("I could not apply that decision. Please try again.");
        completeDecisionRequest("error", {
          reason: "request_failed",
          message: error?.message ?? "Decision update failed."
        });
      } finally {
        if (requestId === requestIdRef.current) {
          setIsTyping(false);
        }
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        clearSlowResponseTimer();
      }
    };

    const runLaborPricingRequest = async (laborPricing, transcript, lastUserMessage) => {
      if (!structuredInvoice) {
        appendAiMessage("I need to re-check the details first. Please resend your notes.");
        setIntakePhase("collecting");
        return;
      }
      lastTranscriptRef.current = transcript ?? lastTranscriptRef.current;
      if (timeoutMessageIdRef.current) {
        dismissTimeoutMessage(timeoutMessageIdRef.current);
      }
      abortOngoingRequest();
      auditRequestIdRef.current += 1;
      setAuditStatus(null);
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const requestStartedAt = Date.now();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsTyping(true);
      clearSlowResponseTimer();
      const slowDelay = getSlowResponseDelay(transcript ?? lastTranscriptRef.current);
      if (slowDelay) {
        slowResponseTimeoutRef.current = window.setTimeout(() => {
          if (requestId === requestIdRef.current && !summaryLockRef.current) {
            appendTimeoutMessage(lastIntakeModeRef.current, "labor");
          }
        }, slowDelay);
      }
      try {
        const response = await apiFetch("/api/invoices/from-input/labor-pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredInvoice,
            laborPricing,
            sourceText: transcript,
            lastUserMessage: lastUserMessage ?? undefined,
            mode: lastIntakeModeRef.current
          }),
          signal: controller.signal
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Labor pricing failed.");
        }
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (shouldIgnorePostSummaryResponse(requestStartedAt, requestId, "labor")) {
          return;
        }
        if (timeoutMessageIdRef.current) {
          dismissTimeoutMessage(timeoutMessageIdRef.current);
        }
        if (summaryLockRef.current) {
          return;
        }
        const nextOpenDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
        const nextAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
        const nextUnparsedLines = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];
        const nextOutputQuality = payload?.qualityGate ?? null;
        const nextAuditStatus = payload?.auditStatus ?? null;
        setAuditStatus(nextAuditStatus);
        setOpenDecisions(nextOpenDecisions);
        setAssumptions(nextAssumptions);
        setUnparsedLines(nextUnparsedLines);
        setOutputQuality(nextOutputQuality);
        setPendingLaborRate(null);
        const previousDecisions = openDecisionsRef.current ?? [];
        const resolvedCount = Math.max(0, previousDecisions.length - nextOpenDecisions.length);
        const decisionAction = decisionActionRef.current;
        decisionActionRef.current = null;
        const decisionUndoSnapshot = pendingDecisionUndoRef.current;
        pendingDecisionUndoRef.current = null;
        const decisionAck = buildDecisionAckMessage(
          decisionAction,
          resolvedCount,
          nextOpenDecisions.length
        );
        const canUndoDecision = Boolean(decisionAction && resolvedCount > 0 && decisionUndoSnapshot);
        if (canUndoDecision) {
          startDecisionUndoWindow(decisionUndoSnapshot, decisionAck);
        } else if (decisionAction) {
          clearDecisionUndoState();
        }
        const responseReadiness = evaluateResponseReadiness({
          followUp: null,
          finishedInvoice: payload.invoice ?? null,
          openDecisionCount: nextOpenDecisions.length,
          qualityBlockerCount: nextOutputQuality?.blockerCount ?? 0,
          pendingLaborRate: null
        });
        logReadinessEvent("labor_response", {
          requestId,
          responseTargetPhase: responseReadiness.targetPhase,
          responseLockReason: responseReadiness.lockReason,
          responseCanGenerate: responseReadiness.canGenerate,
          openDecisionCount: nextOpenDecisions.length,
          qualityBlockerCount: nextOutputQuality?.blockerCount ?? 0,
          hasInvoice: Boolean(payload.invoice)
        });
        setFollowUp(null);
        setStructuredInvoice(payload.structuredInvoice ?? structuredInvoice);
        setFinishedInvoice(payload.invoice ?? null);
        setIntakePhase(responseReadiness.targetPhase);
        const decisionSignature = nextOpenDecisions.map((decision) => decision.prompt).sort().join("|");
        if (nextOpenDecisions.length > 0) {
          const isRepeatDecision =
            decisionSignature && decisionSignature === openDecisionSignatureRef.current;
          const followUpMessage = isRepeatDecision
            ? buildDecisionFollowUp(nextOpenDecisions)
            : buildSummaryText(
                payload.invoice,
                nextOpenDecisions,
                nextUnparsedLines.length,
                nextOutputQuality?.blockerCount ?? 0
              );
          openDecisionSignatureRef.current = decisionSignature;
          if (decisionAck) {
            appendAiMessage(decisionAck);
            showDecisionToast(decisionAck, { durationMs: canUndoDecision ? 9000 : 3500 });
          }
          isRepeatDecision
            ? appendAiMessage(followUpMessage)
            : appendSummaryMessage(
                followUpMessage,
                buildReviewPayload(
                  payload.invoice,
                  nextOpenDecisions,
                  nextUnparsedLines,
                  transcript ?? lastTranscriptRef.current,
                  nextOutputQuality
                )
              );
          maybeRunDeepAudit({
            auditStatus: nextAuditStatus,
            transcript: transcript ?? lastTranscriptRef.current,
            structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
            decisionSignature,
            summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null
          });
        } else {
          openDecisionSignatureRef.current = "";
          if (decisionAck) {
            appendAiMessage(decisionAck);
            showDecisionToast(decisionAck, { durationMs: canUndoDecision ? 9000 : 3500 });
          }
          appendSummaryMessage(
            buildSummaryText(
              payload.invoice,
              [],
              nextUnparsedLines.length,
              nextOutputQuality?.blockerCount ?? 0
            ),
            buildReviewPayload(
              payload.invoice,
              [],
              nextUnparsedLines,
              transcript ?? lastTranscriptRef.current,
              nextOutputQuality
            )
          );
          maybeRunDeepAudit({
            auditStatus: nextAuditStatus,
            transcript: transcript ?? lastTranscriptRef.current,
            structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
            decisionSignature: "",
            summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null
          });
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        decisionActionRef.current = null;
        pendingDecisionUndoRef.current = null;
        if (timeoutMessageIdRef.current) {
          dismissTimeoutMessage(timeoutMessageIdRef.current);
        }
        appendAiMessage("I still need labor pricing details to finish this invoice.");
      } finally {
        if (requestId === requestIdRef.current) {
          setIsTyping(false);
        }
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        clearSlowResponseTimer();
      }
    };

    return {
      runDeepAudit,
      maybeRunDeepAudit,
      runIntakeRequest,
      runDecisionActionRequest,
      runLaborPricingRequest
    };
  };

  window.InvoiceIntakeOrchestration = {
    createIntakeOrchestrator
  };
})();
