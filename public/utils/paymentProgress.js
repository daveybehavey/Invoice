(() => {
  const parseTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const getInvoicePaymentRecords = (invoice) => {
    const records = invoice?.paymentRecords ?? invoice?.invoiceData?.finishedInvoice?.paymentRecords ?? [];
    return Array.isArray(records) ? records.filter((record) => record && typeof record === "object") : [];
  };

  const getInvoiceLatestPayment = (invoice) => {
    const records = getInvoicePaymentRecords(invoice);
    if (records.length === 0) {
      return null;
    }
    return records.reduce((latest, record) => {
      if (!latest) {
        return record;
      }
      const latestMs = parseTimestamp(latest.paidAt ?? latest.recordedAt ?? "");
      const nextMs = parseTimestamp(record.paidAt ?? record.recordedAt ?? "");
      if (!Number.isFinite(latestMs) && Number.isFinite(nextMs)) {
        return record;
      }
      if (Number.isFinite(nextMs) && nextMs >= latestMs) {
        return record;
      }
      return latest;
    }, null);
  };

  const getInvoiceOpenBalance = (invoice) => {
    const total = Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0);
    const balance = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? total);
    return Number.isFinite(balance) ? Math.max(balance, 0) : 0;
  };

  const hasPartialPayment = (invoice) => {
    const total = Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0);
    const balance = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? total);
    return Number.isFinite(total) && Number.isFinite(balance) && balance > 0 && balance < total;
  };

  const clampPercent = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(100, parsed));
  };

  const getPaymentMilestoneLabel = (progressPercent) => {
    const progress = clampPercent(progressPercent);
    if (progress >= 100) {
      return "Paid in full";
    }
    if (progress >= 75) {
      return "Final stretch";
    }
    if (progress >= 50) {
      return "Halfway there";
    }
    if (progress >= 25) {
      return "Deposit received";
    }
    if (progress > 0) {
      return "Payment started";
    }
    return "Awaiting deposit";
  };

  const getPaymentNextStepLabel = (progressPercent) => {
    const progress = clampPercent(progressPercent);
    if (progress >= 100) {
      return "Next step: start the next job or invoice again.";
    }
    if (progress >= 75) {
      return "Next step: collect the remaining balance.";
    }
    if (progress >= 50) {
      return "Next step: keep the remaining milestone moving.";
    }
    if (progress >= 25) {
      return "Next step: record the next milestone payment.";
    }
    if (progress > 0) {
      return "Next step: confirm the first deposit and keep the balance visible.";
    }
    return "Next step: record the first deposit.";
  };

  const buildPaymentProgressSummary = (total, balanceDue, paymentRecords = [], options = {}) => {
    const numericTotal = Number(total);
    const numericBalance = Number(balanceDue);
    const records = Array.isArray(paymentRecords) ? paymentRecords.filter((record) => record && typeof record === "object") : [];
    const amountPaid =
      Number.isFinite(numericTotal) && Number.isFinite(numericBalance)
        ? Math.max(0, numericTotal - numericBalance)
        : records.reduce((sum, payment) => {
            const amount = Number(payment?.amount ?? 0);
            return sum + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
          }, 0);
    const safeTotal = Number.isFinite(numericTotal) ? Math.max(numericTotal, 0) : 0;
    const progressPercent = safeTotal > 0 ? clampPercent((amountPaid / safeTotal) * 100) : 0;
    const latestPayment = records[0] ?? null;
    const paymentCount = records.length;
    const balanceRemaining = Number.isFinite(numericBalance)
      ? Math.max(0, numericBalance)
      : Math.max(0, safeTotal - amountPaid);
    const milestoneLabel = getPaymentMilestoneLabel(progressPercent);
    const nextStepLabel = getPaymentNextStepLabel(progressPercent);
    const statusTone =
      progressPercent >= 100 ? "success" : progressPercent >= 25 ? "info" : paymentCount > 0 ? "warning" : "soft";
    const timelineLimit = Math.max(0, Number(options?.timelineLimit ?? 3) || 0);
    return {
      total: safeTotal,
      balanceDue: balanceRemaining,
      amountPaid,
      progressPercent,
      latestPayment,
      paymentCount,
      milestoneLabel,
      nextStepLabel,
      statusTone,
      timelinePreview: records.slice(0, timelineLimit),
      timelineOverflowCount: Math.max(0, records.length - timelineLimit)
    };
  };

  window.InvoicePaymentProgressUtils = {
    buildPaymentProgressSummary,
    getInvoicePaymentRecords,
    getInvoiceLatestPayment,
    getInvoiceOpenBalance,
    hasPartialPayment,
    getPaymentMilestoneLabel,
    getPaymentNextStepLabel
  };
})();
