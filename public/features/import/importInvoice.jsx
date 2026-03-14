(() => {
  const { useNavigate } = ReactRouterDOM;
  const { useEffect, useState, useRef } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);

  const uiPrimitives = window.InvoiceUIPrimitives;
  if (!uiPrimitives) {
    throw new Error(
      "Missing /ui/primitives.jsx load. Ensure it is loaded before /features/import/importInvoice.jsx."
    );
  }

  const intakeReadinessUtils = window.InvoiceIntakeReadiness;
  if (!intakeReadinessUtils) {
    throw new Error(
      "Missing /features/intake/readiness.js load. Ensure it is loaded before /features/import/importInvoice.jsx."
    );
  }

  const { UploadIcon } = uiPrimitives;
  const { isReadinessDebugEnabled, buildDraftFromFinishedInvoice } = intakeReadinessUtils;

  const businessProfileUtils = window.InvoiceBusinessProfile;
  if (!businessProfileUtils) {
    throw new Error(
      "Missing /utils/businessProfile.js load. Ensure it is loaded before /features/import/importInvoice.jsx."
    );
  }

  const { applyBusinessProfileToDraft } = businessProfileUtils;
  const accountPlanUtils = window.InvoiceAccountPlanUtils;
  if (!accountPlanUtils) {
    throw new Error(
      "Missing /utils/accountPlan.js load. Ensure it is loaded before /features/import/importInvoice.jsx."
    );
  }
  const { formatPlanSummary, getPlanPrelimitWarning, getPlanUpgradeUrl } = accountPlanUtils;
  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/import/importInvoice.jsx."
    );
  }
  const { hasStripeCheckout, startUpgradeCheckout, readBillingNoticeFromUrl } = billingActions;

function ImportInvoice() {
  const navigate = useNavigate();
  const legacyImportSeedStorageKey = "invoiceImportSeed";
  const importSeedStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceImportSeed") ?? legacyImportSeedStorageKey;
  const legacyDraftStorageKey = "invoiceDraft";
  const draftStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? legacyDraftStorageKey;
  const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
  const ocrQualityTips = [
    "Use bright, even lighting with minimal shadows.",
    "Crop tightly to the notes so text fills most of the image.",
    "Keep the camera straight (avoid angled or skewed photos).",
    "Make sure handwriting/text is sharp before extracting."
  ];
  const mapOcrWarningsToActions = (warnings, confidence) => {
    const warningList = Array.isArray(warnings) ? warnings : [];
    const actions = [];
    const seen = new Set();
    const pushAction = (text) => {
      if (!text || seen.has(text)) {
        return;
      }
      seen.add(text);
      actions.push(text);
    };
    warningList.forEach((warning) => {
      const normalized = String(warning).toLowerCase();
      if (
        /very little text|small amount of readable text|modest amount of text|one text line|line breaks/.test(
          normalized
        )
      ) {
        pushAction("Crop tighter so text fills most of the image.");
      }
      if (/hard to read|unclear|could not be read|blurry|blur|faint/.test(normalized)) {
        pushAction("Use brighter, even light and hold steady.");
      }
      if (/angle|angled|skew|tilt|perspective/.test(normalized)) {
        pushAction("Capture straight-on (avoid angle/skew).");
      }
      if (/shadow|glare|reflection/.test(normalized)) {
        pushAction("Reduce glare/shadows by shifting light or angle.");
      }
      if (/handwriting/.test(normalized)) {
        pushAction("Fix unclear handwriting manually before build.");
      }
    });
    if (confidence === "low") {
      pushAction("Verify client, dates, hours, rates, and totals.");
    } else if (confidence === "medium" && actions.length === 0) {
      pushAction("Review key money fields before build.");
    }
    return actions;
  };
  const [selectedFile, setSelectedFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [reviewedText, setReviewedText] = useState("");
  const [ocrWarnings, setOcrWarnings] = useState([]);
  const [ocrConfidence, setOcrConfidence] = useState(null);
  const [ocrConfidenceReasons, setOcrConfidenceReasons] = useState([]);
  const [lowConfidenceConfirmed, setLowConfidenceConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [billingNotice, setBillingNotice] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [accountPlan, setAccountPlan] = useState(null);
  const fileInputRef = useRef(null);

  const supportedExtensions = [".pdf", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"];
  const supportedTypes = [
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "image/png",
    "image/jpeg",
    "image/webp"
  ];
  const imageMimeTypes = ["image/png", "image/jpeg", "image/webp"];
  const hasReviewedText = reviewedText.trim().length > 0;
  const requiresLowConfidenceConfirm = hasReviewedText && ocrConfidence === "low";
  const ocrActionHints = mapOcrWarningsToActions(ocrWarnings, ocrConfidence);
  const ocrDebugEnabled = isReadinessDebugEnabled();
  const planSummary = formatPlanSummary(accountPlan);
  const planLimitReached = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const upgradeUrl = getPlanUpgradeUrl(accountPlan);
  const useStripeUpgradeAction = accountPlan?.plan === "free" && hasStripeCheckout(accountPlan);

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/account/plan")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load account plan.");
        }
        if (cancelled) {
          return;
        }
        setAccountPlan(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setAccountPlan(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpgradeAction = async () => {
    if (!planLimitReached || billingBusy) {
      return;
    }
    setError("");
    setBillingBusy(true);
    try {
      if (useStripeUpgradeAction) {
        await startUpgradeCheckout(accountPlan, {
          successPath: "/import?billing=success",
          cancelPath: "/import?billing=cancelled"
        });
        return;
      }
      if (upgradeUrl) {
        window.open(upgradeUrl, "_blank", "noopener,noreferrer");
        return;
      }
      throw new Error("Upgrade is not configured yet.");
    } catch (upgradeError) {
      setError(upgradeError?.message || "Unable to open upgrade.");
    } finally {
      setBillingBusy(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) {
      return "";
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const isSupportedFile = (file) => {
    if (!file) {
      return false;
    }
    const lowerName = file.name.toLowerCase();
    if (supportedTypes.includes(file.type)) {
      return true;
    }
    return supportedExtensions.some((ext) => lowerName.endsWith(ext));
  };

  const isImageFile = (file) => {
    if (!file) {
      return false;
    }
    const lowerName = file.name.toLowerCase();
    return (
      imageMimeTypes.includes(file.type) ||
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".webp")
    );
  };

  const handleFileSelect = (file) => {
    if (!file) {
      return;
    }
    if (Number.isFinite(file.size) && file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError("File is too large. Max upload size is 8MB.");
      return;
    }
    if (!isSupportedFile(file)) {
      setError("Unsupported file type. Upload PDF, text, or an image.");
      return;
    }
    setError("");
    setReviewedText("");
    setOcrWarnings([]);
    setOcrConfidence(null);
    setOcrConfidenceReasons([]);
    setLowConfidenceConfirmed(false);
    setSelectedFile(file);
  };

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0];
    handleFileSelect(nextFile);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setReviewedText("");
    setOcrWarnings([]);
    setOcrConfidence(null);
    setOcrConfidenceReasons([]);
    setLowConfidenceConfirmed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    const nextFile = event.dataTransfer?.files?.[0];
    handleFileSelect(nextFile);
  };

  const handleParsedIntakePayload = (payload, options = {}) => {
    const nextOpenDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
    const qualityBlockerCount = Number.isFinite(payload?.qualityGate?.blockerCount)
      ? Math.max(0, Math.floor(payload.qualityGate.blockerCount))
      : 0;
    if (payload?.needsFollowUp || nextOpenDecisions.length > 0 || qualityBlockerCount > 0) {
      const seed = {
        fileName: options.fileName ?? "",
        notes: options.notes ?? "",
        sourceText: options.sourceText ?? "",
        payload: {
          needsFollowUp: Boolean(payload?.needsFollowUp),
          followUp: payload?.followUp ?? null,
          structuredInvoice: payload?.structuredInvoice ?? null,
          invoice: payload?.invoice ?? null,
          openDecisions: nextOpenDecisions,
          assumptions: Array.isArray(payload?.assumptions) ? payload.assumptions : [],
          unparsedLines: Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [],
          qualityGate: payload?.qualityGate ?? null,
          auditStatus: payload?.auditStatus ?? null
        }
      };
      window.localStorage.setItem(importSeedStorageKey, JSON.stringify(seed));
      navigate("/ai-intake");
      return;
    }
    if (!payload?.invoice) {
      throw new Error("Import parsed, but no invoice data was returned.");
    }
    const draft = applyBusinessProfileToDraft(
      buildDraftFromFinishedInvoice(payload.invoice, { taxRate: "0" })
    );
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    navigate("/manual");
  };

  const handleExtractText = async () => {
    if (!selectedFile) {
      setError("Upload an image file first.");
      return;
    }
    if (!isImageFile(selectedFile)) {
      setError("Text extraction is only for image uploads.");
      return;
    }
    setIsExtracting(true);
    setError("");
    setOcrWarnings([]);
    setOcrConfidence(null);
    setOcrConfidenceReasons([]);
    setLowConfidenceConfirmed(false);
    try {
      const formData = new FormData();
      formData.append("invoiceFile", selectedFile);
      const response = await apiFetch("/api/invoices/extract-notes", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Could not extract text from image.");
      }
      const extractedText = typeof payload?.extractedText === "string" ? payload.extractedText.trim() : "";
      if (!extractedText) {
        throw new Error("No readable text found in the image. Try a clearer image.");
      }
      const nextConfidence =
        payload?.confidence === "high" || payload?.confidence === "medium" || payload?.confidence === "low"
          ? payload.confidence
          : null;
      const nextConfidenceReasons = Array.isArray(payload?.confidenceReasons)
        ? payload.confidenceReasons.filter((reason) => typeof reason === "string" && reason.trim().length > 0)
        : [];
      setReviewedText(extractedText);
      setOcrWarnings(Array.isArray(payload?.warnings) ? payload.warnings : []);
      setOcrConfidence(nextConfidence);
      setOcrConfidenceReasons(nextConfidenceReasons);
      setLowConfidenceConfirmed(false);
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent("invoice:ocr-metrics", {
            detail: {
              confidence: nextConfidence,
              confidenceReasons: nextConfidenceReasons,
              warningCount: Array.isArray(payload?.warnings) ? payload.warnings.length : 0
            }
          })
        );
      }
    } catch (uploadError) {
      console.error("Image text extraction failed", uploadError);
      setError(uploadError?.message || "Could not extract text from image.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handlePreviewUploadText = async () => {
    if (!selectedFile) {
      setError("Upload a document file first.");
      return;
    }
    if (isImageFile(selectedFile)) {
      setError("Use Extract text for image uploads.");
      return;
    }
    setIsExtracting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("invoiceFile", selectedFile);
      const response = await apiFetch("/api/invoices/extract-upload-text", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Could not preview extracted text.");
      }
      const extractedText = typeof payload?.extractedText === "string" ? payload.extractedText.trim() : "";
      if (!extractedText) {
        throw new Error("No readable text found in the document.");
      }
      setReviewedText(extractedText);
    } catch (uploadError) {
      console.error("Document text preview failed", uploadError);
      setError(uploadError?.message || "Could not preview extracted text.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleBuildFromReviewedText = async () => {
    if (!selectedFile) {
      setError("Upload a file first.");
      return;
    }
    const extractedText = reviewedText.trim();
    if (!extractedText) {
      setError("Review the extracted text before building the draft.");
      return;
    }
    if (isImageFile(selectedFile) && ocrConfidence === "low" && !lowConfidenceConfirmed) {
      setError("Confirm low-confidence OCR text before building the draft.");
      return;
    }
    setIsUploading(true);
    setError("");
    try {
      const trimmedNotes = notes.trim();
      const response = await apiFetch("/api/invoices/from-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadedInvoiceText: extractedText,
          messyInput: trimmedNotes || undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Build draft failed.");
      }
      const seedSourceText = [extractedText, trimmedNotes].filter(Boolean).join("\n\n").trim();
      handleParsedIntakePayload(payload, {
        fileName: selectedFile.name,
        notes: trimmedNotes,
        sourceText: seedSourceText
      });
    } catch (uploadError) {
      console.error("Build from reviewed text failed", uploadError);
      setError(uploadError?.message || "Build draft failed. Try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Upload a file first.");
      return;
    }
    if (isImageFile(selectedFile)) {
      setError("Extract and review text first for image uploads.");
      return;
    }
    setIsUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("invoiceFile", selectedFile);
      const trimmedNotes = notes.trim();
      if (trimmedNotes) {
        formData.append("messyInput", trimmedNotes);
      }
      const response = await apiFetch("/api/invoices/from-input", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Upload failed.");
      }
      const seedSourceText = [selectedFile.name ? `Uploaded invoice: ${selectedFile.name}.` : "", trimmedNotes]
        .filter(Boolean)
        .join(" ")
        .trim();
      handleParsedIntakePayload(payload, {
        fileName: selectedFile.name,
        notes: trimmedNotes,
        sourceText: seedSourceText
      });
    } catch (uploadError) {
      console.error("Upload failed", uploadError);
      setError(uploadError?.message || "Upload failed. Try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="nb-page nb-page--quiet min-h-screen">
      <main className="nb-page-shell nb-page-shell--narrow max-w-3xl py-10">
        <button
          type="button"
          className="nb-btn-ghost"
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            Import invoice
          </p>
          <h1 className="nb-section-title text-2xl">Upload invoice files or photo notes</h1>
          <p className="text-sm text-slate-600">
            PDF/text files can build directly or preview extracted text first. Photo notes require text review before parsing.
          </p>
        </div>
        {planSummary ? (
          <div className="nb-surface nb-surface--muted mt-4 rounded-[26px] px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{planSummary}</p>
            {planWarning && !planLimitReached ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">{planWarning}</p>
            ) : null}
            {planLimitReached ? (
              <p className="mt-1 text-xs text-rose-700">
                New saves are locked on free plan this month. You can still import and edit.
              </p>
            ) : null}
            {planLimitReached && (useStripeUpgradeAction || upgradeUrl) ? (
              useStripeUpgradeAction ? (
                <button
                  type="button"
                  className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800 hover:border-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleUpgradeAction}
                  disabled={billingBusy}
                >
                  {billingBusy ? "Opening..." : "Upgrade plan"}
                </button>
              ) : (
                <a
                  className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800 hover:border-blue-200"
                  href={upgradeUrl}
                >
                  Upgrade plan
                </a>
              )
            ) : null}
          </div>
        ) : null}
        {billingNotice ? (
          <div
            className={`nb-banner mt-4 font-medium ${
              billingNotice.tone === "green"
                ? "nb-banner--success"
                : "nb-banner--warning"
            }`}
          >
            {billingNotice.message}
          </div>
        ) : null}

        <div className="nb-surface nb-surface--elevated mt-6 space-y-6 rounded-[30px] p-6">
          <div
            className={`relative rounded-[28px] border-2 border-dashed px-6 py-8 text-center transition ${
              dragActive ? "border-blue-400 bg-blue-100/60" : "border-slate-200 bg-slate-50/60"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,text/markdown,text/csv,application/json,image/png,image/jpeg,image/webp"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={handleFileChange}
            />
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-800 shadow-sm">
                <UploadIcon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Drop PDF, text, or image notes here
                </p>
                <p className="text-xs text-slate-500">
                  PDF/TXT/CSV/JSON build directly. PNG/JPG/WEBP goes through OCR review first. Max 8MB.
                </p>
              </div>
            </div>
          </div>

          {selectedFile ? (
            <div className="nb-subcard flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-700">
              <div>
                <p className="font-semibold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(selectedFile.size)}</p>
              </div>
              <button
                type="button"
                className="nb-btn-secondary rounded-full px-3 py-1 text-xs"
                onClick={clearFile}
              >
                Remove
              </button>
            </div>
          ) : null}

          {selectedFile && isImageFile(selectedFile) ? (
            <div className="nb-banner nb-banner--warning space-y-3 rounded-[24px] px-4 py-4">
              <p className="text-sm font-semibold text-amber-900">Review extracted text (required)</p>
              <p className="text-xs text-amber-800">
                OCR can miss or alter words. Check this text before building the invoice.
              </p>
              {!hasReviewedText ? (
                  <div className="nb-subcard border-amber-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Better OCR tips
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                    {ocrQualityTips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {ocrConfidence ? (
                <p className="text-xs text-amber-900">
                  OCR confidence:{" "}
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${
                      ocrConfidence === "high"
                        ? "bg-emerald-100 text-emerald-800"
                        : ocrConfidence === "medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {ocrConfidence === "high" ? "High" : ocrConfidence === "medium" ? "Medium" : "Low"}
                  </span>
                </p>
              ) : null}
              {ocrDebugEnabled && ocrConfidenceReasons.length > 0 ? (
                <p className="text-xs text-amber-700">
                  Confidence reasons: {ocrConfidenceReasons.join(", ")}
                </p>
              ) : null}
              {ocrWarnings.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
                  {ocrWarnings.map((warning, index) => (
                    <li key={`ocr-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              {ocrActionHints.length > 0 ? (
                <div className="nb-subcard border-amber-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Recommended fixes
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                    {ocrActionHints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {isExtracting ? (
                <p className="nb-subcard border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                  Reading text from image...
                </p>
              ) : null}
              {hasReviewedText ? (
                <textarea
                  rows={6}
                  className="nb-textarea w-full resize-none border-amber-200 bg-white px-4 py-3"
                  placeholder="Review and edit extracted text if needed."
                  value={reviewedText}
                  onChange={(event) => setReviewedText(event.target.value)}
                  disabled={isExtracting}
                />
              ) : (
                <p className="nb-subcard border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                  Click Extract text, then review before building the draft.
                </p>
              )}
              {requiresLowConfidenceConfirm ? (
                <label className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-300"
                    checked={lowConfidenceConfirmed}
                    onChange={(event) => setLowConfidenceConfirmed(event.target.checked)}
                    disabled={isExtracting || isUploading}
                  />
                  <span>
                    I reviewed the OCR text and understand it may be inaccurate.
                  </span>
                </label>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:border-amber-300 disabled:cursor-not-allowed disabled:text-amber-400"
                  onClick={handleExtractText}
                  disabled={isExtracting || isUploading}
                >
                  {isExtracting ? "Extracting..." : reviewedText ? "Re-extract" : "Extract text"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:border-amber-300 disabled:cursor-not-allowed disabled:text-amber-400"
                  onClick={clearFile}
                  disabled={isExtracting || isUploading}
                >
                  Replace image
                </button>
              </div>
            </div>
          ) : null}

          {selectedFile && !isImageFile(selectedFile) ? (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-4">
              <p className="text-sm font-semibold text-sky-950">Preview extracted text (optional)</p>
              <p className="text-xs text-sky-900">
                Check what Billie will parse before building the draft. You can edit the extracted text if needed.
              </p>
              {isExtracting ? (
                <p className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-sky-900">
                  Reading text from document...
                </p>
              ) : null}
              {hasReviewedText ? (
                <textarea
                  rows={6}
                  className="w-full resize-none rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Review and edit extracted text if needed."
                  value={reviewedText}
                  onChange={(event) => setReviewedText(event.target.value)}
                  disabled={isExtracting || isUploading}
                />
              ) : (
                <p className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-sky-900">
                  Preview extracted text if you want to check it before building the draft.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-900 hover:border-sky-300 disabled:cursor-not-allowed disabled:text-sky-400"
                  onClick={handlePreviewUploadText}
                  disabled={isExtracting || isUploading}
                >
                  {isExtracting ? "Previewing..." : reviewedText ? "Re-preview extracted text" : "Preview extracted text"}
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-sm font-semibold text-slate-900">Optional notes</label>
            <p className="mt-1 text-xs text-slate-500">
              Add any context or pricing notes you want Billie to consider.
            </p>
            <textarea
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Example: This invoice includes a revised hourly rate."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {selectedFile && hasReviewedText ? (
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-800 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={handleBuildFromReviewedText}
                disabled={
                  !selectedFile ||
                  !hasReviewedText ||
                  isUploading ||
                  isExtracting ||
                  (isImageFile(selectedFile) && ocrConfidence === "low" && !lowConfidenceConfirmed)
                }
              >
                {isUploading ? "Building draft..." : "Build draft from reviewed text"}
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-800 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading || isExtracting}
              >
                {isUploading ? "Importing..." : "Build draft"}
              </button>
            )}
              <p className="text-xs text-slate-500">
              {isExtracting
                ? selectedFile && isImageFile(selectedFile)
                  ? "Extracting text from image..."
                  : "Reading text from document..."
                : isUploading
                    ? "Building your draft..."
                  : selectedFile && isImageFile(selectedFile)
                    ? requiresLowConfidenceConfirm
                      ? "Low confidence OCR: review text, re-extract if needed, then confirm."
                      : "Extract text, review it, then build."
                    : hasReviewedText
                      ? "Review the extracted text, then build."
                    : "We’ll open the editor next."}
              </p>
          </div>
        </div>
      </main>
    </div>
  );
}

  window.InvoiceImportFeature = {
    ImportInvoice
  };
})();
