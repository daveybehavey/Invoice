(() => {
  const { useEffect, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }

  const brandThemeUtils = window.InvoiceBrandTheme;
  if (!brandThemeUtils) {
    throw new Error(
      "Missing /utils/brandTheme.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }

  const styleCatalogUtils = window.InvoiceManualStyleCatalog;
  if (!styleCatalogUtils) {
    throw new Error(
      "Missing /utils/manualStyleCatalog.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }

  const { polishLineItemDescription } = formatUtils;
  const { DEFAULT_ACCENT_COLOR, buildAccentPalette } = brandThemeUtils;
  const {
    STYLE_PRESETS,
    STYLE_OPTIONS,
    TEMPLATE_PREVIEWS,
    SPACING_DENSITY_PRESETS,
    SPACING_DENSITY_OPTIONS
  } = styleCatalogUtils;

  const BILLIE_STYLE_ACCENTS = [
    { label: "Navy", value: "#093064", matches: [/navy/, /dark blue/, /deep blue/] },
    { label: "Blue", value: "#6993D2", matches: [/\bblue\b/, /accent blue/, /clean blue/] },
    { label: "Light blue", value: "#ACCCF0", matches: [/light blue/, /sky blue/, /pale blue/] }
  ];
  const HEADER_LAYOUT_OPTIONS = [
    { id: "split", label: "Split" },
    { id: "centered", label: "Centered" }
  ];

  const resolveBillieStyleCommand = (instruction, options = {}) => {
    const normalized = typeof instruction === "string" ? instruction.trim().toLowerCase() : "";
    if (!normalized) {
      return null;
    }

    const hasStyleContext = /\b(template|style|layout|look|accent|color)\b/.test(normalized);
    const hasLogoInstruction = /\blogo\b/.test(normalized);
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
        result.styleLabel = STYLE_PRESETS.default.label;
      } else if (/\b(minimal|compact)\b/.test(normalized)) {
        result.stylePreset = "compact";
        result.styleLabel = STYLE_PRESETS.compact.label;
      } else if (/\b(bold|spacious)\b/.test(normalized)) {
        result.stylePreset = "spacious";
        result.styleLabel = STYLE_PRESETS.spacious.label;
      }
    }

    const matchedAccent = BILLIE_STYLE_ACCENTS.find((accent) =>
      accent.matches.some((pattern) => pattern.test(normalized))
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
      result.spacingLabel = SPACING_DENSITY_PRESETS.tight.label;
    } else if (
      hasSpacingInstruction &&
      (/\b(airy|airier|loose|looser)\b/.test(normalized) || /breathing room/.test(normalized))
    ) {
      result.spacingDensity = "airy";
      result.spacingLabel = SPACING_DENSITY_PRESETS.airy.label;
    } else if (hasSpacingInstruction && /\b(standard|balanced|normal)\b/.test(normalized)) {
      result.spacingDensity = "balanced";
      result.spacingLabel = SPACING_DENSITY_PRESETS.balanced.label;
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
    const normalized = typeof instruction === "string" ? instruction.trim().toLowerCase() : "";
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
    if (/\b(formal|professional|stronger)\b/.test(normalized)) {
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

function InspectorPanel({
  activeTab,
  onTabChange,
  onClose,
  showCloseButton,
  hideInternalTabs,
  logoUrl,
  logoVisible,
  notesVisible,
  headerLayout,
  spacingDensity,
  onLogoChange,
  onLogoRemove,
  onLogoVisibilityChange,
  onNotesVisibilityChange,
  onHeaderLayoutChange,
  onSpacingDensityChange,
  stylePreset,
  onStylePresetChange,
  accentColor,
  onAccentColorChange,
  onPrint,
  onDownloadPdf,
  onSaveInvoice,
  saveStatus,
  saveError,
  saveNeedsAuth,
  onSaveAuthRetry,
  onGoToLauncherSignIn,
  savedInvoiceId,
  previewData,
  toneSource,
  onPolishDescriptions,
  buildRewriteInvoicePayload,
  onApplyRewrite,
  buildEditableInvoicePayload,
  onApplyAiEdit
}) {
  const [toneAction, setToneAction] = useState(null);
  const [selectedTone, setSelectedTone] = useState(null);
  const [toneStatus, setToneStatus] = useState("");
  const [toneLoading, setToneLoading] = useState(false);
  const [toneError, setToneError] = useState("");
  const [pendingRewrite, setPendingRewrite] = useState(null);
  const toneRequestIdRef = useRef(0);
  const [assistantInstruction, setAssistantInstruction] = useState("");
  const [assistantStatus, setAssistantStatus] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantChangePreview, setAssistantChangePreview] = useState([]);
  const [pendingAssistantEdit, setPendingAssistantEdit] = useState(null);
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const previewCloseButtonRef = useRef(null);
  const previewFocusReturnRef = useRef(null);
  const assistantRequestIdRef = useRef(0);
  const assistantQuickActions = [
    { id: "formal-descriptions", label: "Formal descriptions", instruction: "Make the descriptions more formal." },
    { id: "shorter-descriptions", label: "Shorter descriptions", instruction: "Make the descriptions shorter and clearer." },
    { id: "navy-accent", label: "Navy accent", instruction: "Use a navy accent." },
    {
      id: notesVisible ? "hide-notes" : "show-notes",
      label: notesVisible ? "Hide notes" : "Show notes",
      instruction: notesVisible ? "Hide the notes on the invoice." : "Show the notes on the invoice."
    }
  ];
  const tabs = [
    { id: "style", label: "Style", content: "Style controls coming soon" },
    { id: "tone", label: "Tone", content: "Tone controls coming soon" },
    { id: "assistant", label: "Edit with Billie", content: "Billie edits" },
    { id: "export", label: "Export", content: "Export options coming soon" }
  ];
  const styleOptions = STYLE_OPTIONS;
  const toneOptions = ["Formal", "Neutral", "Friendly"];
  const accentSwatches = ["#093064", "#6993D2", "#ACCCF0", "#0f9d6e", "#be123c", "#111827"];
  const accent = buildAccentPalette(accentColor);
  const accentButtonStyle = {
    backgroundColor: accent.primary,
    borderColor: accent.primary,
    color: accent.buttonText
  };
  const accentGhostButtonStyle = {
    backgroundColor: accent.soft,
    borderColor: accent.border,
    color: accent.text
  };
  const buildAssistantChangePreview = (beforeInvoice, afterInvoice, scope) => {
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
      const beforeText = (beforeItems[index]?.description ?? "").trim();
      const afterText = (afterItems[index]?.description ?? "").trim();
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

  useEffect(() => {
    if (!previewTemplateId) {
      return undefined;
    }
    previewFocusReturnRef.current = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewTemplateId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      previewCloseButtonRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const previous = previewFocusReturnRef.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [previewTemplateId]);

  const startRewrite = (tone) => {
    setSelectedTone(tone);
    const payloadResult = buildRewriteInvoicePayload();
    if (payloadResult.error) {
      setToneError(payloadResult.error);
      setToneLoading(false);
      setPendingRewrite(null);
      return;
    }
    const { invoice } = payloadResult;
    toneRequestIdRef.current += 1;
    const requestId = toneRequestIdRef.current;
    setToneLoading(true);
    setToneError("");
    setPendingRewrite(null);
    setToneStatus("");
    apiFetch("/api/invoices/reword-full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice, tone })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Rewrite failed");
        }
        return response.json();
      })
      .then((payload) => {
        if (requestId !== toneRequestIdRef.current) {
          return;
        }
        const rewrittenInvoice = payload?.invoice;
        setPendingRewrite({
          lineItems: rewrittenInvoice?.lineItems ?? [],
          notes: rewrittenInvoice?.notes ?? ""
        });
        setToneLoading(false);
      })
      .catch((error) => {
        if (requestId !== toneRequestIdRef.current) {
          return;
        }
        setToneError("Rewrite failed. Try again.");
        setToneLoading(false);
      });
  };

  const runAssistantWordingRewrite = (instruction, wordingCommand) => {
    const appendUserMessage = wordingCommand.appendUserMessage !== false;
    const payloadResult = buildRewriteInvoicePayload?.();
    if (!payloadResult || payloadResult.error) {
      setAssistantError(payloadResult?.error ?? "Add at least one line item before editing.");
      return;
    }

    if (wordingCommand.scope === "notes" && !(payloadResult.invoice.notes ?? "").trim()) {
      setAssistantError("Add notes before asking Billie to rewrite them.");
      return;
    }

    const routePath =
      wordingCommand.scope === "notes" ? "/api/invoices/reword-notes" : "/api/invoices/reword-full";
    const requestBody =
      wordingCommand.scope === "notes"
        ? { invoice: payloadResult.invoice, tone: wordingCommand.tone }
        : { invoice: payloadResult.invoice, tone: wordingCommand.tone };

    assistantRequestIdRef.current += 1;
    const requestId = assistantRequestIdRef.current;
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantStatus(wordingCommand.loadingText);
    if (appendUserMessage) {
      setAssistantMessages((prev) => [...prev, { role: "user", text: instruction }]);
    }

    apiFetch(routePath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Rewrite failed");
        }
        return response.json();
      })
      .then((payload) => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        if (!payload?.invoice) {
          throw new Error("Rewrite failed");
        }
        setAssistantChangePreview(
          buildAssistantChangePreview(payloadResult.invoice, payload.invoice, wordingCommand.scope)
        );
        onApplyRewrite?.({
          lineItems: payload.invoice.lineItems ?? [],
          notes: payload.invoice.notes ?? "",
          mode: wordingCommand.scope === "notes" ? "notes" : wordingCommand.scope
        });
        const responseText =
          wordingCommand.scope === "notes"
            ? "Notes updated. Numbers unchanged."
            : wordingCommand.scope === "descriptions"
              ? "Descriptions updated. Numbers unchanged."
              : "Wording updated. Numbers unchanged.";
        setAssistantMessages((prev) => [...prev, { role: "ai", text: responseText }]);
        setAssistantStatus("");
        setAssistantInstruction("");
        setAssistantLoading(false);
      })
      .catch(() => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        setAssistantError("Rewrite failed. Try again.");
        setAssistantStatus("");
        setAssistantLoading(false);
      });
  };

  const applyAssistantStyleCommand = (styleCommand) => {
    if (!styleCommand) {
      return false;
    }
    let applied = false;
    if (styleCommand.stylePreset) {
      onStylePresetChange?.(styleCommand.stylePreset);
      applied = true;
    }
    if (styleCommand.accentColor) {
      onAccentColorChange?.(styleCommand.accentColor);
      applied = true;
    }
    if (styleCommand.logoVisible !== null) {
      onLogoVisibilityChange?.(styleCommand.logoVisible);
      applied = true;
    }
    if (styleCommand.notesVisible !== null) {
      onNotesVisibilityChange?.(styleCommand.notesVisible);
      applied = true;
    }
    if (styleCommand.headerLayout) {
      onHeaderLayoutChange?.(styleCommand.headerLayout);
      applied = true;
    }
    if (styleCommand.spacingDensity) {
      onSpacingDensityChange?.(styleCommand.spacingDensity);
      applied = true;
    }
    return applied;
  };

  const submitAssistantEdit = (instructionOverride = null) => {
    const instructionSource =
      typeof instructionOverride === "string" ? instructionOverride : assistantInstruction;
    const instruction = instructionSource.trim();
    if (!instruction) {
      setAssistantError("Add an instruction for Billie.");
      return;
    }
    if (pendingAssistantEdit) {
      setAssistantError("Apply or discard the pending changes first.");
      return;
    }
    const styleCommand = resolveBillieStyleCommand(instruction, { logoUrl, logoVisible });
    const wordingCommand = resolveBillieWordingCommand(instruction);
    if (styleCommand && wordingCommand) {
      const styleApplied = applyAssistantStyleCommand(styleCommand);
      setAssistantError("");
      setAssistantMessages((prev) => [
        ...prev,
        { role: "user", text: instruction },
        ...(styleCommand.responseText ? [{ role: "ai", text: styleCommand.responseText }] : [])
      ]);
      setAssistantInstruction("");
      setAssistantChangePreview([]);
      if (styleApplied) {
        setAssistantStatus("");
      }
      runAssistantWordingRewrite(instruction, {
        ...wordingCommand,
        appendUserMessage: false
      });
      return;
    }
    if (styleCommand) {
      applyAssistantStyleCommand(styleCommand);
      setAssistantError("");
      setAssistantStatus("");
      setAssistantChangePreview([]);
      setAssistantMessages((prev) => [
        ...prev,
        { role: "user", text: instruction },
        { role: "ai", text: styleCommand.responseText }
      ]);
      setAssistantInstruction("");
      return;
    }
    if (wordingCommand) {
      runAssistantWordingRewrite(instruction, wordingCommand);
      return;
    }
    const payloadResult = buildEditableInvoicePayload?.();
    if (!payloadResult || payloadResult.error) {
      setAssistantError(payloadResult?.error ?? "Add at least one line item before editing.");
      return;
    }
    const { invoice } = payloadResult;
    assistantRequestIdRef.current += 1;
    const requestId = assistantRequestIdRef.current;
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantStatus("");
    setAssistantChangePreview([]);
    setAssistantMessages((prev) => [...prev, { role: "user", text: instruction }]);
    apiFetch("/api/invoices/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice, instruction })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Edit failed");
        }
        return response.json();
      })
      .then((payload) => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        if (payload?.followUp) {
          setAssistantStatus(payload.followUp);
          setAssistantMessages((prev) => [...prev, { role: "ai", text: payload.followUp }]);
          setAssistantLoading(false);
          setAssistantInstruction("");
          return;
        }
        if (payload?.invoice) {
          const summary = buildEditSummary(invoice, payload.invoice);
          setPendingAssistantEdit({ invoice: payload.invoice, summary });
          setAssistantMessages((prev) => [
            ...prev,
            {
              role: "ai",
              text: "I drafted updates. Review and apply when ready."
            }
          ]);
          setAssistantInstruction("");
        } else {
          setAssistantError("No updates returned. Try again.");
        }
        setAssistantLoading(false);
      })
      .catch(() => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        setAssistantError("Edit failed. Try again.");
        setAssistantLoading(false);
      });
  };

  const buildEditSummary = (before, after) => {
    if (!before || !after) {
      return ["Review the suggested changes before applying."];
    }
    const summary = [];
    if (before.customerName !== after.customerName) {
      summary.push("Client updated");
    }
    if (before.issueDate !== after.issueDate) {
      summary.push("Invoice date updated");
    }
    if (before.invoiceNumber !== after.invoiceNumber) {
      summary.push("Invoice number updated");
    }
    if ((before.notes ?? "") !== (after.notes ?? "")) {
      summary.push("Notes updated");
    }
    const beforeLines = Array.isArray(before.lineItems) ? before.lineItems : [];
    const afterLines = Array.isArray(after.lineItems) ? after.lineItems : [];
    if (beforeLines.length !== afterLines.length) {
      summary.push(`Line items: ${beforeLines.length} → ${afterLines.length}`);
    }
    const changes = [];
    afterLines.forEach((line) => {
      const match =
        beforeLines.find((item) => item.id && line.id && item.id === line.id) ??
        beforeLines.find((item) => item.description === line.description);
      if (!match) {
        changes.push(`Added: ${line.description}`);
        return;
      }
      if (
        match.description !== line.description ||
        match.quantity !== line.quantity ||
        match.unitPrice !== line.unitPrice
      ) {
        changes.push(`Updated: ${line.description || match.description}`);
      }
    });
    const trimmedChanges = changes.filter(Boolean).slice(0, 3);
    if (trimmedChanges.length > 0) {
      summary.push(...trimmedChanges);
    }
    if (summary.length === 0) {
      summary.push("Minor wording updates");
    }
    return summary;
  };

  const handleApplyPendingEdit = () => {
    if (!pendingAssistantEdit) {
      return;
    }
    onApplyAiEdit?.(pendingAssistantEdit.invoice);
    setAssistantMessages((prev) => [...prev, { role: "ai", text: "Changes applied." }]);
    setPendingAssistantEdit(null);
  };

  const handleDiscardPendingEdit = () => {
    if (!pendingAssistantEdit) {
      return;
    }
    setAssistantMessages((prev) => [...prev, { role: "ai", text: "Okay — discarded that draft." }]);
    setPendingAssistantEdit(null);
  };

  const buildPreview = (items, previewNotes) => {
    const descriptionLines = items
      .filter((item) => item.description && item.description.trim())
      .map((item, index) => `${index + 1}. ${item.description.trim()}`)
      .join("\n");
    if (toneAction === "descriptions") {
      return descriptionLines || "No descriptions yet.";
    }
    const notesText = previewNotes?.trim() ? previewNotes.trim() : "No notes yet.";
    return `Descriptions:\n${descriptionLines || "No descriptions yet."}\n\nNotes:\n${notesText}`;
  };

  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content ?? "";
  const beforePreview = buildPreview(toneSource?.lineItems ?? [], toneSource?.notes ?? "");
  const afterPreview = pendingRewrite
    ? buildPreview(pendingRewrite.lineItems ?? [], pendingRewrite.notes ?? "")
    : toneLoading
      ? "Generating preview..."
      : selectedTone
        ? "Select a tone to see a preview."
        : "Select a tone to see a preview.";
  const templateCatalog = STYLE_PRESETS;
  const templatePreviews = TEMPLATE_PREVIEWS;
  const previewTemplate = previewTemplateId ? templateCatalog[previewTemplateId] : null;
  const previewIsSelected = previewTemplateId && stylePreset === previewTemplateId;
  const previewPreset = previewTemplate ?? templateCatalog.default;
  const previewSpacing =
    SPACING_DENSITY_PRESETS[previewData?.spacingDensity ?? spacingDensity] ??
    SPACING_DENSITY_PRESETS.balanced;
  const previewLineItems = Array.isArray(previewData?.lineItems) ? previewData.lineItems : [];
  const parsedLineItems = previewLineItems
    .filter(
      (item) =>
        item &&
        (item.description?.trim() || `${item.qty ?? ""}`.trim() || `${item.rate ?? ""}`.trim())
    )
    .map((item) => {
      const quantity = Number.parseFloat(`${item.qty ?? ""}`);
      const rate = Number.parseFloat(`${item.rate ?? ""}`);
      const hasQuantity = Number.isFinite(quantity);
      const hasRate = Number.isFinite(rate);
      return {
        id: item.id,
        description: polishLineItemDescription(item.description?.trim()) || "Untitled line item",
        qty: hasQuantity ? quantity : null,
        rate: hasRate ? rate : null,
        amount: hasQuantity && hasRate ? quantity * rate : null
      };
    });
  const previewItems =
    parsedLineItems.length > 0
      ? parsedLineItems
      : [
          {
            id: "preview-placeholder",
            description: "Add line items to see them here.",
            qty: null,
            rate: null,
            amount: null,
            placeholder: true
          }
        ];
  const formatPreviewMoney = (value) =>
    Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
  const previewSubtotal = Number.isFinite(previewData?.subtotal)
    ? previewData.subtotal
    : parsedLineItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const previewTaxRate = Number.parseFloat(`${previewData?.taxRate ?? ""}`);
  const previewTaxAmount = Number.isFinite(previewData?.taxAmount)
    ? previewData.taxAmount
    : Number.isFinite(previewTaxRate)
      ? previewSubtotal * (previewTaxRate / 100)
      : 0;
  const previewTotal = Number.isFinite(previewData?.total)
    ? previewData.total
    : previewSubtotal + previewTaxAmount;
  const previewInvoiceNumber =
    previewData?.invoiceNumber?.trim() || (previewItems[0]?.placeholder ? "Invoice" : "Invoice");
  const previewIssueDate = previewData?.invoiceDate?.trim() || "—";
  const previewFromDetails = previewData?.fromDetails?.trim() || "Add your business details";
  const previewBillToDetails = previewData?.billToDetails?.trim() || "Add client details";
  const previewNotes = previewData?.notes?.trim() || "Add payment terms or a note.";
  const previewAccent = buildAccentPalette(previewData?.accentColor ?? accentColor ?? DEFAULT_ACCENT_COLOR);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col border border-slate-200 bg-white shadow-sm md:rounded-2xl">
        {!hideInternalTabs ? (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    activeTab === tab.id ? "" : "text-slate-600"
                  }`}
                  style={activeTab === tab.id ? accentButtonStyle : undefined}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {showCloseButton ? (
              <button
                type="button"
                className="text-sm font-semibold text-slate-600"
                onClick={onClose}
              >
                Close
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={`flex-1 overflow-y-auto px-4 py-5 text-sm text-slate-600 ${hideInternalTabs ? "pt-4" : ""}`}>
          {activeTab === "style" ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Templates</p>
                <div className="mt-3 grid gap-3">
                  {styleOptions.map((option) => {
                    const preview = templatePreviews[option.id] ?? templatePreviews.default;
                    const isSelected = stylePreset === option.id;
                    return (
                      <div
                        key={option.id}
                        role="button"
                        tabIndex={0}
                        className={`w-full cursor-pointer rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 ${
                          isSelected
                            ? "shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                        style={isSelected ? { borderColor: accent.border, backgroundColor: accent.soft } : undefined}
                        onClick={() => onStylePresetChange(option.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onStylePresetChange(option.id);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">
                            {option.label}
                          </span>
                          {isSelected ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={accentGhostButtonStyle}
                            >
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold"
                          style={{ color: accent.text }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPreviewTemplateId(option.id);
                          }}
                        >
                          Preview
                        </button>
                        <div className="mt-3 space-y-2">
                          <div className={`h-2 w-20 rounded-sm ${preview.title}`} />
                          <div className={`h-px ${preview.rule}`} />
                          <div className="space-y-1">
                            <div className={`h-2 w-full rounded-sm ${preview.row}`} />
                            <div className={`h-2 w-5/6 rounded-sm ${preview.row}`} />
                            <div className={`h-2 w-4/6 rounded-sm ${preview.row}`} />
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className={`h-2 w-14 rounded-sm ${preview.totals}`} />
                            <div className={`h-2 w-12 rounded-sm ${preview.totalStrong}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Accent color</p>
                <p className="text-xs text-slate-500">Applies to highlights, buttons, and totals.</p>
                <div className="flex flex-wrap gap-2">
                  {accentSwatches.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`h-8 w-8 rounded-full border ${
                        accentColor === swatch ? "border-slate-900" : "border-slate-200"
                      }`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => onAccentColorChange?.(swatch)}
                      aria-label={`Set accent color ${swatch}`}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Custom
                  <input
                    type="color"
                    className="h-8 w-10 rounded border border-slate-200 bg-white p-1"
                    value={accentColor ?? "#0f9d6e"}
                    onChange={(event) => onAccentColorChange?.(event.target.value)}
                  />
                  <span className="font-mono text-[11px] text-slate-500">{accentColor ?? "#0f9d6e"}</span>
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Header layout</p>
                <p className="text-xs text-slate-500">Choose how the invoice header is arranged.</p>
                <div className="flex flex-wrap gap-2">
                  {HEADER_LAYOUT_OPTIONS.map((option) => {
                    const isSelected = headerLayout === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                          isSelected ? "" : "border-slate-200 text-slate-600"
                        }`}
                        style={isSelected ? accentButtonStyle : undefined}
                        onClick={() => onHeaderLayoutChange?.(option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Spacing density</p>
                <p className="text-xs text-slate-500">Adjust how tight or airy the invoice feels.</p>
                <div className="flex flex-wrap gap-2">
                  {SPACING_DENSITY_OPTIONS.map((option) => {
                    const isSelected = spacingDensity === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                          isSelected ? "" : "border-slate-200 text-slate-600"
                        }`}
                        style={isSelected ? accentButtonStyle : undefined}
                        onClick={() => onSpacingDensityChange?.(option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Logo</p>
                <p className="mt-1 text-xs text-slate-500">PNG, JPG, or SVG</p>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="block w-full text-sm text-slate-600"
                onChange={onLogoChange}
              />
              {logoUrl ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="h-16 w-auto object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-slate-600"
                    onClick={onLogoRemove}
                  >
                    Remove logo
                  </button>
                  <button
                    type="button"
                    className="text-sm font-semibold text-slate-600"
                    onClick={() => onLogoVisibilityChange?.(!logoVisible)}
                  >
                    {logoVisible ? "Hide on invoice" : "Show on invoice"}
                  </button>
                  <p className="text-xs text-slate-500">
                    {logoVisible ? "Logo is visible on the invoice." : "Logo is hidden from the invoice."}
                  </p>
                </div>
              ) : null}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Notes / Terms</p>
                  <p className="mt-1 text-xs text-slate-500">Show or hide notes on the invoice.</p>
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-600"
                  onClick={() => onNotesVisibilityChange?.(!notesVisible)}
                >
                  {notesVisible ? "Hide on invoice" : "Show on invoice"}
                </button>
                <p className="text-xs text-slate-500">
                  {notesVisible
                    ? "Notes are visible on the invoice."
                    : "Notes are hidden from the invoice."}
                </p>
              </div>
            </div>
          ) : activeTab === "tone" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Rewrite wording only. Amounts are never changed.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  setToneAction("descriptions");
                  setSelectedTone(null);
                  setToneStatus("");
                  setToneError("");
                  setPendingRewrite(null);
                }}
              >
                Rewrite descriptions
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  setToneAction("full");
                  setSelectedTone(null);
                  setToneStatus("");
                  setToneError("");
                  setPendingRewrite(null);
                }}
              >
                Rewrite entire invoice text
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  const changedCount = Number(onPolishDescriptions?.() ?? 0);
                  setToneStatus(
                    changedCount > 0
                      ? `Polished ${changedCount} line item${changedCount > 1 ? "s" : ""}.`
                      : "No wording updates needed."
                  );
                  setToneError("");
                }}
              >
                Quick clean descriptions
              </button>
            </div>

            {toneAction ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Select tone
                </p>
                <div className="flex flex-wrap gap-2">
                  {toneOptions.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        selectedTone === tone ? "" : "border border-slate-200 text-slate-600"
                      }`}
                      style={selectedTone === tone ? accentButtonStyle : undefined}
                      onClick={() => startRewrite(tone)}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {toneAction ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Before</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{beforePreview}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">After</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{afterPreview}</p>
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  style={accentButtonStyle}
                  disabled={!selectedTone || toneLoading || !pendingRewrite}
                  onClick={() => {
                    onApplyRewrite({
                      lineItems: pendingRewrite?.lineItems ?? [],
                      notes: pendingRewrite?.notes ?? "",
                      mode: toneAction
                    });
                    setToneStatus("Changes applied.");
                  }}
                >
                  Apply changes
                </button>
                {toneLoading ? <p className="text-xs text-slate-500">Rewriting...</p> : null}
                {toneError ? <p className="text-xs text-rose-600">{toneError}</p> : null}
                {toneStatus ? <p className="text-xs text-slate-500">{toneStatus}</p> : null}
              </div>
            ) : null}
          </div>
        ) : activeTab === "assistant" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Edit with Billie</p>
              <p className="mt-1 text-xs text-slate-500">
                Ask for changes without retyping. Billie will only adjust what you request.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                {assistantQuickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    style={accentGhostButtonStyle}
                    onClick={() => submitAssistantEdit(action.instruction)}
                    disabled={assistantLoading || !!pendingAssistantEdit}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Conversation
              </p>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {assistantMessages.length > 0 ? (
                  assistantMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        message.role === "user" ? "" : "bg-white text-slate-600"
                      }`}
                      style={message.role === "user" ? accentGhostButtonStyle : undefined}
                    >
                      <p className="font-semibold uppercase tracking-wide text-[10px]">
                        {message.role === "user" ? "You" : "Billie"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs">{message.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    Ask for changes like “Use the bold template with a navy accent.” or “Rename the
                    logo line item to Brand refresh.”
                  </p>
                )}
              </div>
            </div>
            {assistantChangePreview.length > 0 ? (
              <div
                className="space-y-3 rounded-lg border p-3"
                style={{ borderColor: accent.border, backgroundColor: accent.soft }}
                data-testid="manual-billie-change-preview"
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent.text }}>
                  Last Billie change
                </p>
                <div className="space-y-3">
                  {assistantChangePreview.map((entry, index) => (
                    <div key={`${entry.label}-${index}`} className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {entry.label}
                      </p>
                      <p className="text-xs text-slate-500">Before</p>
                      <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        {entry.before}
                      </p>
                      <p className="text-xs text-slate-500">After</p>
                      <p className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                        {entry.after}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <textarea
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="Example: Use the bold template with a navy accent."
              value={assistantInstruction}
              onChange={(event) => setAssistantInstruction(event.target.value)}
              disabled={assistantLoading}
            />
            {pendingAssistantEdit ? (
              <div
                className="space-y-3 rounded-lg border p-3"
                style={{ borderColor: accent.border, backgroundColor: accent.soft }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent.text }}>
                  Pending changes
                </p>
                <ul className="space-y-1 text-xs" style={{ color: accent.text }}>
                  {pendingAssistantEdit.summary.map((item, index) => (
                    <li key={`summary-${index}`}>{item}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    style={accentButtonStyle}
                    onClick={handleApplyPendingEdit}
                    disabled={assistantLoading}
                  >
                    Apply changes
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: accent.border, color: accent.text }}
                    onClick={handleDiscardPendingEdit}
                    disabled={assistantLoading}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              style={accentButtonStyle}
              onClick={submitAssistantEdit}
              disabled={assistantLoading || !!pendingAssistantEdit}
            >
              Draft edit
            </button>
            {assistantLoading ? <p className="text-xs text-slate-500">Applying changes...</p> : null}
            {assistantError ? <p className="text-xs text-rose-600">{assistantError}</p> : null}
            {assistantStatus ? <p className="text-xs text-slate-500">{assistantStatus}</p> : null}
          </div>
        ) : activeTab === "export" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Save to library</p>
                {saveStatus ? (
                  <span className="text-xs font-semibold" style={{ color: accent.text }}>
                    {saveStatus}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Store this invoice so you can reopen or duplicate it later.
              </p>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                style={accentButtonStyle}
                onClick={onSaveInvoice}
                disabled={Boolean(saveStatus && saveStatus !== "Saved")}
              >
                {savedInvoiceId ? "Update saved invoice" : "Save invoice"}
              </button>
              {saveError ? <p className="text-xs text-rose-600">{saveError}</p> : null}
              {saveNeedsAuth ? (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs text-slate-600">Sign in, then retry save.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      onClick={onGoToLauncherSignIn}
                    >
                      Go to launcher sign-in
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border px-2 py-1 text-xs font-semibold"
                      style={accentGhostButtonStyle}
                      onClick={onSaveAuthRetry}
                    >
                      I signed in, retry
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Download PDF</p>
              <p className="text-xs text-slate-500">Save a PDF copy of the current invoice.</p>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={onDownloadPdf}
              >
                Download PDF
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Print</p>
              <p className="text-xs text-slate-500">Open the print dialog for this invoice.</p>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={onPrint}
              >
                Print
              </button>
            </div>
          </div>
        ) : (
          activeContent
        )}
      </div>
    </div>
    {previewTemplate ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Template preview"
        onClick={() => setPreviewTemplateId(null)}
      >
        <div
          className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Template preview
              </p>
              <p className="text-lg font-semibold text-slate-900">{previewTemplate.label}</p>
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-slate-500"
              onClick={() => setPreviewTemplateId(null)}
              ref={previewCloseButtonRef}
            >
              Close
            </button>
          </div>
          <div className="px-6 py-5">
            <div
              className={`rounded-2xl border ${previewSpacing.shellPaddingClass} ${previewPreset.shellClass} ${previewPreset.textClass}`}
              data-spacing-density={previewData?.spacingDensity ?? spacingDensity}
            >
              <div className={previewSpacing.sectionGapClass || previewPreset.sectionGap}>
                <div className={`flex items-center justify-between ${previewPreset.metaClass}`}>
                  <span>Invoice Document</span>
                  <span>Preview</span>
                </div>

                <header className="space-y-5" data-header-layout={previewData?.headerLayout ?? "split"}>
                  {previewData?.logoUrl && previewData?.logoVisible !== false ? (
                    <div
                      className={`flex ${previewData?.headerLayout === "centered" ? "justify-center" : "items-center"}`}
                    >
                      <img
                        src={previewData.logoUrl}
                        alt="Company logo"
                        className="h-10 w-auto max-w-[160px] object-contain"
                      />
                    </div>
                  ) : null}
                  <div
                    className={`flex flex-wrap gap-4 ${
                      previewData?.headerLayout === "centered"
                        ? "flex-col items-center text-center"
                        : "items-start justify-between"
                    }`}
                  >
                    <div>
                      <h1 className={previewPreset.titleClass}>INVOICE</h1>
                      <p
                        className="mt-2 text-xs font-semibold uppercase tracking-[0.2em]"
                        style={{ color: previewAccent.text }}
                      >
                        NoteBill draft
                      </p>
                    </div>
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Invoice #
                        </span>
                        <span className="font-semibold text-slate-900">
                          {previewInvoiceNumber}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Date
                        </span>
                        <span className="font-semibold text-slate-900">{previewIssueDate}</span>
                      </div>
                    </div>
                  </div>
                </header>

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>From</p>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <p className="whitespace-pre-line">{previewFromDetails}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>
                      Bill To
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <p className="whitespace-pre-line">{previewBillToDetails}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className={`min-w-full text-left ${previewPreset.textClass}`}>
                      <thead className={previewPreset.tableHeadClass}>
                        <tr>
                          <th className="border-b border-slate-200 pb-2 pr-3">Description</th>
                          <th className="border-b border-slate-200 pb-2 pr-3">Qty</th>
                          <th className="border-b border-slate-200 pb-2 pr-3">Rate</th>
                          <th className="border-b border-slate-200 pb-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewItems.map((item) => (
                          <tr key={item.id} className="odd:bg-slate-50/70">
                            <td className="py-3 pr-3 align-top">
                              <p className="font-semibold text-slate-800">{item.description}</p>
                              {item.placeholder ? (
                                <p className="mt-1 text-xs text-slate-400">
                                  Start by adding a line item in the editor.
                                </p>
                              ) : null}
                            </td>
                            <td className="py-3 pr-3 align-top text-sm text-slate-600">
                              {Number.isFinite(item.qty) ? item.qty : "—"}
                            </td>
                            <td className="py-3 pr-3 align-top text-sm text-slate-600">
                              {Number.isFinite(item.rate) ? formatPreviewMoney(item.rate) : "—"}
                            </td>
                            <td className="py-3 text-right align-top text-sm text-slate-600">
                              {Number.isFinite(item.amount) ? (
                                formatPreviewMoney(item.amount)
                              ) : item.placeholder ? (
                                "—"
                              ) : (
                                <span className="text-xs font-semibold text-amber-600">
                                  Needs value
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="flex justify-end">
                  <div
                    className={`w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 ${previewPreset.textClass}`}
                  >
                    <div className={`flex justify-between ${previewPreset.totalsMutedClass}`}>
                      <span>Subtotal</span>
                      <span>{formatPreviewMoney(previewSubtotal)}</span>
                    </div>
                    <div className={`flex justify-between ${previewPreset.totalsMutedClass}`}>
                      <span>Tax</span>
                      <span>{formatPreviewMoney(previewTaxAmount)}</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${previewPreset.totalsStrongClass}`}>
                      <span>Total</span>
                      <span style={{ color: previewAccent.text }}>{formatPreviewMoney(previewTotal)}</span>
                    </div>
                  </div>
                </section>

                {previewData?.notesVisible !== false ? (
                  <section className="space-y-2">
                    <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>
                      Notes / Terms
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <p className="whitespace-pre-line">{previewNotes}</p>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500">
              {previewIsSelected ? "Currently selected template." : "Preview only."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
                onClick={() => setPreviewTemplateId(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white"
                style={{
                  backgroundColor: previewAccent.primary,
                  borderColor: previewAccent.primary
                }}
                onClick={() => {
                  if (previewTemplateId) {
                    onStylePresetChange(previewTemplateId);
                  }
                  setPreviewTemplateId(null);
                }}
              >
                Use this template
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

  window.InvoiceManualInspector = {
    InspectorPanel
  };
})();
