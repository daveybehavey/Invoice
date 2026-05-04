(() => {
  const requestIdentity = window.InvoiceRequestIdentity;

  const ONBOARDING_VERSION = 1;
  const STORAGE_KEY_FALLBACK = "firstInvoiceOnboarding";
  const UPDATE_EVENT_NAME = "invoice:onboarding-updated";
  const STEP_DEFINITIONS = [
    {
      id: "capture_notes",
      label: "Add your first notes",
      helper: "Use sample notes or paste a real job.",
      ctaLabel: "Start with Billie",
      routeHint: "ai-intake"
    },
    {
      id: "review_draft",
      label: "Review the first draft",
      helper: "Confirm what Billie captured before you generate.",
      ctaLabel: "Review draft",
      routeHint: "ai-intake"
    },
    {
      id: "open_editor",
      label: "Open the draft in editor",
      helper: "Move into manual editing once the draft looks right.",
      ctaLabel: "Open editor",
      routeHint: "manual"
    },
    {
      id: "save_invoice",
      label: "Save your first invoice",
      helper: "Keep the draft so you can reopen it later.",
      ctaLabel: "Save first draft",
      routeHint: "manual"
    },
    {
      id: "export_pdf",
      label: "Export the PDF",
      helper: "Finish with a client-ready file you can send.",
      ctaLabel: "Export PDF",
      routeHint: "manual"
    }
  ];

  const OPTIONAL_DEFINITIONS = [
    {
      id: "sign_in",
      label: "Sign in for saved account access",
      helper: "Optional, but helpful if you want saved work tied to your email."
    }
  ];

  const getStorageKey = () =>
    requestIdentity?.getScopedStorageKey?.(STORAGE_KEY_FALLBACK) ?? STORAGE_KEY_FALLBACK;

  const createEmptyState = () => ({
    version: ONBOARDING_VERSION,
    completedSteps: {},
    startedAt: new Date().toISOString(),
    completionAcknowledgedAt: ""
  });

  const normalizeState = (value) => {
    if (!value || typeof value !== "object") {
      return createEmptyState();
    }
    const completedSteps =
      value.completedSteps && typeof value.completedSteps === "object" ? value.completedSteps : {};
    return {
      version: ONBOARDING_VERSION,
      completedSteps,
      startedAt:
        typeof value.startedAt === "string" && value.startedAt.trim()
          ? value.startedAt
          : new Date().toISOString(),
      completionAcknowledgedAt:
        typeof value.completionAcknowledgedAt === "string" ? value.completionAcknowledgedAt : ""
    };
  };

  const readState = () => {
    try {
      const raw = window.localStorage.getItem(getStorageKey());
      if (!raw) {
        return createEmptyState();
      }
      return normalizeState(JSON.parse(raw));
    } catch (_error) {
      return createEmptyState();
    }
  };

  const writeState = (value) => {
    const nextState = normalizeState(value);
    try {
      window.localStorage.setItem(getStorageKey(), JSON.stringify(nextState));
    } catch (_error) {
      // Best-effort only.
    }
    try {
      window.dispatchEvent(
        new CustomEvent(UPDATE_EVENT_NAME, {
          detail: {
            key: getStorageKey(),
            state: nextState
          }
        })
      );
    } catch (_error) {
      // Best-effort only.
    }
    return nextState;
  };

  const markStep = (stepId) => {
    const normalizedStepId = typeof stepId === "string" ? stepId.trim() : "";
    if (!normalizedStepId) {
      return readState();
    }
    const current = readState();
    if (current.completedSteps[normalizedStepId]) {
      return current;
    }
    return writeState({
      ...current,
      completedSteps: {
        ...current.completedSteps,
        [normalizedStepId]: new Date().toISOString()
      }
    });
  };

  const reset = () => writeState(createEmptyState());

  const acknowledgeCompletion = () => {
    const current = readState();
    if (current.completionAcknowledgedAt) {
      return current;
    }
    return writeState({
      ...current,
      completionAcknowledgedAt: new Date().toISOString()
    });
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }
    const handleCustomUpdate = (event) => {
      if (event?.detail?.key && event.detail.key !== getStorageKey()) {
        return;
      }
      listener(readState());
    };
    const handleStorage = (event) => {
      if (event?.key && event.key !== getStorageKey()) {
        return;
      }
      listener(readState());
    };
    window.addEventListener(UPDATE_EVENT_NAME, handleCustomUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(UPDATE_EVENT_NAME, handleCustomUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  };

  const buildStatus = ({ authSession } = {}) => {
    const state = readState();
    const steps = STEP_DEFINITIONS.map((definition) => ({
      ...definition,
      completedAt: state.completedSteps[definition.id] ?? "",
      complete: Boolean(state.completedSteps[definition.id])
    }));
    const completedCount = steps.filter((step) => step.complete).length;
    const totalSteps = steps.length;
    const nextStep = steps.find((step) => !step.complete) ?? null;
    const complete = completedCount === totalSteps;
    const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
    const completedAt = complete
      ? steps
          .map((step) => step.completedAt)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] ?? ""
      : "";
    const completionVisible = complete && !state.completionAcknowledgedAt;
    const optionalSteps = OPTIONAL_DEFINITIONS.map((definition) => ({
      ...definition,
      complete: Boolean(authSession?.userId)
    }));
    return {
      steps,
      optionalSteps,
      completedCount,
      totalSteps,
      progressPercent,
      nextStep,
      complete,
      completedAt,
      completionVisible,
      completionAcknowledgedAt: state.completionAcknowledgedAt,
      visible: !complete,
      startedAt: state.startedAt
    };
  };

  window.InvoiceOnboardingState = {
    STEP_DEFINITIONS,
    OPTIONAL_DEFINITIONS,
      readState,
      writeState,
      markStep,
      reset,
      acknowledgeCompletion,
      subscribe,
      buildStatus
  };
})();
