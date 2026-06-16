(() => {
  const buildDecisionKeywordSets = (decisions = [], extractKeywords) =>
    decisions.map((decision) => {
      const keywords =
        Array.isArray(decision.keywords) && decision.keywords.length
          ? decision.keywords
          : extractKeywords(decision.sourceSnippet ?? decision.prompt ?? "");
      return new Set(keywords);
    });

  const matchesDecision = (lineItem, decisionKeywordSets, extractKeywords) => {
    const itemKeywords = new Set(extractKeywords(lineItem.description ?? ""));
    if (itemKeywords.size === 0) {
      return false;
    }
    return decisionKeywordSets.some((decisionKeywords) => {
      let overlapCount = 0;
      itemKeywords.forEach((keyword) => {
        if (decisionKeywords.has(keyword)) {
          overlapCount += 1;
        }
      });
      return overlapCount >= 2;
    });
  };

  const getLineItemStatus = (lineItem, decisionKeywordSets, extractKeywords) => {
    const decisionMatch = matchesDecision(lineItem, decisionKeywordSets, extractKeywords);
    if (decisionMatch) {
      return { label: "Decision needed", badgeClass: "bg-amber-100 text-amber-700" };
    }
    if (!Number.isFinite(lineItem.amount)) {
      return { label: "Needs detail", badgeClass: "bg-slate-100 text-slate-600" };
    }
    if (Number(lineItem.amount) === 0) {
      return { label: "No charge", badgeClass: "bg-slate-100 text-slate-600" };
    }
    return { label: "Captured", badgeClass: "bg-emerald-100 text-emerald-700" };
  };

  const buildReviewSnapshotModel = ({
    payload,
    formatMoney,
    formatLaborDuration,
    formatDisplayDescription
  }) => {
    const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
    const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
    const unparsed = Array.isArray(payload.unparsed) ? payload.unparsed : [];
    const qualityBlockerCount = Number.isFinite(payload?.qualityGate?.blockerCount)
      ? Math.max(0, Math.floor(payload.qualityGate.blockerCount))
      : 0;

    const categorized = lineItems.reduce(
      (acc, item) => {
        const type = item.type ?? "other";
        if (type === "labor") {
          acc.labor.push(item);
        } else if (type === "material") {
          acc.material.push(item);
        } else {
          acc.other.push(item);
        }
        return acc;
      },
      { labor: [], material: [], other: [] }
    );

    const sections = [
      { id: "labor", label: "Work", items: categorized.labor },
      { id: "material", label: "Materials", items: categorized.material },
      { id: "other", label: "Other", items: categorized.other }
    ].filter((section) => section.items.length > 0);

    const pendingDecisionCount = decisions.length;
    const quickFixes = [];
    const primaryLaborRate =
      categorized.labor.find((item) => Number.isFinite(item.unitPrice))?.unitPrice ??
      categorized.labor.find((item) => Number.isFinite(item.amount))?.amount ??
      null;

    const previewItems = lineItems.slice(0, 3).map((item, index) => {
      const label = formatDisplayDescription(item.description) || `Line item ${index + 1}`;
      const amount = Number.isFinite(item.amount) ? formatMoney(item.amount) : "";
      const duration = item.type === "labor" ? formatLaborDuration(item.quantity) : "";
      const valueText = duration && amount ? `${duration} • ${amount}` : duration || amount;
      const needsRate =
        item.type === "labor" &&
        (!Number.isFinite(item.quantity) || !Number.isFinite(item.unitPrice));
      const needsAmount = !Number.isFinite(item.amount);
      return {
        id: item.id ?? `preview-${index}`,
        label,
        valueText,
        needsRate,
        needsAmount
      };
    });

    const timelineEntriesFromSourceSessions = (() => {
      const sessions = Array.isArray(payload?.sourceTimelineSessions)
        ? payload.sourceTimelineSessions
        : [];
      return sessions
        .map((session) => {
          const date = typeof session?.date === "string" ? session.date.trim() : "";
          if (!date) {
            return null;
          }
          const taskCount = Number.isFinite(session?.taskCount)
            ? Math.max(0, Math.floor(session.taskCount))
            : 0;
          const taskDescriptions = Array.isArray(session?.taskDescriptions)
            ? session.taskDescriptions.filter(Boolean).slice(0, 2)
            : [];
          return {
            date,
            summary:
              taskCount > 0 ? `${taskCount} task${taskCount === 1 ? "" : "s"} captured` : "",
            preview: taskDescriptions.join(", ")
          };
        })
        .filter(Boolean);
    })();

    const timelineEntriesFromLineItems = (() => {
      const groupedByDate = new Map();
      lineItems.forEach((item) => {
        const rawDate =
          typeof item?.sourceSessionDate === "string" ? item.sourceSessionDate.trim() : "";
        if (!rawDate) {
          return;
        }
        const current = groupedByDate.get(rawDate) ?? {
          date: rawDate,
          lineCount: 0,
          laborHours: 0,
          amount: 0,
          hasAmount: false,
          previews: []
        };
        current.lineCount += 1;
        if (item.type === "labor" && Number.isFinite(item.quantity)) {
          current.laborHours += Number(item.quantity);
        }
        if (Number.isFinite(item.amount)) {
          current.amount += Number(item.amount);
          current.hasAmount = true;
        }
        const normalizedDescription = formatDisplayDescription(item.description);
        if (normalizedDescription && current.previews.length < 2) {
          current.previews.push(normalizedDescription);
        }
        groupedByDate.set(rawDate, current);
      });
      return Array.from(groupedByDate.values())
        .sort((left, right) => {
          const leftTime = Date.parse(left.date);
          const rightTime = Date.parse(right.date);
          if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
            return leftTime - rightTime;
          }
          return left.date.localeCompare(right.date);
        })
        .map((entry) => {
          const summaryParts = [
            `${entry.lineCount} item${entry.lineCount === 1 ? "" : "s"}`,
            entry.laborHours > 0 ? formatLaborDuration(entry.laborHours) : "",
            entry.hasAmount ? formatMoney(entry.amount) : ""
          ].filter(Boolean);
          return {
            date: entry.date,
            summary: summaryParts.join(" • "),
            preview: entry.previews.join(", ")
          };
        });
    })();
    const timelineEntries =
      timelineEntriesFromSourceSessions.length > 0
        ? timelineEntriesFromSourceSessions
        : timelineEntriesFromLineItems;

    const remainingPreviewCount = Math.max(0, lineItems.length - previewItems.length);
    const capturedPreviewSummary = previewItems
      .slice(0, 2)
      .map((item) => item.label)
      .join(", ");
    const capturedPreviewHiddenCount = Math.max(0, lineItems.length - 2);
    const decisionCtaLabel = "Go to decisions";
    const foundText =
      lineItems.length > 0
        ? `${lineItems.length} line item${lineItems.length > 1 ? "s" : ""} captured.`
        : "No billable line items drafted yet.";
    const decisionsText =
      pendingDecisionCount > 0
        ? `${pendingDecisionCount} decision${pendingDecisionCount > 1 ? "s" : ""} ${
            pendingDecisionCount > 1 ? "need" : "needs"
          } a choice.`
        : qualityBlockerCount > 0
          ? `No decisions pending. ${qualityBlockerCount} review item${
              qualityBlockerCount > 1 ? "s" : ""
            } need attention.`
          : "No decisions pending.";
    const nextStepText =
      pendingDecisionCount > 0
        ? "Choose Add or Skip in Decisions."
        : qualityBlockerCount > 0
          ? "Fix flagged review items below."
          : "Ready to generate.";

    if (primaryLaborRate) {
      quickFixes.push({
        id: "fix-rate",
        label: "Change rate",
        value: `Change the labor rate to $${primaryLaborRate}/hr.`
      });
    }
    if (categorized.labor.length > 0) {
      quickFixes.push({
        id: "fix-hours",
        label: "Update hours",
        value: "Update the labor hours to: "
      });
    }
    if (lineItems.length > 0) {
      quickFixes.push({
        id: "fix-exclude",
        label: "Remove item",
        value: `Remove ${lineItems[0].description}.`
      });
    }
    if (payload.notes) {
      quickFixes.push({
        id: "fix-notes",
        label: "Edit notes",
        value: "Update the invoice notes to: "
      });
    }
    if (payload.customerName) {
      quickFixes.push({
        id: "fix-client",
        label: "Update client",
        value: "Update the client name to "
      });
    }

    const duplicateMergeTarget = (() => {
      const groups = new Map();
      lineItems.forEach((item) => {
        const normalizedDescription = (item.description ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!normalizedDescription) {
          return;
        }
        const unitPrice = Number.isFinite(item.unitPrice)
          ? Number(item.unitPrice).toFixed(2)
          : "na";
        const key = `${item.type ?? "other"}|${unitPrice}|${normalizedDescription}`;
        const current = groups.get(key) ?? {
          count: 0,
          description: item.description
        };
        current.count += 1;
        groups.set(key, current);
      });
      const duplicateGroup = Array.from(groups.values()).find((entry) => entry.count > 1);
      if (!duplicateGroup?.description) {
        return null;
      }
      return formatDisplayDescription(duplicateGroup.description);
    })();

    if (duplicateMergeTarget) {
      quickFixes.unshift({
        id: "fix-merge-duplicates",
        label: "Merge duplicates",
        value: `Merge duplicate line items for ${duplicateMergeTarget}.`
      });
    }

    const hasStructuredSections = sections.length > 0;
    const hasMissingAmounts = lineItems.some((item) => !Number.isFinite(item.amount));
    const hasLaborGaps = lineItems.some(
      (item) =>
        item.type === "labor" &&
        (!Number.isFinite(item.quantity) || !Number.isFinite(item.unitPrice))
    );
    const hasUnparsed = unparsed.length > 0;
    const shouldShowSuggestedEdits = quickFixes.length > 0 && pendingDecisionCount === 0;
    const hasReviewSecondaryContent =
      hasStructuredSections ||
      previewItems.length > 0 ||
      timelineEntries.length > 0 ||
      shouldShowSuggestedEdits ||
      pendingDecisionCount > 0 ||
      qualityBlockerCount > 0 ||
      Boolean(payload.notes) ||
      unparsed.length > 0;

    return {
      sections,
      timelineEntries,
      quickFixes,
      pendingDecisionCount,
      previewItems,
      remainingPreviewCount,
      capturedPreviewSummary,
      capturedPreviewHiddenCount,
      decisionCtaLabel,
      foundText,
      decisionsText,
      nextStepText,
      hasMissingAmounts,
      hasLaborGaps,
      hasUnparsed,
      qualityBlockerCount,
      hasReviewSecondaryContent
    };
  };

  window.InvoiceIntakeReviewModel = {
    buildDecisionKeywordSets,
    getLineItemStatus,
    buildReviewSnapshotModel
  };
})();
