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
      helper: "Optional, but helpful when you want saved work and billing tied to your account."
    }
  ];
  const SETUP_DEFINITIONS = [
    {
      id: "sign_in",
      label: "Link your account",
      helper: "Use email or Google sign-in so saved work, billing, and repeat setup stay with your account.",
      ctaLabel: "Open sign-in",
      routeHint: "sign-in"
    },
    {
      id: "setup_branding",
      label: "Save your branding defaults",
      helper: "Add your business details, logo, and invoice accent once.",
      ctaLabel: "Open branding",
      routeHint: "settings/business"
    },
    {
      id: "setup_memory",
      label: "Review client memory",
      helper: "Confirm the repeat-client details Billie is remembering.",
      ctaLabel: "Open memory",
      routeHint: "settings/memory"
    },
    {
      id: "setup_services",
      label: "Review service catalog",
      helper: "Build the saved services you want to reuse on repeat jobs.",
      ctaLabel: "Open services",
      routeHint: "settings/services"
    }
  ];

  const getStorageKey = () =>
    requestIdentity?.getScopedStorageKey?.(STORAGE_KEY_FALLBACK) ?? STORAGE_KEY_FALLBACK;

  const createEmptyState = () => ({
    version: ONBOARDING_VERSION,
    completedSteps: {},
    completedSetupSteps: {},
    startedAt: new Date().toISOString(),
    completionAcknowledgedAt: "",
    walkthroughActive: false,
    walkthroughStartedAt: "",
    walkthroughDismissedAt: ""
  });

  const normalizeState = (value) => {
    if (!value || typeof value !== "object") {
      return createEmptyState();
    }
    const completedSteps =
      value.completedSteps && typeof value.completedSteps === "object" ? value.completedSteps : {};
    const completedSetupSteps =
      value.completedSetupSteps && typeof value.completedSetupSteps === "object" ? value.completedSetupSteps : {};
    return {
      version: ONBOARDING_VERSION,
      completedSteps,
      completedSetupSteps,
      startedAt:
        typeof value.startedAt === "string" && value.startedAt.trim()
          ? value.startedAt
          : new Date().toISOString(),
      completionAcknowledgedAt:
        typeof value.completionAcknowledgedAt === "string" ? value.completionAcknowledgedAt : "",
      walkthroughActive: Boolean(value.walkthroughActive),
      walkthroughStartedAt:
        typeof value.walkthroughStartedAt === "string" ? value.walkthroughStartedAt : "",
      walkthroughDismissedAt:
        typeof value.walkthroughDismissedAt === "string" ? value.walkthroughDismissedAt : ""
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

  const markSetupStep = (stepId) => {
    const normalizedStepId = typeof stepId === "string" ? stepId.trim() : "";
    if (!normalizedStepId) {
      return readState();
    }
    const current = readState();
    if (current.completedSetupSteps[normalizedStepId]) {
      return current;
    }
    return writeState({
      ...current,
      completedSetupSteps: {
        ...current.completedSetupSteps,
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

  const activateWalkthrough = () => {
    const current = readState();
    if (current.walkthroughActive && current.walkthroughStartedAt) {
      return current;
    }
    return writeState({
      ...current,
      walkthroughActive: true,
      walkthroughStartedAt: current.walkthroughStartedAt || new Date().toISOString(),
      walkthroughDismissedAt: ""
    });
  };

  const dismissWalkthrough = () => {
    const current = readState();
    if (!current.walkthroughActive && current.walkthroughDismissedAt) {
      return current;
    }
    return writeState({
      ...current,
      walkthroughActive: false,
      walkthroughDismissedAt: new Date().toISOString()
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
    const setupSteps = SETUP_DEFINITIONS.map((definition) => {
      const signInComplete = definition.id === "sign_in" ? Boolean(authSession?.userId) : false;
      return {
        ...definition,
        completedAt: signInComplete
          ? authSession?.expiresAt ?? state.completedSetupSteps[definition.id] ?? ""
          : state.completedSetupSteps[definition.id] ?? "",
        complete: signInComplete || Boolean(state.completedSetupSteps[definition.id])
      };
    });
    const setupCompletedCount = setupSteps.filter((step) => step.complete).length;
    const setupTotalSteps = setupSteps.length;
    const setupNextStep = setupSteps.find((step) => !step.complete) ?? null;
    const setupComplete = setupTotalSteps > 0 && setupCompletedCount === setupTotalSteps;
    const setupProgressPercent =
      setupTotalSteps > 0 ? Math.round((setupCompletedCount / setupTotalSteps) * 100) : 0;
    const walkthroughActive = Boolean(state.walkthroughActive && !complete);
    return {
      steps,
      optionalSteps,
      setupSteps,
      completedCount,
      totalSteps,
      progressPercent,
      nextStep,
      complete,
      completedAt,
      completionVisible,
      completionAcknowledgedAt: state.completionAcknowledgedAt,
      setupVisible: complete && !setupComplete,
      setupComplete,
      setupCompletedCount,
      setupTotalSteps,
      setupProgressPercent,
      setupNextStep,
      walkthroughActive,
      walkthroughStartedAt: state.walkthroughStartedAt,
      walkthroughDismissedAt: state.walkthroughDismissedAt,
      visible: !complete,
      startedAt: state.startedAt
    };
  };

  window.InvoiceOnboardingState = {
    STEP_DEFINITIONS,
    OPTIONAL_DEFINITIONS,
    SETUP_DEFINITIONS,
    readState,
    writeState,
    markStep,
    markSetupStep,
    reset,
    acknowledgeCompletion,
    activateWalkthrough,
    dismissWalkthrough,
    subscribe,
    buildStatus
  };
})();
