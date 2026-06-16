(() => {
  const normalizeEstimateReviewState = (value) => {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  };

  const getInvoiceDocumentType = (invoice) =>
    invoice?.documentType === "estimate" || invoice?.invoiceData?.finishedInvoice?.documentType === "estimate"
      ? "estimate"
      : "invoice";

  const getEstimateReviewState = (invoice) =>
    typeof invoice?.invoiceData?.finishedInvoice?.estimateReviewState === "string"
      ? invoice.invoiceData.finishedInvoice.estimateReviewState.trim().toLowerCase()
      : typeof invoice?.estimateReviewState === "string"
        ? invoice.estimateReviewState.trim().toLowerCase()
        : "";

  const parseTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const buildEstimateWorkflowSummary = (invoice) => {
    const documentType = getInvoiceDocumentType(invoice);
    const reviewState = normalizeEstimateReviewState(
      invoice?.invoiceData?.finishedInvoice?.estimateReviewState ?? invoice?.estimateReviewState ?? ""
    );
    const convertedFromEstimateAt = invoice?.invoiceData?.finishedInvoice?.convertedFromEstimateAt ?? "";
    const convertedAtMs = parseTimestamp(convertedFromEstimateAt);
    const isEstimate = documentType === "estimate";
    const isConverted = Number.isFinite(convertedAtMs) && convertedAtMs > 0;
    const isApproved = reviewState === "approved";
    const needsReview = reviewState === "needs_review";

    const statusLabel = isConverted
      ? "Converted estimate"
      : isEstimate
        ? isApproved
          ? "Approved estimate"
          : needsReview
            ? "Estimate needs review"
            : "Estimate saved"
        : "Invoice ready";
    const statusTone = isConverted || isApproved ? "success" : needsReview ? "warning" : "soft";
    const nextStepLabel = isConverted
      ? "Next step: keep the working invoice moving."
      : isApproved
        ? "Next step: convert it into a draft invoice when the work is ready to bill."
        : needsReview
          ? "Next step: reopen it with Billie and tidy the missing pieces."
          : isEstimate
            ? "Next step: review it with Billie before converting."
            : "Next step: keep the invoice moving forward.";
    const primaryActionLabel = isConverted
      ? "Open converted invoice"
      : isApproved
        ? "Convert to invoice"
        : "Open with Billie";
    const secondaryActionLabel = isConverted
      ? "Open with Billie"
      : isApproved
        ? "Mark needs review"
        : "Mark approved";
    const actionHint = isConverted
      ? "The converted invoice is already moving. Open it if you need to keep editing."
      : isApproved
        ? "The estimate is approved, so the clean next move is to convert it when the work is ready to bill."
        : needsReview
          ? "The estimate still needs a cleanup pass before conversion."
          : "Keep the estimate in review until the details are ready.";

    return {
      documentType,
      reviewState,
      convertedFromEstimateAt,
      isEstimate,
      isConverted,
      isApproved,
      needsReview,
      statusLabel,
      statusTone,
      nextStepLabel,
      primaryActionLabel,
      secondaryActionLabel,
      actionHint
    };
  };

  window.InvoiceEstimateWorkflowUtils = {
    buildEstimateWorkflowSummary,
    getInvoiceDocumentType,
    getEstimateReviewState,
    normalizeEstimateReviewState
  };
})();
