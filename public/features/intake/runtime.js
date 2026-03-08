(() => {
  const FAST_MODE_THRESHOLD = 1800;
  const SLOW_RESPONSE_MS_LONG = 30000;
  const SLOW_RESPONSE_MS_MEDIUM = 45000;
  const SLOW_RESPONSE_MIN_LENGTH = 800;

  const getSlowResponseDelay = (transcript) => {
    const length = transcript?.length ?? 0;
    if (length < SLOW_RESPONSE_MIN_LENGTH) {
      return null;
    }
    if (length >= FAST_MODE_THRESHOLD) {
      return SLOW_RESPONSE_MS_LONG;
    }
    return SLOW_RESPONSE_MS_MEDIUM;
  };

  const shouldUseFastMode = (transcript) => (transcript?.length ?? 0) >= FAST_MODE_THRESHOLD;

  const shouldRunDeepAudit = (status, transcript) => {
    const length = transcript?.length ?? 0;
    if (status === "timed_out") {
      return true;
    }
    if (status === "skipped") {
      return length >= FAST_MODE_THRESHOLD;
    }
    return false;
  };

  const isSummaryPhase = (phase) =>
    phase === "ready_to_summarize" || phase === "ready_to_generate";

  const createIntakeRuntime = ({
    slowResponseTimeoutRef,
    timeoutMessageIdRef,
    abortControllerRef,
    requestIdRef,
    lastSummaryMetaRef,
    intakePhaseRef,
    setMessages,
    setIsTyping
  }) => {
    const clearSlowResponseTimer = () => {
      if (slowResponseTimeoutRef.current) {
        window.clearTimeout(slowResponseTimeoutRef.current);
        slowResponseTimeoutRef.current = null;
      }
    };

    const dismissTimeoutMessage = (messageId) => {
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      timeoutMessageIdRef.current = null;
    };

    const appendTimeoutMessage = (mode, context = "intake") => {
      if (timeoutMessageIdRef.current) {
        return;
      }
      const id = `msg-timeout-${Date.now()}`;
      timeoutMessageIdRef.current = id;
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: "ai",
          kind: "timeout",
          payload: { mode, context }
        }
      ]);
    };

    const shouldIgnorePostSummaryResponse = (requestStartedAt, requestId, channel) => {
      const summaryAt = lastSummaryMetaRef.current?.at;
      const phase = intakePhaseRef.current;
      if (!summaryAt || !isSummaryPhase(phase)) {
        return false;
      }
      return requestStartedAt < summaryAt;
    };

    const abortOngoingRequest = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      requestIdRef.current += 1;
      clearSlowResponseTimer();
      setIsTyping(false);
    };

    return {
      clearSlowResponseTimer,
      dismissTimeoutMessage,
      appendTimeoutMessage,
      shouldIgnorePostSummaryResponse,
      abortOngoingRequest
    };
  };

  window.InvoiceIntakeRuntime = {
    FAST_MODE_THRESHOLD,
    getSlowResponseDelay,
    shouldUseFastMode,
    shouldRunDeepAudit,
    createIntakeRuntime
  };
})();
