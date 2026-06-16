(() => {
  const PAYMENT_METHOD_KIND_LABELS = {
    cheque: "Cheque",
    etransfer: "E-transfer",
    bank_transfer: "Bank transfer",
    cash: "Cash",
    custom: "Custom"
  };

  const normalizePaymentMethodKind = (value) => {
    const normalized = String(value ?? "").trim();
    return PAYMENT_METHOD_KIND_LABELS[normalized] ? normalized : "custom";
  };

  const getPaymentMethodKindLabel = (kind) =>
    PAYMENT_METHOD_KIND_LABELS[normalizePaymentMethodKind(kind)] || PAYMENT_METHOD_KIND_LABELS.custom;

  const normalizePaymentMethods = (value) =>
    (Array.isArray(value) ? value : [])
      .map((entry, index) => {
        const method = entry && typeof entry === "object" ? entry : {};
        const kind = normalizePaymentMethodKind(method.kind);
        const label = typeof method.label === "string" ? method.label.trim().replace(/\s+/g, " ") : "";
        const detailsSource =
          label
            ? typeof method.details === "string"
              ? method.details.trim()
              : ""
            : typeof method.details === "string"
              ? method.details.trim()
              : "";
        const details = detailsSource.replace(/\r?\n{3,}/g, "\n\n");
        const enabled = method.enabled !== false;
        if (!label && !details && !enabled) {
          return null;
        }
        return {
          id:
            typeof method.id === "string" && method.id.trim()
              ? method.id.trim()
              : `payment-method-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          kind,
          label: label || getPaymentMethodKindLabel(kind) || "Payment method",
          details,
          enabled
        };
      })
      .filter(Boolean);

  const createPaymentMethodEntry = (kind, sourceFromDetails = "", options = {}) => {
    const normalizedKind = normalizePaymentMethodKind(kind);
    const invoiceLabel =
      typeof options?.invoiceLabel === "string" && options.invoiceLabel.trim() ? options.invoiceLabel.trim() : "invoice number";
    const fromLines = String(sourceFromDetails ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const businessName = fromLines[0] || "Your business name";
    const mailingAddress = fromLines.slice(1).join("\n");
    const defaultTemplates = {
      cheque: {
        label: "Cheque",
        details:
          mailingAddress.length > 0
            ? `Make cheque payable to ${businessName}.\nMail to:\n${mailingAddress}\nInclude ${invoiceLabel} in the memo or note.`
            : `Make cheque payable to ${businessName}.\nMail to:\n[mailing address]\nInclude ${invoiceLabel} in the memo or note.`
      },
      etransfer: {
        label: "E-transfer",
        details: `Send the e-transfer to:\n[etransfer email]\nMemo: ${invoiceLabel}\nSecurity answer: [optional]`
      },
      bank_transfer: {
        label: "Bank transfer",
        details: "Use the bank transfer instructions provided on the invoice or in your client portal."
      },
      cash: {
        label: "Cash",
        details: "Cash accepted in person when the job is complete."
      },
      custom: {
        label: "Custom",
        details: "Add custom payment instructions here."
      }
    };
    const template = defaultTemplates[normalizedKind] ?? defaultTemplates.custom;
    return {
      id: `payment-method-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: normalizedKind,
      label: template.label,
      details: template.details
    };
  };

  const createPaymentInstructionsStarterSet = (sourceFromDetails = "") => [
    createPaymentMethodEntry("cheque", sourceFromDetails),
    createPaymentMethodEntry("etransfer", sourceFromDetails),
    createPaymentMethodEntry("bank_transfer", sourceFromDetails),
    createPaymentMethodEntry("cash", sourceFromDetails)
  ];

  const formatPaymentMethodSummary = (method) => {
    const kind = normalizePaymentMethodKind(method?.kind);
    const label = typeof method?.label === "string" && method.label.trim() ? method.label.trim() : getPaymentMethodKindLabel(kind);
    const details = typeof method?.details === "string" ? method.details.trim() : "";
    return details ? `${label}: ${details.replace(/\n+/g, " | ")}` : label;
  };

  const getPaymentMethodDisplayData = (method) => {
    const kind = normalizePaymentMethodKind(method?.kind);
    const label = typeof method?.label === "string" && method.label.trim() ? method.label.trim() : getPaymentMethodKindLabel(kind);
    const details = typeof method?.details === "string" ? method.details.trim() : "";
    return {
      kind,
      label,
      details,
      hasDetails: details.length > 0
    };
  };

  window.InvoicePaymentMethods = {
    PAYMENT_METHOD_KIND_LABELS,
    normalizePaymentMethodKind,
    normalizePaymentMethods,
    createPaymentMethodEntry,
    createPaymentInstructionsStarterSet,
    getPaymentMethodKindLabel,
    formatPaymentMethodSummary,
    getPaymentMethodDisplayData
  };
})();
