(() => {
  const toText = (value) => (typeof value === "string" ? value.trim() : "");

  const countTasks = (workSessions = []) =>
    Array.isArray(workSessions)
      ? workSessions.reduce((total, session) => total + (Array.isArray(session?.tasks) ? session.tasks.length : 0), 0)
      : 0;

  const buildImportCoverageSummary = (importStudioContext) => {
    if (!importStudioContext) {
      return null;
    }
    return {
      captured: [
        importStudioContext.fileName ? `File: ${importStudioContext.fileName}` : null,
        importStudioContext.preview ? "Source preview loaded" : null,
        "Original text stays available for cleanup"
      ].filter(Boolean),
      cleanup: [
        `${importStudioContext.openDecisionCount} decision${importStudioContext.openDecisionCount === 1 ? "" : "s"} pending`,
        `${importStudioContext.unparsedCount} uncaptured line${importStudioContext.unparsedCount === 1 ? "" : "s"}`,
        `${importStudioContext.assumptionCount} assumption${importStudioContext.assumptionCount === 1 ? "" : "s"}`,
        importStudioContext.qualityBlockerCount > 0
          ? `${importStudioContext.qualityBlockerCount} quality blocker${importStudioContext.qualityBlockerCount === 1 ? "" : "s"}`
          : null,
        importStudioContext.needsFollowUp ? "Missing money details still need a reply" : null
      ].filter(Boolean)
    };
  };

  const buildImportDraftComparison = (structuredInvoice, finishedInvoice, importStudioContext) => {
    if (!importStudioContext) {
      return null;
    }
    const sourceSessions = Array.isArray(structuredInvoice?.workSessions)
      ? structuredInvoice.workSessions
          .map((session, index) => {
            const date = toText(session?.date);
            const taskCount = Array.isArray(session?.tasks) ? session.tasks.length : 0;
            const taskPreview = Array.isArray(session?.tasks)
              ? session.tasks.map((task) => toText(task?.description)).filter(Boolean).slice(0, 2)
              : [];
            return date
              ? {
                  id: `source-session-${index}`,
                  date,
                  taskCount,
                  taskPreview
                }
              : null;
          })
          .filter(Boolean)
      : [];
    const sourceSessionCount = Array.isArray(structuredInvoice?.workSessions) ? structuredInvoice.workSessions.length : 0;
    const sourceTaskCount = countTasks(structuredInvoice?.workSessions);
    const draftLineItems = Array.isArray(finishedInvoice?.lineItems)
      ? finishedInvoice.lineItems
          .map((item, index) => {
            const description = toText(item?.description) || `Line item ${index + 1}`;
            const quantity = Number.isFinite(item?.quantity) ? Number(item.quantity) : null;
            const unitPrice = Number.isFinite(item?.unitPrice) ? Number(item.unitPrice) : null;
            const amount = Number.isFinite(item?.amount) ? Number(item.amount) : null;
            const parts = [];
            if (quantity !== null && unitPrice !== null) {
              parts.push(`${quantity} x ${unitPrice}`);
            } else if (quantity !== null) {
              parts.push(`Qty ${quantity}`);
            } else if (unitPrice !== null) {
              parts.push(`Rate ${unitPrice}`);
            }
            if (amount !== null) {
              parts.push(`Total ${amount}`);
            }
            return {
              id: item?.id ?? `draft-line-${index}`,
              description,
              detail: parts.join(" | ")
            };
          })
          .filter(Boolean)
      : [];
    const draftLineItemCount = Array.isArray(finishedInvoice?.lineItems) ? finishedInvoice.lineItems.length : 0;
    const pairedRowCount = Math.min(sourceSessionCount, draftLineItemCount);
    const sourceDraftRowGapCount = Math.max(0, Math.abs(sourceSessionCount - draftLineItemCount));
    const taskCoverageRatio =
      sourceTaskCount > 0 ? Math.min(100, Math.round((draftLineItemCount / Math.max(sourceTaskCount, 1)) * 100)) : 0;
    const sourceCoverageCount = Array.isArray(structuredInvoice?.workSessions)
      ? structuredInvoice.workSessions.reduce((total, session) => {
          const taskCount = Array.isArray(session?.tasks) ? session.tasks.length : 0;
          const coveredTasks = taskCount > 0 ? 1 : 0;
          return total + coveredTasks;
        }, 0)
      : 0;
    const sourceCoverageGapCount = Array.isArray(structuredInvoice?.workSessions)
      ? Math.max(0, sourceSessionCount - sourceCoverageCount)
      : 0;
    const clientName =
      toText(finishedInvoice?.customerName) || toText(structuredInvoice?.customerName) || "";
    const lineItemCount = draftLineItemCount;
    const noteCount = toText(finishedInvoice?.notes) ? 1 : 0;
    const totalValue = Number(finishedInvoice?.total);
    const totalLabel = Number.isFinite(totalValue)
      ? (() => {
          const currencyCode =
            toText(finishedInvoice?.currency).length === 3 ? toText(finishedInvoice.currency).toUpperCase() : "USD";
          try {
            return new Intl.NumberFormat([], { style: "currency", currency: currencyCode }).format(totalValue);
          } catch (_error) {
            return totalValue.toFixed(2);
          }
        })()
      : "";
    const statusLabel = finishedInvoice
      ? finishedInvoice.status === "estimate"
        ? "Estimate draft"
        : finishedInvoice.status === "partial"
          ? "Partial payment draft"
          : "Invoice draft"
      : "Waiting for the cleaned draft";

    return {
      sourceSessions,
      sourceSessionCount,
      sourceTaskCount,
      draftLineItems,
      draftLineItemCount,
      pairedRowCount,
      sourceDraftRowGapCount,
      taskCoverageRatio,
      sourceCoverageCount,
      sourceCoverageGapCount,
      clientName,
      lineItemCount,
      noteCount,
      totalLabel,
      statusLabel
    };
  };

  const buildImportCleanupReadinessLabel = (taskCoverageRatio) =>
    taskCoverageRatio >= 100
      ? "Cleanup looks complete enough to send."
      : taskCoverageRatio >= 75
        ? "Cleanup is close, but one more review pass would help."
        : taskCoverageRatio >= 50
          ? "Cleanup is halfway there, so keep the source close."
          : "Cleanup still needs real attention before it feels safe.";

  const buildImportSourceCoverageLabel = (sourceCoverageCount, sourceSessionCount) =>
    sourceSessionCount > 0 ? `${sourceCoverageCount}/${sourceSessionCount} sessions covered` : "No source sessions covered yet";

  const buildImportSourceCoverageGapLabel = (sourceCoverageGapCount) =>
    sourceCoverageGapCount > 0
      ? `${sourceCoverageGapCount} more session${sourceCoverageGapCount === 1 ? "" : "s"} ${
          sourceCoverageGapCount === 1 ? "still needs" : "still need"
        } cleanup`
      : "All source sessions are covered";

  const buildImportCleanupPairingLabel = (pairedRowCount, sourceSessionCount, draftLineItemCount) => {
    const totalRows = Math.max(sourceSessionCount, draftLineItemCount);
    return `${pairedRowCount}/${totalRows} row${totalRows === 1 ? "" : "s"} paired`;
  };

  window.InvoiceImportCleanupUtils = {
    buildImportCoverageSummary,
    buildImportDraftComparison,
    buildImportCleanupReadinessLabel,
    buildImportSourceCoverageLabel,
    buildImportSourceCoverageGapLabel,
    buildImportCleanupPairingLabel
  };
})();
