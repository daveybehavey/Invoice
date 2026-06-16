(() => {
  const buildTrendLabel = (current, previous) => {
    const currentValue = Number(current ?? 0);
    const previousValue = Number(previous ?? 0);
    const delta = currentValue - previousValue;
    if (delta === 0) {
      return "Flat vs last week";
    }
    if (previousValue === 0) {
      return currentValue === 0 ? "Flat vs last week" : "Up from zero vs last week";
    }
    if (currentValue === 0) {
      return "Dropped to zero vs last week";
    }
    const sign = delta > 0 ? "+" : "";
    const percent = previousValue > 0 ? Math.round((delta / previousValue) * 100) : null;
    return percent === null || !Number.isFinite(percent)
      ? `${sign}${delta} vs last week`
      : `${sign}${delta} (${sign}${percent}%) vs last week`;
  };

  const buildTrendCard = ({ label, current, previous, emptyDetail = "Flat vs last week", formatValue }) => {
    const currentValue = Number(current ?? 0);
    const previousValue = Number(previous ?? 0);
    const value = typeof formatValue === "function" ? formatValue(currentValue, previousValue) : currentValue;
    return {
      label,
      value,
      detail:
        currentValue === 0 && previousValue === 0 ? emptyDetail : buildTrendLabel(currentValue, previousValue)
    };
  };

  const buildWeeklyMomentumCards = ({
    invoices = [],
    recurringSendHistory = [],
    formatMoney = (value) => String(value ?? "0"),
    nowMs = Date.now()
  } = {}) => {
    const recurringDayMs = 24 * 60 * 60 * 1000;
    const weekStartMs = nowMs - 7 * recurringDayMs;
    const priorWeekStartMs = weekStartMs - 7 * recurringDayMs;
    const parseTimestamp = (value) => {
      const parsed = Date.parse(value ?? "");
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    const list = Array.isArray(invoices) ? invoices.filter((invoice) => invoice && invoice.status !== "deleted") : [];
    const isEstimateInvoice = (invoice) =>
      invoice?.documentType === "estimate" || invoice?.invoiceData?.finishedInvoice?.documentType === "estimate";
    const updatedWithin = (items, startMs, endMs = nowMs, accessor = (item) => item?.updatedAt) =>
      items.filter((item) => {
        const updatedAt = parseTimestamp(accessor(item));
        return Number.isFinite(updatedAt) && updatedAt >= startMs && updatedAt < endMs;
      }).length;
    const countPaymentRecordsWithin = (items, startMs, endMs = nowMs) =>
      items.reduce((total, invoice) => {
        const paymentRecords = Array.isArray(invoice?.paymentRecords)
          ? invoice.paymentRecords
          : Array.isArray(invoice?.invoiceData?.finishedInvoice?.paymentRecords)
            ? invoice.invoiceData.finishedInvoice.paymentRecords
            : [];
        paymentRecords.forEach((record) => {
          const recordedAt = parseTimestamp(record?.recordedAt);
          if (!Number.isFinite(recordedAt) || recordedAt < startMs || recordedAt >= endMs) {
            return;
          }
          total.count += 1;
          total.amount += Number(record?.amount ?? 0) || 0;
        });
        return total;
      }, { count: 0, amount: 0 });
    const countRecurringRunsWithin = (items, startMs, endMs = nowMs) =>
      items.filter((entry) => {
        const runAt = parseTimestamp(entry?.recurringSummary?.lastAutoSendAt);
        return Number.isFinite(runAt) && runAt >= startMs && runAt < endMs;
      }).length;
    const activeInvoices = list;
    const estimateInvoices = activeInvoices.filter((invoice) => isEstimateInvoice(invoice));
    const paidInvoices = activeInvoices.filter((invoice) => invoice.status === "paid");
    const sentInvoices = activeInvoices.filter((invoice) => invoice.status === "sent");
    const recentPayments = countPaymentRecordsWithin(activeInvoices, weekStartMs, nowMs);
    const estimateConversions = activeInvoices.filter(
      (invoice) => parseTimestamp(invoice?.invoiceData?.finishedInvoice?.convertedFromEstimateAt) >= weekStartMs
    ).length;
    const estimateConversionsPrior = activeInvoices.filter((invoice) => {
      const convertedAt = parseTimestamp(invoice?.invoiceData?.finishedInvoice?.convertedFromEstimateAt);
      return convertedAt >= priorWeekStartMs && convertedAt < weekStartMs;
    }).length;
    const recurringCurrent = countRecurringRunsWithin(recurringSendHistory, weekStartMs, nowMs);
    const recurringRunsPrior = countRecurringRunsWithin(recurringSendHistory, priorWeekStartMs, weekStartMs);
    const paymentsPrior = countPaymentRecordsWithin(activeInvoices, priorWeekStartMs, weekStartMs);

    return [
      buildTrendCard({
        label: "Invoices touched",
        current: updatedWithin(activeInvoices, weekStartMs, nowMs),
        previous: updatedWithin(activeInvoices, priorWeekStartMs, weekStartMs)
      }),
      buildTrendCard({
        label: "Sent this week",
        current: updatedWithin(sentInvoices, weekStartMs, nowMs),
        previous: updatedWithin(sentInvoices, priorWeekStartMs, weekStartMs)
      }),
      buildTrendCard({
        label: "Paid this week",
        current: updatedWithin(paidInvoices, weekStartMs, nowMs),
        previous: updatedWithin(paidInvoices, priorWeekStartMs, weekStartMs)
      }),
      buildTrendCard({
        label: "Estimates active",
        current: updatedWithin(estimateInvoices, weekStartMs, nowMs),
        previous: updatedWithin(estimateInvoices, priorWeekStartMs, weekStartMs)
      }),
      buildTrendCard({
        label: "Estimate conversions",
        current: estimateConversions,
        previous: estimateConversionsPrior
      }),
      buildTrendCard({
        label: "Recurring sends",
        current: recurringCurrent,
        previous: recurringRunsPrior
      }),
      {
        label: "Payments recorded",
        value: recentPayments.count > 0 ? `${recentPayments.count} / ${formatMoney(recentPayments.amount)}` : "0",
        detail:
          recentPayments.count > 0 ? buildTrendLabel(recentPayments.count, paymentsPrior.count) : "No recorded payments this week"
      }
    ];
  };

  const buildCollectionsAgingSnapshot = ({
    invoices = [],
    nowMs = Date.now(),
    formatMoney = (value) => String(value ?? "0")
  } = {}) => {
    const parseTimestamp = (value) => {
      const parsed = Date.parse(value ?? "");
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    const getOpenBalance = (invoice) => {
      const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
      return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
    };
    const getSentAgeDays = (invoice) => {
      const updatedAtMs = parseTimestamp(invoice?.updatedAt ?? invoice?.invoiceData?.finishedInvoice?.updatedAt ?? "");
      const fallbackDueAtMs = parseTimestamp(invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "");
      const referenceMs = Number.isFinite(updatedAtMs) ? updatedAtMs : fallbackDueAtMs;
      if (!Number.isFinite(referenceMs)) {
        return NaN;
      }
      return Math.max(0, Math.floor((nowMs - referenceMs) / (24 * 60 * 60 * 1000)));
    };
    const sentOpenInvoices = Array.isArray(invoices)
      ? invoices.filter((invoice) => invoice && invoice.status === "sent" && getOpenBalance(invoice) > 0)
      : [];
    const overdueOpenedCount = sentOpenInvoices.filter((invoice) => {
      const ageDays = getSentAgeDays(invoice);
      return Number.isFinite(ageDays) && ageDays >= 15 && String(invoice?.delivery?.status ?? "").trim().toLowerCase() === "opened";
    }).length;
    const overdueUnopenedCount = sentOpenInvoices.filter((invoice) => {
      const ageDays = getSentAgeDays(invoice);
      return Number.isFinite(ageDays) && ageDays >= 15 && String(invoice?.delivery?.status ?? "").trim().toLowerCase() !== "opened";
    }).length;
    const stalePrimaryFocus = overdueOpenedCount >= overdueUnopenedCount ? "overdue_opened" : "overdue_unopened";
    const buckets = sentOpenInvoices.reduce(
      (result, invoice) => {
        const ageDays = getSentAgeDays(invoice);
        if (!Number.isFinite(ageDays)) {
          result.unspecified += 1;
        } else if (ageDays < 7) {
          result.fresh += 1;
        } else if (ageDays < 15) {
          result.warming += 1;
        } else {
          result.stale += 1;
        }
        if (Number.isFinite(ageDays)) {
          result.oldestAgeDays = Math.max(result.oldestAgeDays, ageDays);
        }
        result.totalOpenBalance += getOpenBalance(invoice);
        return result;
      },
      {
        fresh: 0,
        warming: 0,
        stale: 0,
        unspecified: 0,
        oldestAgeDays: 0,
        totalOpenBalance: 0
      }
    );
    return {
      sentOpenInvoices,
      buckets,
      cards: [
        {
          label: "Sent 0-6 days",
          value: buckets.fresh,
          targetPath: "/invoices?focus=opened_unpaid",
          helper:
            buckets.fresh > 0
              ? "Open the opened-unpaid queue to keep fresh balances moving."
              : "No fresh open balances right now."
        },
        {
          label: "Sent 7-14 days",
          value: buckets.warming,
          targetPath: "/invoices?focus=opened_unpaid",
          helper:
            buckets.warming > 0
              ? "Open the opened-unpaid queue before these balances go stale."
              : "No warming balances right now."
        },
        {
          label: "Sent 15+ days",
          value: buckets.stale,
          targetPath: `/invoices?focus=${stalePrimaryFocus}`,
          helper:
            buckets.stale > 0
              ? stalePrimaryFocus === "overdue_opened"
                ? "Open overdue invoices the client already opened."
                : "Open overdue invoices that still need a delivery-first check."
              : "No stale balances right now."
        },
        {
          label: "Oldest open item",
          value: buckets.oldestAgeDays > 0 ? `${buckets.oldestAgeDays}d` : "—",
          detail: buckets.totalOpenBalance > 0 ? formatMoney(buckets.totalOpenBalance) : "No open balance",
          targetPath: `/invoices?focus=${stalePrimaryFocus}`,
          helper:
            buckets.oldestAgeDays > 0
              ? "Open the highest-risk overdue queue first."
              : "No oldest balance to review right now."
        }
      ]
    };
  };

  const buildDashboardPriorityLane = ({
    variant = "best",
    topFollowUp = null,
    topPartialPayment = null,
    topEstimate = null,
    topRecurring = null,
    repeatReadyClient = null,
    estimateSummary = null,
    recurringRecipient = "",
    getClientName = (invoice) => String(invoice?.customerName ?? "").trim(),
    formatDueDate = (value) => String(value ?? "")
  } = {}) => {
    const makeOpenClientTarget = (invoiceOrName) => ({
      type: "open_client",
      clientName:
        typeof invoiceOrName === "string"
          ? invoiceOrName
          : getClientName(invoiceOrName?.invoice ?? invoiceOrName ?? {})
    });
    const makeOpenInvoiceTarget = (invoice) => ({
      type: "open_invoice",
      invoiceId: invoice?.invoiceId ?? ""
    });
    const makeFocusedQueueTarget = (focus) => ({
      type: "navigate",
      path: focus ? `/invoices?focus=${encodeURIComponent(focus)}` : "/invoices"
    });
    const makeConvertEstimateTarget = (invoice) => ({
      type: "convert_estimate",
      invoiceId: invoice?.invoiceId ?? ""
    });

    if (variant === "suggested") {
      if (topRecurring) {
        return topRecurring.autoSendEnabled
          ? {
              eyebrow: "Suggested automation",
              title: "Recurring send is already armed",
              body: recurringRecipient
                ? `Keep the cadence visible and review the next run before ${formatDueDate(topRecurring.nextDueAt)}.`
                : "Keep the cadence visible and review the next run before it fires.",
              primaryLabel: "Open recurring invoice",
              primaryTarget: makeOpenInvoiceTarget(topRecurring.invoice),
              secondaryLabel: "Open client workspace",
              secondaryTarget: makeOpenClientTarget(topRecurring.invoice)
            }
          : {
              eyebrow: "Suggested automation",
              title: "Recurring invoice could be armed",
              body: "This repeat job already has cadence and memory, so the next safe move is to review the recipient and arm auto-send when you're ready.",
              primaryLabel: "Open recurring invoice",
              primaryTarget: makeOpenInvoiceTarget(topRecurring.invoice),
              secondaryLabel: "Open client workspace",
              secondaryTarget: makeOpenClientTarget(topRecurring.invoice)
            };
      }
      if (topPartialPayment) {
        return {
          eyebrow: "Suggested automation",
          title: "Partial payment could use a reminder cadence",
          body:
            "This balance is already in progress. Keep the client visible and follow the next payment step before the job cools off.",
          primaryLabel: "Open client workspace",
          primaryTarget: makeOpenClientTarget(topPartialPayment),
          secondaryLabel: "Open invoice",
          secondaryTarget: makeOpenInvoiceTarget(topPartialPayment)
        };
      }
      if (topEstimate && estimateSummary) {
        return {
          eyebrow: "Suggested automation",
          title: estimateSummary.statusLabel,
          body: estimateSummary.actionHint,
          primaryLabel: "Open client workspace",
          primaryTarget: makeOpenClientTarget(topEstimate),
          secondaryLabel: estimateSummary.isApproved ? "Convert estimate" : "Open estimate",
          secondaryTarget: estimateSummary.isApproved
            ? makeConvertEstimateTarget(topEstimate)
            : makeOpenInvoiceTarget(topEstimate)
        };
      }
      return {
        eyebrow: "Suggested automation",
        title: "Build repeat-ready defaults",
        body:
          "As more clients and schedules fill in, this dashboard will start suggesting safer next steps automatically.",
        primaryLabel: "Open clients",
        primaryTarget: { type: "navigate", path: "/clients" },
        secondaryLabel: "Open library",
        secondaryTarget: { type: "navigate", path: "/invoices" }
      };
    }

    if (topFollowUp) {
      return {
        eyebrow: "Collections lane",
        title: `Follow up on ${topFollowUp.invoiceNumber || "the oldest open invoice"}`,
        body:
          "Open balances are still the most important thing on the board. Jump into the library ops flow before this invoice gets any staler.",
        primaryLabel:
          topFollowUp?.delivery?.status === "opened" ? "Open opened overdue queue" : "Open overdue unopened queue",
        primaryTarget:
          topFollowUp?.delivery?.status === "opened"
            ? makeFocusedQueueTarget("overdue_opened")
            : makeFocusedQueueTarget("overdue_unopened"),
        secondaryLabel: getClientName(topFollowUp) ? "Open client workspace" : "",
        secondaryTarget: getClientName(topFollowUp)
          ? makeOpenClientTarget(topFollowUp)
          : null
      };
    }
    if (topPartialPayment) {
      return {
        eyebrow: "Partial payment lane",
        title: `Close out ${topPartialPayment.invoiceNumber || "the partial invoice"}`,
        body:
          "A client has already paid part of the balance. Reopen that client workflow now so the remaining collection stays clear and low-friction.",
        primaryLabel: "Open client workspace",
        primaryTarget: makeOpenClientTarget(topPartialPayment),
        secondaryLabel: "Open partial-payment queue",
        secondaryTarget: makeFocusedQueueTarget("partial_payments")
      };
    }
    if (topEstimate && estimateSummary) {
      return {
        eyebrow: "Estimate lane",
        title: estimateSummary.statusLabel,
        body: estimateSummary.actionHint,
        primaryLabel: estimateSummary.isApproved ? "Convert approved estimate" : "Open client workspace",
        primaryTarget: estimateSummary.isApproved
          ? makeConvertEstimateTarget(topEstimate)
          : makeOpenClientTarget(topEstimate),
        secondaryLabel: estimateSummary.isApproved ? "Open client workspace" : "Open estimate",
        secondaryTarget: estimateSummary.isApproved
          ? makeOpenClientTarget(topEstimate)
          : makeOpenInvoiceTarget(topEstimate)
      };
    }
    if (topRecurring) {
      return {
        eyebrow: "Recurring lane",
        title: topRecurring.dueNow ? "Recurring work is due now" : "Recurring work is coming up soon",
        body:
          "Recurring jobs are the easiest place to create operator momentum. Open the library while the cadence and saved memory are already lined up.",
        primaryLabel: "Open needs attention",
        primaryTarget: makeFocusedQueueTarget(""),
        secondaryLabel: topRecurring.invoice ? "Open client workspace" : "",
        secondaryTarget: topRecurring.invoice ? makeOpenClientTarget(topRecurring.invoice) : null
      };
    }
    return {
      eyebrow: "Momentum lane",
      title: repeatReadyClient ? `Start the next job for ${repeatReadyClient.name}` : "Keep building repeat-ready clients",
      body: repeatReadyClient
        ? "Client memory and saved services are ready. Use that leverage while it stays easy."
        : "As invoices, services, and memory fill in, this dashboard will start surfacing faster next moves here.",
      primaryLabel: repeatReadyClient ? "Open client workspace" : "Open clients",
      primaryTarget: repeatReadyClient
        ? makeOpenClientTarget(repeatReadyClient.name)
        : { type: "navigate", path: "/clients" },
      secondaryLabel: "Open library",
      secondaryTarget: { type: "navigate", path: "/invoices" }
    };
  };

  const buildRecentActivityEntries = ({
    invoices = [],
    getClientName = (invoice) => String(invoice?.customerName ?? "").trim(),
    formatDateTime = (value) => String(value ?? ""),
    formatMoney = (value) => String(value ?? "")
  } = {}) => {
    const parseTimestamp = (value) => {
      const parsed = Date.parse(value ?? "");
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    return Array.isArray(invoices)
      ? invoices
          .filter((invoice) => invoice && invoice.status !== "deleted")
          .slice()
          .sort(
            (left, right) =>
              parseTimestamp(right.updatedAt ?? right.invoiceData?.finishedInvoice?.updatedAt ?? "") -
              parseTimestamp(left.updatedAt ?? left.invoiceData?.finishedInvoice?.updatedAt ?? "")
          )
          .slice(0, 4)
          .map((invoice) => {
            const documentType =
              invoice?.documentType === "estimate" || invoice?.invoiceData?.finishedInvoice?.documentType === "estimate"
                ? "estimate"
                : "invoice";
            const status = invoice?.status || "draft";
            const convertedFromEstimateAt = invoice?.invoiceData?.finishedInvoice?.convertedFromEstimateAt ?? "";
            const estimateReviewState =
              typeof invoice?.invoiceData?.finishedInvoice?.estimateReviewState === "string"
                ? invoice.invoiceData.finishedInvoice.estimateReviewState.trim().toLowerCase()
                : typeof invoice?.estimateReviewState === "string"
                  ? invoice.estimateReviewState.trim().toLowerCase()
                  : "";
            const activityLabel =
              convertedFromEstimateAt
                ? "Converted"
                : documentType === "estimate"
                ? estimateReviewState === "approved"
                  ? "Approved"
                  : estimateReviewState === "needs_review"
                    ? "Needs review"
                    : "Estimate"
                : status === "paid"
                  ? "Paid"
                  : status === "sent"
                    ? "Sent"
                    : "Draft";
            const openBalance = Number(
              invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? invoice?.total ?? 0
            );
            const normalizedOpenBalance = Number.isFinite(openBalance) ? Math.max(openBalance, 0) : 0;
            const deliveryStatus = String(invoice?.delivery?.status ?? "").trim().toLowerCase();
            const hasPartialPayment = Array.isArray(invoice?.paymentRecords) && invoice.paymentRecords.length > 0 && normalizedOpenBalance > 0;
            const primaryAction = (() => {
              if (documentType === "estimate") {
                if (estimateReviewState === "approved") {
                  return {
                    label: "Convert estimate",
                    targetType: "open_invoice"
                  };
                }
                return {
                  label: "Open estimate",
                  targetType: "open_invoice"
                };
              }
              if (hasPartialPayment) {
                return {
                  label: "Open partial-payment queue",
                  targetType: "navigate",
                  path: "/invoices?focus=partial_payments"
                };
              }
              if (status === "sent" && normalizedOpenBalance > 0 && deliveryStatus === "opened") {
                return {
                  label: "Open opened-unpaid queue",
                  targetType: "navigate",
                  path: "/invoices?focus=opened_unpaid"
                };
              }
              if (status === "sent" && normalizedOpenBalance > 0) {
                return {
                  label: "Open invoice",
                  targetType: "open_invoice"
                };
              }
              if (status === "paid") {
                return {
                  label: "Open client",
                  targetType: "open_client"
                };
              }
              return {
                label: "Open invoice",
                targetType: "open_invoice"
              };
            })();
            return {
              invoice,
              activityLabel,
              updatedLabel: formatDateTime(invoice.updatedAt ?? invoice.invoiceData?.finishedInvoice?.updatedAt ?? ""),
              clientName: getClientName(invoice) || "Client",
              amountLabel: formatMoney(Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0)),
              primaryAction
            };
          })
      : [];
  };

  window.InvoiceDashboardMetrics = {
    buildCollectionsAgingSnapshot,
    buildDashboardPriorityLane,
    buildRecentActivityEntries,
    buildWeeklyMomentumCards,
    buildTrendCard,
    buildTrendLabel
  };
})();
