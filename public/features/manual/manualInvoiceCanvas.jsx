(() => {
  const { useNavigate } = ReactRouterDOM;
  const { useEffect, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const manualInspectorUtils = window.InvoiceManualInspector;
  if (!manualInspectorUtils) {
    throw new Error(
      "Missing /features/manual/inspectorPanel.jsx load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const brandThemeUtils = window.InvoiceBrandTheme;
  if (!brandThemeUtils) {
    throw new Error(
      "Missing /utils/brandTheme.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const styleCatalogUtils = window.InvoiceManualStyleCatalog;
  if (!styleCatalogUtils) {
    throw new Error(
      "Missing /utils/manualStyleCatalog.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const businessProfileUtils = window.InvoiceBusinessProfile;
  if (!businessProfileUtils) {
    throw new Error(
      "Missing /utils/businessProfile.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  if (!lineItemLibraryUtils) {
    throw new Error(
      "Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const logoImageUtils = window.InvoiceLogoImage;
  if (!logoImageUtils) {
    throw new Error(
      "Missing /utils/logoImage.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const { polishLineItemDescription } = formatUtils;
  const { InspectorPanel } = manualInspectorUtils;
  const { DEFAULT_ACCENT_COLOR, normalizeAccentColor, buildAccentPalette } = brandThemeUtils;
  const { STYLE_PRESETS } = styleCatalogUtils;
  const { getBusinessProfile, applyBusinessProfileToDraft } = businessProfileUtils;
  const { rememberClientDetails } = clientMemoryUtils;
  const { getLineItemLibrary, rememberLineItems } = lineItemLibraryUtils;
  const { readLogoFileForStorage } = logoImageUtils;

  const readDraftFromStorage = (key) => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (_error) {
      return null;
    }
  };

function ManualInvoiceCanvas() {
  const navigate = useNavigate();
  const [authSession, setAuthSession] = useState(() => requestIdentity.getAuthSession?.() ?? null);
  const legacyDraftStorageKey = "invoiceDraft";
  const draftStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? legacyDraftStorageKey;
  const initialDraftMetaRef = useRef(
    (() => {
      const scopedDraft = readDraftFromStorage(draftStorageKey);
      if (scopedDraft) {
        return { draft: scopedDraft, fromLegacy: false };
      }
      if (draftStorageKey !== legacyDraftStorageKey) {
        const legacyDraft = readDraftFromStorage(legacyDraftStorageKey);
        if (legacyDraft) {
          return { draft: legacyDraft, fromLegacy: true };
        }
      }
      return { draft: null, fromLegacy: false };
    })()
  );
  const initialDraftMeta = initialDraftMetaRef.current;
  const initialDraft = initialDraftMeta?.draft ?? null;
  const initialBusinessProfileRef = useRef(getBusinessProfile());
  const initialBusinessProfile = initialBusinessProfileRef.current;
  const seededDraft = applyBusinessProfileToDraft(initialDraft ?? {}, initialBusinessProfile);
  const [invoiceNumber, setInvoiceNumber] = useState(() => initialDraft?.invoiceNumber ?? "INV-0001");
  const [invoiceDate, setInvoiceDate] = useState(() => initialDraft?.invoiceDate ?? "");
  const [fromDetails, setFromDetails] = useState(
    () => initialDraft?.fromDetails ?? seededDraft?.fromDetails ?? ""
  );
  const [billToDetails, setBillToDetails] = useState(() => initialDraft?.billToDetails ?? "");
  const [notes, setNotes] = useState(() => initialDraft?.notes ?? "");
  const [taxRate, setTaxRate] = useState(() => initialDraft?.taxRate ?? "0");
  const [lineItems, setLineItems] = useState(() =>
    Array.isArray(initialDraft?.lineItems) && initialDraft.lineItems.length > 0
      ? initialDraft.lineItems
      : [{ id: "line-1", description: "", qty: "", rate: "" }]
  );
  const [logoUrl, setLogoUrl] = useState(() => initialDraft?.logoUrl ?? seededDraft?.logoUrl ?? null);
  const [logoVisible, setLogoVisible] = useState(() => initialDraft?.logoVisible ?? true);
  const [headerLayout, setHeaderLayout] = useState(() => initialDraft?.headerLayout ?? "split");
  const [stylePreset, setStylePreset] = useState(
    () => initialDraft?.stylePreset ?? seededDraft?.stylePreset ?? "default"
  );
  const [accentColor, setAccentColor] = useState(() =>
    normalizeAccentColor(initialDraft?.accentColor ?? seededDraft?.accentColor ?? DEFAULT_ACCENT_COLOR)
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState("style");
  const [draftStatus, setDraftStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNeedsAuth, setSaveNeedsAuth] = useState(false);
  const [saveAuthRequiredPolicy, setSaveAuthRequiredPolicy] = useState(false);
  const [savedInvoiceId, setSavedInvoiceId] = useState(() => initialDraft?.savedInvoiceId ?? "");
  const [savedLineItemLibrary, setSavedLineItemLibrary] = useState(() => getLineItemLibrary());
  const [showSavedLineItems, setShowSavedLineItems] = useState(false);
  const saveTimeoutRef = useRef(null);
  const clearStatusTimeoutRef = useRef(null);
  const draftStatusLabel = "Draft restored";

  const activePreset = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.default;

  const parseNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatMoney = (value) => `$${value.toFixed(2)}`;

  const getLineAmount = (item) => parseNumber(item.qty) * parseNumber(item.rate);
  const subtotal = lineItems.reduce((sum, item) => sum + getLineAmount(item), 0);
  const taxAmount = subtotal * (parseNumber(taxRate) / 100);
  const total = subtotal + taxAmount;
  const previewData = {
    invoiceNumber,
    invoiceDate,
    fromDetails,
    billToDetails,
    notes,
    taxRate,
    subtotal,
    taxAmount,
    total,
    lineItems,
    logoUrl,
    logoVisible,
    headerLayout,
    accentColor
  };

  const accent = buildAccentPalette(accentColor);
  const accentButtonStyle = {
    backgroundColor: accent.primary,
    borderColor: accent.primary,
    color: "#ffffff"
  };
  const accentGhostButtonStyle = {
    backgroundColor: accent.soft,
    borderColor: accent.border,
    color: accent.primary
  };

  const handleLineItemChange = (id, field, value) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleLineItemDescriptionBlur = (id) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const polished = polishLineItemDescription(item.description);
        if (!polished || polished === item.description) {
          return item;
        }
        return { ...item, description: polished };
      })
    );
  };

  const handlePolishDescriptions = () => {
    const nextLineItems = lineItems.map((item) => {
      const polished = polishLineItemDescription(item.description);
      if (!polished) {
        return item;
      }
      return { ...item, description: polished };
    });
    const changedCount = nextLineItems.reduce((count, item, index) => {
      return item.description !== lineItems[index]?.description ? count + 1 : count;
    }, 0);
    if (changedCount > 0) {
      setLineItems(nextLineItems);
      setDraftStatus(`Polished ${changedCount} line item${changedCount > 1 ? "s" : ""}`);
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 1800);
    }
    return changedCount;
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: `line-${Date.now()}`, description: "", qty: "", rate: "" }
    ]);
  };

  const setTimedDraftStatus = (message) => {
    setDraftStatus(message);
    if (clearStatusTimeoutRef.current) {
      window.clearTimeout(clearStatusTimeoutRef.current);
    }
    clearStatusTimeoutRef.current = window.setTimeout(() => {
      setDraftStatus("");
    }, 1800);
  };

  const handleInsertSavedLineItem = (entry) => {
    if (!entry?.description) {
      return;
    }
    const nextLineItem = {
      id: `line-${Date.now()}`,
      description: entry.description,
      qty: entry.qty ?? "",
      rate: entry.rate ?? ""
    };
    setLineItems((prev) => {
      const emptyIndex = prev.findIndex(
        (item) => !item.description.trim() && item.qty === "" && item.rate === ""
      );
      if (emptyIndex === -1) {
        return [...prev, nextLineItem];
      }
      return prev.map((item, index) => (index === emptyIndex ? nextLineItem : item));
    });
    setTimedDraftStatus(`Inserted saved item: ${entry.description}`);
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const result = await readLogoFileForStorage(file);
      setLogoUrl(result.dataUrl);
      setLogoVisible(true);
      setSaveError("");
      if (result.convertedFromSvg) {
        setDraftStatus("SVG logo converted to PNG for PDF compatibility");
        if (clearStatusTimeoutRef.current) {
          window.clearTimeout(clearStatusTimeoutRef.current);
        }
        clearStatusTimeoutRef.current = window.setTimeout(() => {
          setDraftStatus("");
        }, 1800);
      }
    } catch (_error) {
      setSaveError("Couldn't read that logo file.");
    }
    event.target.value = "";
  };

  const handleLogoRemove = () => {
    setLogoUrl(null);
    setLogoVisible(true);
  };

  const handleAccentColorChange = (nextColor) => {
    setAccentColor(normalizeAccentColor(nextColor));
  };

  const buildRewriteInvoicePayload = () => {
    const itemsWithDescriptions = lineItems.filter((item) => item.description.trim().length > 0);
    if (itemsWithDescriptions.length === 0) {
      return { error: "Add at least one line item description before rewriting." };
    }
    const invoice = {
      invoiceNumber: invoiceNumber?.trim() || undefined,
      issueDate: invoiceDate || undefined,
      customerName: billToDetails?.trim() || undefined,
      currency: "USD",
      lineItems: itemsWithDescriptions.map((item) => ({
        id: item.id,
        type: "other",
        description: polishLineItemDescription(item.description),
        quantity: item.qty === "" ? undefined : parseNumber(item.qty),
        unitPrice: item.rate === "" ? undefined : parseNumber(item.rate),
        amount: getLineAmount(item)
      })),
      notes: notes?.trim() || undefined,
      subtotal,
      total,
      balanceDue: total
    };
    return { invoice };
  };

  const buildEditableInvoicePayload = () => {
    const itemsWithDescriptions = lineItems.filter((item) => item.description.trim().length > 0);
    if (itemsWithDescriptions.length === 0) {
      return { error: "Add at least one line item description before using Edit with Billie." };
    }
    const invoice = {
      invoiceNumber: invoiceNumber?.trim() || undefined,
      issueDate: invoiceDate || undefined,
      customerName: billToDetails?.trim() || undefined,
      currency: "USD",
      lineItems: itemsWithDescriptions.map((item) => ({
        id: item.id,
        type: "other",
        description: polishLineItemDescription(item.description),
        quantity: item.qty === "" ? undefined : parseNumber(item.qty),
        unitPrice: item.rate === "" ? undefined : parseNumber(item.rate),
        amount: getLineAmount(item)
      })),
      notes: notes?.trim() || undefined,
      subtotal,
      total,
      balanceDue: total
    };
    return { invoice };
  };

  const buildPdfExportPayload = () => {
    const editableResult = buildEditableInvoicePayload();
    if (editableResult.error) {
      return { error: "Add at least one line item description before downloading PDF." };
    }
    return {
      payload: {
        invoice: editableResult.invoice,
        fromDetails: fromDetails?.trim() || undefined,
        billToDetails: billToDetails?.trim() || undefined,
        accentColor,
        stylePreset,
        logoUrl: logoUrl ?? undefined,
        logoVisible,
        headerLayout
      }
    };
  };

  const applyAiEdit = (updatedInvoice) => {
    if (!updatedInvoice) {
      return;
    }
    if (updatedInvoice.invoiceNumber !== undefined) {
      setInvoiceNumber(updatedInvoice.invoiceNumber ?? "");
    }
    if (updatedInvoice.issueDate !== undefined) {
      setInvoiceDate(updatedInvoice.issueDate ?? "");
    }
    if (updatedInvoice.customerName !== undefined) {
      setBillToDetails(updatedInvoice.customerName ?? "");
    }
    if (updatedInvoice.notes !== undefined) {
      setNotes(updatedInvoice.notes ?? "");
    }
    if (Array.isArray(updatedInvoice.lineItems) && updatedInvoice.lineItems.length > 0) {
      setLineItems(
        updatedInvoice.lineItems.map((item, index) => ({
          id: item.id ?? `line-${Date.now()}-${index}`,
          description: polishLineItemDescription(item.description ?? ""),
          qty: Number.isFinite(item.quantity) ? String(item.quantity) : "",
          rate: Number.isFinite(item.unitPrice) ? String(item.unitPrice) : ""
        }))
      );
    }
  };

  const applyRewriteChanges = ({ lineItems: rewrittenLines, notes: rewrittenNotes, mode }) => {
    if (Array.isArray(rewrittenLines) && rewrittenLines.length > 0) {
      setLineItems((prev) =>
        prev.map((item, index) => {
          const match =
            rewrittenLines.find((line) => line.id && line.id === item.id) ?? rewrittenLines[index];
          if (match && typeof match.description === "string") {
            return { ...item, description: polishLineItemDescription(match.description) };
          }
          return item;
        })
      );
    }
    if (mode === "full" && typeof rewrittenNotes === "string") {
      setNotes(rewrittenNotes);
    }
  };

  const persistDraft = () => {
    const payload = {
      invoiceNumber,
      invoiceDate,
      fromDetails,
      billToDetails,
      notes,
      taxRate,
      lineItems,
      logoUrl,
      logoVisible,
      headerLayout,
      stylePreset,
      accentColor,
      savedInvoiceId
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  };

  useEffect(() => {
    if (initialDraft) {
      setDraftStatus(draftStatusLabel);
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 2000);
    }
  }, [initialDraft, draftStatusLabel]);

  useEffect(() => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      persistDraft();
      setDraftStatus("Draft saved");
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 1500);
    }, 500);
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    invoiceNumber,
    invoiceDate,
    fromDetails,
    billToDetails,
    notes,
    taxRate,
    lineItems,
    logoUrl,
    stylePreset,
    accentColor,
    savedInvoiceId
  ]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const exportPayload = buildPdfExportPayload();
    if (exportPayload.error) {
      setSaveError(exportPayload.error);
      setSaveStatus("");
      return;
    }
    try {
      setSaveError("");
      const response = await apiFetch("/api/invoices/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportPayload.payload)
      });
      const responsePayload = await response
        .clone()
        .json()
        .catch(() => null);
      if (!response.ok) {
        throw new Error(responsePayload?.error || "Couldn't export PDF.");
      }
      const pdfBlob = await response.blob();
      const objectUrl = window.URL.createObjectURL(pdfBlob);
      const safeNumber = invoiceNumber?.trim() ? invoiceNumber.trim() : "Draft";
      const filenameSuffix =
        safeNumber
          .replace(/[^a-zA-Z0-9_-]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || "Draft";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `Invoice-${filenameSuffix}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
      setDraftStatus("PDF download started");
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 1800);
    } catch (error) {
      setSaveError(error?.message || "Couldn't export PDF.");
      setSaveStatus("");
    }
  };

  const buildStructuredInvoiceFromDraft = () => ({
    customerName: billToDetails?.trim() || undefined,
    invoiceNumber: invoiceNumber?.trim() || undefined,
    issueDate: invoiceDate || undefined,
    servicePeriodStart: undefined,
    servicePeriodEnd: undefined,
    workSessions: [],
    materials: [],
    notes: notes?.trim() || undefined
  });

  const handleSaveInvoice = async () => {
    const editableResult = buildEditableInvoicePayload();
    if (editableResult.error) {
      setSaveError("Add at least one line item description before saving.");
      setSaveStatus("");
      setSaveNeedsAuth(false);
      return;
    }
    const currentSession = requestIdentity.getAuthSession?.() ?? authSession;
    if (saveAuthRequiredPolicy && !currentSession?.userId) {
      setSaveNeedsAuth(true);
      setSaveError("Sign in required to save invoices.");
      setSaveStatus("");
      return;
    }
    setSaveError("");
    setSaveNeedsAuth(false);
    setSaveStatus(savedInvoiceId ? "Updating..." : "Saving...");
    try {
      const response = await apiFetch("/api/invoices/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmSave: true,
          invoiceId: savedInvoiceId || undefined,
          sourceType: "text_input",
          invoiceData: {
            structuredInvoice: buildStructuredInvoiceFromDraft(),
            finishedInvoice: editableResult.invoice
          }
        })
      });
      if (!response.ok) {
        let apiErrorMessage = "Save failed";
        try {
          const errorPayload = await response.json();
          if (typeof errorPayload?.error === "string" && errorPayload.error.trim()) {
            apiErrorMessage = errorPayload.error.trim();
          }
        } catch (_error) {
          // Keep fallback message.
        }
        const apiError = new Error(apiErrorMessage);
        apiError.status = response.status;
        throw apiError;
      }
      const payload = await response.json();
      const nextId = payload?.invoice?.invoiceId ?? "";
      if (nextId) {
        setSavedInvoiceId(nextId);
      }
      rememberClientDetails(billToDetails);
      setSavedLineItemLibrary(rememberLineItems(editableResult.invoice.lineItems));
      setSaveNeedsAuth(false);
      setSaveStatus("Saved");
      window.setTimeout(() => setSaveStatus(""), 1500);
    } catch (error) {
      console.error("Failed to save invoice", error);
      const status = Number(error?.status ?? error?.statusCode ?? 0);
      if (status === 401) {
        setSaveNeedsAuth(true);
        setSaveError("Sign in required to save invoices.");
      } else {
        setSaveNeedsAuth(false);
        setSaveError("Save failed. Try again.");
      }
      setSaveStatus("");
    }
  };

  const isMobileInspectorOpen = inspectorOpen;
  const invoiceInteractionClass = isMobileInspectorOpen
    ? "pointer-events-none select-none opacity-60 md:pointer-events-auto md:opacity-100"
    : "";
  const mobileInspectorTabs = [
    { id: "style", label: "Style", icon: "✨" },
    { id: "tone", label: "Tone", icon: "🎙️" },
    { id: "assistant", label: "Billie Edit", icon: "✍️" },
    { id: "export", label: "Export", icon: "⬇️" }
  ];
  const activeMobileTabLabel =
    mobileInspectorTabs.find((tab) => tab.id === activeInspectorTab)?.label ?? "Tools";

  const refreshAuthSessionState = async (shouldApply = () => true) => {
    try {
      const session = await requestIdentity.refreshSession();
      if (shouldApply()) {
        setAuthSession(session);
      }
      return session;
    } catch (_error) {
      if (shouldApply()) {
        setAuthSession(null);
      }
      return null;
    }
  };

  const refreshSaveAuthPolicy = async (shouldApply = () => true) => {
    try {
      const response = await apiFetch("/api/system/persistence");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load persistence policy.");
      }
      const authRequired = Boolean(payload?.authRequired);
      if (shouldApply()) {
        setSaveAuthRequiredPolicy(authRequired);
      }
      return authRequired;
    } catch (_error) {
      if (shouldApply()) {
        setSaveAuthRequiredPolicy(false);
      }
      return false;
    }
  };

  const handleSaveAuthRetry = async () => {
    const session = await refreshAuthSessionState();
    const authRequired = await refreshSaveAuthPolicy();
    if (authRequired && !session?.userId) {
      setSaveNeedsAuth(true);
      setSaveError("Sign in required to save invoices.");
      setSaveStatus("");
      return;
    }
    await handleSaveInvoice();
  };

  useEffect(() => {
    let active = true;
    refreshAuthSessionState(() => active).then((session) => {
      if (!active) {
        return;
      }
      if (!session) {
        setAuthSession(null);
      }
    });
    void refreshSaveAuthPolicy(() => active);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initialDraftMeta?.fromLegacy || !initialDraft) {
      return;
    }
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(initialDraft));
      window.localStorage.removeItem(legacyDraftStorageKey);
    } catch (_error) {
      // Best-effort migration only.
    }
  }, [draftStorageKey, legacyDraftStorageKey, initialDraftMeta, initialDraft]);

  return (
    <div className="min-h-screen bg-slate-50" style={{ backgroundImage: `radial-gradient(circle at top, ${accent.muted} 0%, rgba(248,250,252,0) 46%)` }}>
      <main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 pb-24 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-6 md:pb-8">
        <div className="mb-4 flex items-center justify-between gap-3 md:col-span-2 no-print">
          <button
            type="button"
            className="text-sm font-semibold text-slate-700"
            onClick={() => {
              persistDraft();
              navigate("/");
            }}
          >
            &larr; Back
          </button>
          <button
            type="button"
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            onClick={() => navigate("/")}
          >
            {authSession?.email ? `Account: ${authSession.email}` : "Account: local mode"}
          </button>
        </div>
        <div
          className={`printable-invoice relative w-full overflow-hidden rounded-2xl border p-6 ${activePreset.shellClass} ${invoiceInteractionClass}`}
          style={{ borderColor: accent.border }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24"
            style={{ background: `linear-gradient(180deg, ${accent.soft} 0%, rgba(255,255,255,0) 100%)` }}
          />
          <div className={`relative ${activePreset.sectionGap}`}>
            <div className={`flex items-center justify-between ${activePreset.metaClass}`}>
              <span>Invoice Document</span>
              <span className="flex items-center gap-2">
                {draftStatus ? <span className="text-xs text-slate-400">{draftStatus}</span> : null}
                <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: accent.border, color: accent.primary }}>
                  Draft
                </span>
              </span>
            </div>
            <div
              className="h-1 w-full rounded-full"
              style={{ backgroundColor: accent.soft, boxShadow: `inset 0 0 0 1px ${accent.border}` }}
            />
            <div className="hidden justify-end gap-2 no-print md:flex">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm font-semibold"
                style={accentGhostButtonStyle}
                onClick={() => {
                  setActiveInspectorTab("assistant");
                  setInspectorOpen(true);
                }}
              >
                Edit with Billie
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setInspectorOpen(true)}
              >
                Customize / Export
              </button>
            </div>

            <header className="space-y-5" data-header-layout={headerLayout}>
              {logoUrl && logoVisible ? (
                <div className={`flex ${headerLayout === "centered" ? "justify-center" : "items-center"}`}>
                  <img
                    src={logoUrl}
                    alt="Company logo"
                    className="h-12 w-auto max-w-[200px] object-contain"
                  />
                </div>
              ) : null}
              <div
                className={`flex flex-wrap gap-4 ${
                  headerLayout === "centered"
                    ? "flex-col items-center text-center"
                    : "items-start justify-between"
                }`}
              >
                <div>
                  <h1 className={activePreset.titleClass}>INVOICE</h1>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: accent.primary }}>
                    NoteBill · prepared with Billie
                  </p>
                </div>
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <label className={`${activePreset.textClass} ${activePreset.labelClass} flex items-center gap-3`}>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Invoice #</span>
                    <input
                      type="text"
                      className={`min-w-[150px] ${activePreset.inputClass} ${activePreset.textClass}`}
                      value={invoiceNumber}
                      onChange={(event) => setInvoiceNumber(event.target.value)}
                    />
                  </label>
                  <label className={`${activePreset.textClass} ${activePreset.labelClass} flex items-center gap-3`}>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Date</span>
                    <input
                      type="date"
                      className={`min-w-[150px] ${activePreset.inputClass} ${activePreset.textClass}`}
                      value={invoiceDate}
                      onChange={(event) => setInvoiceDate(event.target.value)}
                    />
                  </label>
                </div>
              </div>
            </header>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>From</p>
                <textarea
                  rows={3}
                  className={`w-full resize-none ${activePreset.inputClass} ${activePreset.textClass}`}
                  placeholder="Your Name / Company"
                  value={fromDetails}
                  onChange={(event) => setFromDetails(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>Bill To</p>
                <textarea
                  rows={3}
                  className={`w-full resize-none ${activePreset.inputClass} ${activePreset.textClass}`}
                  placeholder="Client Name"
                  value={billToDetails}
                  onChange={(event) => setBillToDetails(event.target.value)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="overflow-x-auto">
                <table className={`min-w-full text-left ${activePreset.textClass}`}>
                  <thead className={activePreset.tableHeadClass}>
                    <tr>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-3 pl-2">Description</th>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-3">Qty</th>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-3">Rate</th>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item) => (
                      <tr key={item.id} className="odd:bg-slate-50/70">
                        <td className="py-3 pr-3 pl-2 align-top">
                          <input
                            type="text"
                            className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                            placeholder="Description"
                            value={item.description}
                            onChange={(event) =>
                              handleLineItemChange(item.id, "description", event.target.value)
                            }
                            onBlur={() => handleLineItemDescriptionBlur(item.id)}
                          />
                        </td>
                        <td className="py-3 pr-3 align-top">
                          <input
                            type="number"
                            className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                            placeholder="0"
                            value={item.qty}
                            onChange={(event) =>
                              handleLineItemChange(item.id, "qty", event.target.value)
                            }
                          />
                        </td>
                        <td className="py-3 pr-3 align-top">
                          <input
                            type="number"
                            className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                            placeholder="$0"
                            value={item.rate}
                            onChange={(event) =>
                              handleLineItemChange(item.id, "rate", event.target.value)
                            }
                          />
                        </td>
                        <td className="py-3 pr-2 text-right align-top text-slate-600 tabular-nums">
                          {item.qty !== "" && item.rate !== "" ? (
                            formatMoney(getLineAmount(item))
                          ) : (
                            <span className="text-xs font-semibold text-amber-600">Needs value</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className={`${activePreset.textClass} font-semibold`}
                style={{ color: accent.primary }}
                onClick={handleAddLineItem}
              >
                + Add line item
              </button>
              {savedLineItemLibrary.length > 0 ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <button
                    type="button"
                    className="text-sm font-semibold"
                    style={{ color: accent.primary }}
                    onClick={() => setShowSavedLineItems((value) => !value)}
                  >
                    {showSavedLineItems ? "Hide saved items" : `Saved items (${savedLineItemLibrary.length})`}
                  </button>
                  {showSavedLineItems ? (
                    <div className="flex flex-wrap gap-2">
                      {savedLineItemLibrary.slice(0, 8).map((entry) => (
                        <button
                          key={entry.lookupKey}
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                          onClick={() => handleInsertSavedLineItem(entry)}
                          aria-label={`Insert saved item ${entry.description}`}
                        >
                          <span className="block">{entry.description}</span>
                          {entry.qty || entry.rate ? (
                            <span className="mt-1 block text-xs font-medium text-slate-500">
                              {[entry.qty ? `Qty ${entry.qty}` : "", entry.rate ? `Rate $${entry.rate}` : ""]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="flex justify-end">
              <div
                className={`w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 ${activePreset.textClass}`}
                style={{ borderColor: accent.border, boxShadow: `0 8px 24px -20px ${accent.border}` }}
              >
                <div className={`flex justify-between ${activePreset.totalsMutedClass}`}>
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(subtotal)}</span>
                </div>
                <div className={`flex justify-between ${activePreset.totalsMutedClass}`}>
                  <span className="flex items-center gap-2">
                    Tax
                    <input
                      type="number"
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={taxRate}
                      onChange={(event) => setTaxRate(event.target.value)}
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </span>
                  <span className="tabular-nums">{formatMoney(taxAmount)}</span>
                </div>
                <div className={`flex justify-between font-semibold ${activePreset.totalsStrongClass}`}>
                  <span>Total</span>
                  <span className="tabular-nums" style={{ color: accent.primary }}>{formatMoney(total)}</span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>Notes / Terms</p>
              <textarea
                rows={4}
                className={`w-full resize-none bg-slate-50/70 ${activePreset.inputClass} ${activePreset.textClass}`}
                placeholder="Thank you for your business"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </section>
          </div>
        </div>

        <div className="hidden md:block no-print">
          <InspectorPanel
            activeTab={activeInspectorTab}
            onTabChange={setActiveInspectorTab}
            logoUrl={logoUrl}
            logoVisible={logoVisible}
            headerLayout={headerLayout}
            onLogoChange={handleLogoChange}
            onLogoRemove={handleLogoRemove}
            onLogoVisibilityChange={setLogoVisible}
            onHeaderLayoutChange={setHeaderLayout}
            stylePreset={stylePreset}
            onStylePresetChange={setStylePreset}
            accentColor={accentColor}
            onAccentColorChange={handleAccentColorChange}
            onPrint={handlePrint}
            onDownloadPdf={handleDownloadPdf}
            onSaveInvoice={handleSaveInvoice}
            saveStatus={saveStatus}
            saveError={saveError}
            saveNeedsAuth={saveNeedsAuth}
            onSaveAuthRetry={handleSaveAuthRetry}
            onGoToLauncherSignIn={() => {
              persistDraft();
              navigate("/");
            }}
            savedInvoiceId={savedInvoiceId}
            previewData={previewData}
            toneSource={{ lineItems, notes }}
            onPolishDescriptions={handlePolishDescriptions}
            buildRewriteInvoicePayload={buildRewriteInvoicePayload}
            onApplyRewrite={applyRewriteChanges}
            buildEditableInvoicePayload={buildEditableInvoicePayload}
            onApplyAiEdit={applyAiEdit}
          />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white md:hidden no-print">
        <div className="mx-auto max-w-6xl px-4 py-2">
          <p className="mb-1 text-center text-[11px] font-semibold text-slate-500">
            {isMobileInspectorOpen ? `${activeMobileTabLabel} panel open` : "Invoice tools"}
          </p>
          <div className="flex items-center justify-around">
            {mobileInspectorTabs.map((tab) => {
              const isActive = activeInspectorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`flex min-w-[68px] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    isActive ? "" : "text-slate-500"
                  }`}
                  style={isActive ? accentGhostButtonStyle : undefined}
                  onClick={() => {
                    setActiveInspectorTab(tab.id);
                    setInspectorOpen(true);
                  }}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] leading-none" aria-hidden="true">
                    {tab.icon}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isMobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 md:hidden no-print">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35"
            aria-label="Close tools panel"
            onClick={() => setInspectorOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="text-sm font-semibold text-slate-700">{activeMobileTabLabel}</span>
              <button
                type="button"
                className="text-xs font-semibold text-slate-600"
                onClick={() => setInspectorOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="h-[calc(82vh-44px)] overflow-hidden">
              <InspectorPanel
                activeTab={activeInspectorTab}
                onTabChange={setActiveInspectorTab}
                onClose={() => setInspectorOpen(false)}
                hideInternalTabs
                logoUrl={logoUrl}
                logoVisible={logoVisible}
                headerLayout={headerLayout}
                onLogoChange={handleLogoChange}
                onLogoRemove={handleLogoRemove}
                onLogoVisibilityChange={setLogoVisible}
                onHeaderLayoutChange={setHeaderLayout}
                stylePreset={stylePreset}
                onStylePresetChange={setStylePreset}
                accentColor={accentColor}
                onAccentColorChange={handleAccentColorChange}
                onPrint={handlePrint}
                onDownloadPdf={handleDownloadPdf}
                onSaveInvoice={handleSaveInvoice}
                saveStatus={saveStatus}
                saveError={saveError}
                saveNeedsAuth={saveNeedsAuth}
                onSaveAuthRetry={handleSaveAuthRetry}
                onGoToLauncherSignIn={() => {
                  persistDraft();
                  navigate("/");
                }}
                savedInvoiceId={savedInvoiceId}
                previewData={previewData}
                toneSource={{ lineItems, notes }}
                onPolishDescriptions={handlePolishDescriptions}
                buildRewriteInvoicePayload={buildRewriteInvoicePayload}
                onApplyRewrite={applyRewriteChanges}
                buildEditableInvoicePayload={buildEditableInvoicePayload}
                onApplyAiEdit={applyAiEdit}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

  window.InvoiceManualCanvas = {
    ManualInvoiceCanvas
  };
})();
