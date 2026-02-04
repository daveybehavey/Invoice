const entrySection = document.getElementById("entrySection");
const textInputWrap = document.getElementById("textInputWrap");
const uploadWrap = document.getElementById("uploadWrap");
const messyInputEl = document.getElementById("messyInput");
const invoiceFileEl = document.getElementById("invoiceFile");
const generateBtn = document.getElementById("generateBtn");
const entryStatusEl = document.getElementById("entryStatus");
const entryErrorEl = document.getElementById("entryError");
const laborFollowUpSectionEl = document.getElementById("laborFollowUpSection");
const laborFollowUpMessageEl = document.getElementById("laborFollowUpMessage");
const hourlyBillingFieldsEl = document.getElementById("hourlyBillingFields");
const hourlyLineHoursFieldsEl = document.getElementById("hourlyLineHoursFields");
const flatBillingFieldsEl = document.getElementById("flatBillingFields");
const hourlyRateInputEl = document.getElementById("hourlyRateInput");
const flatAmountInputEl = document.getElementById("flatAmountInput");
const applyLaborPricingBtn = document.getElementById("applyLaborPricingBtn");
const laborFollowUpStatusEl = document.getElementById("laborFollowUpStatus");
const toneFollowUpSectionEl = document.getElementById("toneFollowUpSection");
const toneFollowUpInputEl = document.getElementById("toneFollowUpInput");
const toneFollowUpStatusEl = document.getElementById("toneFollowUpStatus");
const applyToneBtn = document.getElementById("applyToneBtn");
const discountFollowUpSectionEl = document.getElementById("discountFollowUpSection");
const discountFollowUpMessageEl = document.getElementById("discountFollowUpMessage");
const discountFollowUpAmountInputEl = document.getElementById("discountFollowUpAmountInput");
const discountFollowUpReasonInputEl = document.getElementById("discountFollowUpReasonInput");
const discountFollowUpStatusEl = document.getElementById("discountFollowUpStatus");
const applyDiscountFollowUpBtn = document.getElementById("applyDiscountFollowUpBtn");

const workspaceSection = document.getElementById("workspaceSection");
const workspaceMetaEl = document.getElementById("workspaceMeta");
const dirtyIndicatorEl = document.getElementById("dirtyIndicator");
const lineItemsMountEl = document.getElementById("lineItemsMount");
const invoiceDocumentMountEl = document.getElementById("invoiceDocumentMount");
const removeDiscountBtn = document.getElementById("removeDiscountBtn");
const rewriteInvoiceBtn = document.getElementById("rewriteInvoiceBtn");
const printBtn = document.getElementById("printBtn");
const downloadBtn = document.getElementById("downloadBtn");
const saveBtn = document.getElementById("saveBtn");
const workspaceStatusEl = document.getElementById("workspaceStatus");
const workspaceErrorEl = document.getElementById("workspaceError");

const state = {
  sourceType: "text_input",
  structuredInvoice: null,
  invoice: null,
  savedInvoiceId: null,
  isDirty: false,
  pendingLaborFollowUp: null,
  pendingDiscountFollowUp: null,
  pendingToneInvoice: null,
  requestedTone: null,
  sourceTextForFollowUp: null
};

bootstrap();

function bootstrap() {
  for (const radio of document.querySelectorAll('input[name="sourceMode"]')) {
    radio.addEventListener("change", onSourceModeChange);
  }

  generateBtn.addEventListener("click", onGenerateInvoice);
  rewriteInvoiceBtn.addEventListener("click", onRewriteInvoice);
  printBtn.addEventListener("click", onPrintInvoice);
  downloadBtn.addEventListener("click", onDownloadPdf);
  saveBtn.addEventListener("click", onSaveInvoice);
  applyLaborPricingBtn.addEventListener("click", onApplyLaborPricing);
  applyToneBtn.addEventListener("click", onApplyTone);
  applyDiscountFollowUpBtn.addEventListener("click", onApplyDiscountFollowUp);
  removeDiscountBtn.addEventListener("click", onRemoveDiscount);

  for (const radio of document.querySelectorAll('input[name="laborBillingType"]')) {
    radio.addEventListener("change", onLaborBillingTypeChange);
  }

  onSourceModeChange();
  onLaborBillingTypeChange();
}

function onSourceModeChange() {
  const mode = getSourceMode();
  state.sourceType = mode;
  textInputWrap.classList.toggle("hidden", mode !== "text_input");
  uploadWrap.classList.toggle("hidden", mode !== "upload");
}

function onLaborBillingTypeChange() {
  const billingType = getLaborBillingType();
  hourlyBillingFieldsEl.classList.toggle("hidden", billingType !== "hourly");
  hourlyLineHoursFieldsEl.classList.toggle("hidden", billingType !== "hourly");
  flatBillingFieldsEl.classList.toggle("hidden", billingType !== "flat");
}

async function onGenerateInvoice() {
  clearEntryMessages();
  clearWorkspaceMessages();
  hideLaborFollowUp();
  hideDiscountFollowUp();
  hideToneFollowUp();
  setEntryBusy(true, "Generating invoice...");

  try {
    const formData = new FormData();
    const mode = getSourceMode();
    state.sourceType = mode;
    state.requestedTone = null;
    state.pendingToneInvoice = null;
    state.pendingDiscountFollowUp = null;
    state.sourceTextForFollowUp = null;

    if (mode === "text_input") {
      const messyInput = messyInputEl.value.trim();
      if (!messyInput) {
        throw new Error("Paste messy notes before generating.");
      }
      formData.append("messyInput", messyInput);
      state.sourceTextForFollowUp = messyInput;
      state.requestedTone = detectToneFromSourceText(messyInput);
    } else {
      const file = invoiceFileEl.files?.[0];
      if (!file) {
        throw new Error("Upload an invoice file before generating.");
      }
      formData.append("invoiceFile", file);
    }

    const response = await fetch("/api/invoices/from-input", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const payload = await response.json();
    state.structuredInvoice = payload.structuredInvoice;
    state.savedInvoiceId = null;
    state.isDirty = false;

    if (payload.needsFollowUp) {
      if (payload.followUp?.type === "discount") {
        if (!payload.invoice) {
          throw new Error("Discount follow-up is missing invoice data.");
        }
        state.pendingDiscountFollowUp = {
          message: payload.followUp.message || "I see you want to offer a discount. What discount amount should I apply?",
          suggestedReason: payload.followUp.suggestedReason || "",
          invoice: ensureEditableInvoice(payload.invoice)
        };
        state.pendingLaborFollowUp = null;
        state.invoice = null;
        showDiscountFollowUp(state.pendingDiscountFollowUp);
      } else {
        state.pendingLaborFollowUp = {
          message:
            payload.followUp?.message ||
            "I see labor work, but some labor pricing is missing. Please choose how labor should be billed.",
          laborItems: Array.isArray(payload.followUp?.laborItems) ? payload.followUp.laborItems : []
        };
        state.pendingDiscountFollowUp = null;
        state.invoice = null;
        showLaborFollowUp(state.pendingLaborFollowUp);
      }

      state.invoice = null;
      workspaceSection.classList.add("hidden");
      setEntryBusy(false, "");
      setEntryMessage("info", "One quick question before finalizing.");
      return;
    }

    state.pendingLaborFollowUp = null;
    state.pendingDiscountFollowUp = null;
    setEntryBusy(false, "");
    await completeToneStep(payload.invoice);
  } catch (error) {
    setEntryBusy(false, "");
    entryErrorEl.textContent = `Generate failed: ${asErrorMessage(error)}`;
    setEntryMessage("warning", "Please fix the issue and try generating again.");
  }
}

async function onApplyLaborPricing() {
  if (!state.structuredInvoice || !state.pendingLaborFollowUp) {
    return;
  }

  clearEntryMessages();
  laborFollowUpStatusEl.textContent = "";
  hideDiscountFollowUp();
  applyLaborPricingBtn.disabled = true;

  try {
    const laborPricing = buildLaborPricingPayload();
    laborFollowUpStatusEl.textContent = "Applying labor pricing...";

    const response = await fetch("/api/invoices/from-input/labor-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredInvoice: state.structuredInvoice,
        laborPricing,
        sourceText: state.sourceTextForFollowUp || undefined
      })
    });

    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const payload = await response.json();
    state.structuredInvoice = payload.structuredInvoice;
    state.pendingLaborFollowUp = null;
    hideLaborFollowUp();

    if (payload.needsFollowUp && payload.followUp?.type === "discount") {
      if (!payload.invoice) {
        throw new Error("Discount follow-up is missing invoice data.");
      }
      state.pendingDiscountFollowUp = {
        message: payload.followUp.message || "I see you want to offer a discount. What discount amount should I apply?",
        suggestedReason: payload.followUp.suggestedReason || "",
        invoice: ensureEditableInvoice(payload.invoice)
      };
      showDiscountFollowUp(state.pendingDiscountFollowUp);
      workspaceSection.classList.add("hidden");
      setEntryMessage("info", "One quick question before finalizing.");
      return;
    }

    state.pendingDiscountFollowUp = null;
    await completeToneStep(payload.invoice);
  } catch (error) {
    entryErrorEl.textContent = `Labor pricing failed: ${asErrorMessage(error)}`;
    setEntryMessage("warning", "Please check labor values and try again.");
  } finally {
    laborFollowUpStatusEl.textContent = "";
    applyLaborPricingBtn.disabled = false;
  }
}

async function onApplyTone() {
  if (!state.pendingToneInvoice) {
    return;
  }

  clearEntryMessages();
  toneFollowUpStatusEl.textContent = "";

  const tone = asOptionalTone(toneFollowUpInputEl.value);
  if (!tone) {
    entryErrorEl.textContent = "Please enter a tone before finalizing.";
    setEntryMessage("warning", "Tone is required to finalize wording.");
    return;
  }

  applyToneBtn.disabled = true;
  try {
    toneFollowUpStatusEl.textContent = "Applying tone...";
    await applyToneAndFinalize(state.pendingToneInvoice, tone);
    setEntryMessage("success", "Invoice finalized with selected tone.");
  } catch (error) {
    entryErrorEl.textContent = `Tone step failed: ${asErrorMessage(error)}`;
    setEntryMessage("warning", "Could not apply tone. Please try again.");
  } finally {
    toneFollowUpStatusEl.textContent = "";
    applyToneBtn.disabled = false;
  }
}

async function onApplyDiscountFollowUp() {
  if (!state.pendingDiscountFollowUp?.invoice) {
    return;
  }

  clearEntryMessages();
  discountFollowUpStatusEl.textContent = "";
  applyDiscountFollowUpBtn.disabled = true;

  try {
    const discountAmount = parsePositiveNumber(discountFollowUpAmountInputEl.value);
    const discountReason = discountFollowUpReasonInputEl.value.trim() || undefined;
    discountFollowUpStatusEl.textContent = "Applying discount...";

    const response = await fetch("/api/invoices/from-input/discount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice: state.pendingDiscountFollowUp.invoice,
        discountAmount,
        discountReason
      })
    });

    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const payload = await response.json();
    state.pendingDiscountFollowUp = null;
    hideDiscountFollowUp();
    await completeToneStep(payload.invoice);
  } catch (error) {
    entryErrorEl.textContent = `Discount follow-up failed: ${asErrorMessage(error)}`;
    setEntryMessage("warning", "Please check the discount amount and try again.");
  } finally {
    discountFollowUpStatusEl.textContent = "";
    applyDiscountFollowUpBtn.disabled = false;
  }
}

async function onRewriteInvoice() {
  if (!state.invoice) {
    return;
  }

  clearWorkspaceMessages();
  setWorkspaceBusy(true, "Rewriting full invoice...");

  try {
    const toneValue = prompt("Optional tone for full invoice rewrite:", "") ?? "";
    const response = await fetch("/api/invoices/reword-full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice: state.invoice,
        tone: toneValue.trim() || undefined
      })
    });

    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const payload = await response.json();
    state.invoice = ensureEditableInvoice(payload.invoice);
    state.isDirty = true;
    renderWorkspace();
    setWorkspaceBusy(false, "");
    setWorkspaceMessage("success", "Invoice rewrite complete. Review changes before saving.");
  } catch (error) {
    setWorkspaceBusy(false, "");
    workspaceErrorEl.textContent = `Rewrite failed: ${asErrorMessage(error)}`;
    setWorkspaceMessage("warning", "No changes were saved. Try rewrite again.");
  }
}

async function onSaveInvoice() {
  if (!state.invoice || !state.structuredInvoice) {
    return;
  }

  clearWorkspaceMessages();
  const confirmed = confirm("Save this invoice document now?");
  if (!confirmed) {
    setWorkspaceMessage("info", "Save canceled.");
    return;
  }

  setWorkspaceBusy(true, "Saving invoice...");

  try {
    const response = await fetch("/api/invoices/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmSave: true,
        invoiceId: state.savedInvoiceId || undefined,
        sourceType: state.sourceType,
        invoiceData: {
          structuredInvoice: state.structuredInvoice,
          finishedInvoice: state.invoice
        }
      })
    });

    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const payload = await response.json();
    state.savedInvoiceId = payload.invoice.invoiceId;
    state.isDirty = false;
    setWorkspaceBusy(false, "");
    setWorkspaceMessage("success", `Saved successfully (${state.savedInvoiceId}).`);
    renderWorkspaceMeta();
  } catch (error) {
    setWorkspaceBusy(false, "");
    workspaceErrorEl.textContent = `Save failed: ${asErrorMessage(error)}`;
    setWorkspaceMessage("warning", "Invoice was not saved. Please try again.");
  }
}

function onPrintInvoice() {
  if (!state.invoice) {
    return;
  }

  try {
    openDocumentPrintWindow(state.invoice);
    setWorkspaceMessage("info", "Opened print dialog for invoice.");
  } catch (error) {
    workspaceErrorEl.textContent = asErrorMessage(error);
  }
}

function onDownloadPdf() {
  if (!state.invoice) {
    return;
  }

  try {
    openDocumentPrintWindow(state.invoice);
    setWorkspaceMessage("info", "Use the print dialog and choose Save as PDF.");
  } catch (error) {
    workspaceErrorEl.textContent = asErrorMessage(error);
  }
}

function onRemoveDiscount() {
  if (!state.invoice) {
    return;
  }
  if (!state.invoice.discountAmount) {
    return;
  }

  clearWorkspaceMessages();
  state.invoice.discountAmount = 0;
  state.invoice.discountReason = undefined;
  state.invoice = recomputeInvoiceTotals(state.invoice);
  state.isDirty = true;
  renderWorkspace();
  setWorkspaceMessage("success", "Discount removed.");
}

function renderWorkspace() {
  renderWorkspaceMeta();
  renderLineItemsTable();
  renderDiscountAction();
  renderInvoiceDocument();
}

function renderWorkspaceMeta() {
  if (!state.invoice) {
    workspaceMetaEl.textContent = "";
    dirtyIndicatorEl.textContent = "";
    dirtyIndicatorEl.className = "status";
    return;
  }

  const invoiceNumber = state.invoice.invoiceNumber || "(none)";
  const total = formatMoney(state.invoice.total ?? 0);
  const saved = state.savedInvoiceId ? ` | saved: ${state.savedInvoiceId}` : "";
  workspaceMetaEl.textContent = `Invoice #: ${invoiceNumber} | total: ${total}${saved}`;
  renderDirtyIndicator();
}

function renderDirtyIndicator() {
  if (!state.invoice) {
    dirtyIndicatorEl.textContent = "";
    dirtyIndicatorEl.className = "status";
    return;
  }

  if (!state.savedInvoiceId) {
    dirtyIndicatorEl.textContent = "Not saved yet.";
    dirtyIndicatorEl.className = "status status-warning";
    return;
  }

  if (state.isDirty) {
    dirtyIndicatorEl.textContent = "Unsaved changes.";
    dirtyIndicatorEl.className = "status status-warning";
    return;
  }

  dirtyIndicatorEl.textContent = "All changes saved.";
  dirtyIndicatorEl.className = "status status-success";
}

function renderLineItemsTable() {
  if (!state.invoice) {
    lineItemsMountEl.innerHTML = "";
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Amount</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  for (const [index, lineItem] of state.invoice.lineItems.entries()) {
    const row = document.createElement("tr");
    row.dataset.index = String(index);
    row.dataset.editing = "0";

    row.innerHTML = `
      <td><input type="text" data-field="description" value="${escapeHtml(lineItem.description)}" disabled></td>
      <td><input type="number" step="0.01" data-field="quantity" value="${stringValue(lineItem.quantity)}" disabled></td>
      <td><input type="number" step="0.01" data-field="unitPrice" value="${stringValue(lineItem.unitPrice)}" disabled></td>
      <td><span data-field="amount">${formatMoney(lineItem.amount ?? 0)}</span></td>
      <td>
        <button type="button" data-action="edit">Edit values</button>
        <button type="button" data-action="reword">Rewrite text</button>
      </td>
    `;

    row.querySelector('[data-action="edit"]').addEventListener("click", () => onToggleLineEdit(row));
    row.querySelector('[data-action="reword"]').addEventListener("click", () => onChangeLineWording(lineItem.id));
    tbody.append(row);
  }

  lineItemsMountEl.innerHTML = "";
  lineItemsMountEl.append(table);
}

function renderDiscountAction() {
  if (!state.invoice || typeof state.invoice.discountAmount !== "number" || state.invoice.discountAmount <= 0) {
    removeDiscountBtn.classList.add("hidden");
    return;
  }

  removeDiscountBtn.classList.remove("hidden");
}

function renderInvoiceDocument() {
  if (!state.invoice) {
    invoiceDocumentMountEl.innerHTML = "";
    return;
  }

  invoiceDocumentMountEl.innerHTML = buildInvoiceDocumentMarkup(state.invoice);
}

async function onChangeLineWording(lineItemId) {
  if (!state.invoice || !lineItemId) {
    return;
  }

  clearWorkspaceMessages();
  setWorkspaceBusy(true, "Rewriting selected line...");

  try {
    const toneValue = prompt("Optional tone for this line:", "") ?? "";
    const response = await fetch("/api/invoices/reword-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice: state.invoice,
        lineItemId,
        tone: toneValue.trim() || undefined
      })
    });

    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const payload = await response.json();
    state.invoice = ensureEditableInvoice(payload.invoice);
    state.isDirty = true;
    renderWorkspace();
    setWorkspaceBusy(false, "");
    setWorkspaceMessage("success", "Line text rewritten. Amounts were preserved.");
  } catch (error) {
    setWorkspaceBusy(false, "");
    workspaceErrorEl.textContent = `Line rewrite failed: ${asErrorMessage(error)}`;
    setWorkspaceMessage("warning", "Line was not changed.");
  }
}

function onToggleLineEdit(row) {
  if (!state.invoice) {
    return;
  }

  const index = Number(row.dataset.index);
  const isEditing = row.dataset.editing === "1";
  const inputs = row.querySelectorAll("input");
  const editButton = row.querySelector('[data-action="edit"]');

  if (!isEditing) {
    row.dataset.editing = "1";
    for (const input of inputs) {
      input.disabled = false;
    }
    editButton.textContent = "Apply values";
    return;
  }

  const updatedLine = { ...state.invoice.lineItems[index] };
  updatedLine.description = getInputValue(row, "description") || updatedLine.description;
  updatedLine.quantity = getOptionalNumberInput(row, "quantity");
  updatedLine.unitPrice = getOptionalNumberInput(row, "unitPrice");
  updatedLine.amount = undefined;
  state.invoice.lineItems[index] = updatedLine;
  state.invoice = recomputeInvoiceTotals(state.invoice);
  state.isDirty = true;

  row.dataset.editing = "0";
  for (const input of inputs) {
    input.disabled = true;
  }
  editButton.textContent = "Edit values";
  renderWorkspace();
  setWorkspaceMessage("success", "Line values updated. Remember to save.");
}

function recomputeInvoiceTotals(invoice) {
  let subtotal = 0;
  const updatedLineItems = invoice.lineItems.map((lineItem) => {
    const item = { ...lineItem };
    if (typeof item.amount !== "number") {
      if (typeof item.quantity === "number" && typeof item.unitPrice === "number") {
        item.amount = round(item.quantity * item.unitPrice);
      } else {
        item.amount = 0;
      }
    } else {
      item.amount = round(item.amount);
    }

    subtotal += item.amount;
    return item;
  });

  const roundedSubtotal = round(subtotal);
  const discountAmount = round(Math.max(0, Number(invoice.discountAmount) || 0));
  const total = round(Math.max(0, roundedSubtotal - discountAmount));
  return {
    ...invoice,
    lineItems: updatedLineItems,
    discountAmount,
    subtotal: roundedSubtotal,
    total,
    balanceDue: total
  };
}

function ensureEditableInvoice(invoice) {
  const withLineIds = {
    ...invoice,
    invoiceNumber: invoice.invoiceNumber || generateFallbackInvoiceNumber(),
    lineItems: (invoice.lineItems || []).map((lineItem, index) => ({
      ...lineItem,
      id: lineItem.id || `line_${index + 1}`
    }))
  };
  return recomputeInvoiceTotals(withLineIds);
}

function getInputValue(row, fieldName) {
  const input = row.querySelector(`input[data-field="${fieldName}"]`);
  if (!input) {
    return "";
  }
  return input.value.trim();
}

function getOptionalNumberInput(row, fieldName) {
  const input = row.querySelector(`input[data-field="${fieldName}"]`);
  if (!input) {
    return undefined;
  }

  const raw = input.value.trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getSourceMode() {
  const checkedRadio = document.querySelector('input[name="sourceMode"]:checked');
  if (!checkedRadio) {
    return "text_input";
  }
  return checkedRadio.value;
}

function getLaborBillingType() {
  const checkedRadio = document.querySelector('input[name="laborBillingType"]:checked');
  if (!checkedRadio) {
    return "hourly";
  }

  return checkedRadio.value;
}

function buildLaborPricingPayload() {
  const billingType = getLaborBillingType();

  if (billingType === "hourly") {
    const rate = parsePositiveNumber(hourlyRateInputEl.value);
    const lineHourInputs = Array.from(
      hourlyLineHoursFieldsEl.querySelectorAll('input[data-role="line-hours"]')
    );
    if (!lineHourInputs.length) {
      throw new Error("Please provide hours for each labor line.");
    }

    const lineHours = lineHourInputs.map((input) => parsePositiveNumber(input.value));

    return {
      billingType: "hourly",
      rate,
      lineHours
    };
  }

  return {
    billingType: "flat",
    flatAmount: parsePositiveNumber(flatAmountInputEl.value)
  };
}

function parsePositiveNumber(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Please enter a value greater than 0.");
  }

  return Math.round(parsed * 100) / 100;
}

function asOptionalTone(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function detectToneFromSourceText(sourceText) {
  if (typeof sourceText !== "string") {
    return null;
  }

  const text = sourceText.trim();
  if (!text) {
    return null;
  }

  const lowered = text.toLowerCase();
  const hasProfessionalWord =
    lowered.includes("professional") ||
    lowered.includes("proffesional") ||
    lowered.includes("profesional") ||
    lowered.includes("proffessional");

  if (/\bneutral professional\b/i.test(text)) {
    return "neutral professional";
  }

  if (/\bfriendly\b/i.test(text) && hasProfessionalWord) {
    return "friendly professional";
  }

  if (/\bclear\b/i.test(text) && hasProfessionalWord) {
    return "clear and professional";
  }

  if (/\bconcise\b|\bbrief\b/i.test(text) && hasProfessionalWord) {
    return "concise professional";
  }

  const explicitToneMatch = text.match(/\btone\s*[:\-]\s*([^\n.]+)/i);
  if (explicitToneMatch?.[1]) {
    return asOptionalTone(explicitToneMatch[1]);
  }

  const commonInstructionMatch = text.match(/\b(?:please\s+)?(?:make|keep|write)\s+(?:this|it)\s+([^\n.]+)/i);
  if (commonInstructionMatch?.[1]) {
    const candidate = commonInstructionMatch[1];
    if (/\b(?:professional|proffesional|profesional|proffessional|friendly|formal|neutral|polite|clear|concise)\b/i.test(candidate)) {
      return asOptionalTone(candidate);
    }
  }

  if (hasProfessionalWord) {
    return "professional";
  }

  return null;
}

function setEntryBusy(isBusy, message) {
  generateBtn.disabled = isBusy;
  entrySection.querySelectorAll("input,textarea").forEach((element) => {
    element.disabled = isBusy;
  });

  if (message) {
    setEntryMessage("info", message);
  }
}

function setWorkspaceBusy(isBusy, message) {
  rewriteInvoiceBtn.disabled = isBusy;
  printBtn.disabled = isBusy;
  downloadBtn.disabled = isBusy;
  saveBtn.disabled = isBusy;
  removeDiscountBtn.disabled = isBusy;

  if (message) {
    setWorkspaceMessage("info", message);
  }
}

function clearEntryMessages() {
  entryErrorEl.textContent = "";
  setEntryMessage("info", "");
}

function clearWorkspaceMessages() {
  workspaceErrorEl.textContent = "";
  setWorkspaceMessage("info", "");
}

function setEntryMessage(type, message) {
  entryStatusEl.textContent = message;
  entryStatusEl.className = message ? `status status-${type}` : "status";
}

function setWorkspaceMessage(type, message) {
  workspaceStatusEl.textContent = message;
  workspaceStatusEl.className = message ? `status status-${type}` : "status";
}

function showLaborFollowUp(followUp) {
  laborFollowUpMessageEl.textContent = followUp.message;
  laborFollowUpSectionEl.classList.remove("hidden");
  laborFollowUpStatusEl.textContent = "";
  renderLaborHourInputs(followUp.laborItems || []);
}

function hideLaborFollowUp() {
  laborFollowUpSectionEl.classList.add("hidden");
  laborFollowUpMessageEl.textContent = "";
  laborFollowUpStatusEl.textContent = "";
  hourlyLineHoursFieldsEl.innerHTML = "";
}

function showDiscountFollowUp(followUp) {
  discountFollowUpMessageEl.textContent = followUp.message;
  discountFollowUpAmountInputEl.value = "";
  discountFollowUpReasonInputEl.value = followUp.suggestedReason || "";
  discountFollowUpStatusEl.textContent = "";
  discountFollowUpSectionEl.classList.remove("hidden");
}

function hideDiscountFollowUp() {
  discountFollowUpSectionEl.classList.add("hidden");
  discountFollowUpMessageEl.textContent = "";
  discountFollowUpAmountInputEl.value = "";
  discountFollowUpReasonInputEl.value = "";
  discountFollowUpStatusEl.textContent = "";
  state.pendingDiscountFollowUp = null;
}

function showToneFollowUp(invoice) {
  state.pendingToneInvoice = invoice;
  toneFollowUpInputEl.value = "";
  toneFollowUpSectionEl.classList.remove("hidden");
  toneFollowUpStatusEl.textContent = "";
}

function hideToneFollowUp() {
  toneFollowUpSectionEl.classList.add("hidden");
  toneFollowUpInputEl.value = "";
  toneFollowUpStatusEl.textContent = "";
  state.pendingToneInvoice = null;
}

async function completeToneStep(invoice) {
  hideDiscountFollowUp();

  if (state.requestedTone) {
    await applyToneAndFinalize(invoice, state.requestedTone);
    setEntryMessage("success", "Invoice generated with selected tone.");
    return;
  }

  state.invoice = null;
  workspaceSection.classList.add("hidden");
  showToneFollowUp(invoice);
  setEntryMessage("info", "One quick question before finalizing wording.");
}

async function applyToneAndFinalize(invoice, tone) {
  const response = await fetch("/api/invoices/reword-full", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice,
      tone
    })
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const payload = await response.json();
  state.invoice = ensureEditableInvoice(payload.invoice);
  state.isDirty = true;
  hideToneFollowUp();
  renderWorkspace();
  workspaceSection.classList.remove("hidden");
}

function renderLaborHourInputs(laborItems) {
  hourlyLineHoursFieldsEl.innerHTML = "";

  if (!Array.isArray(laborItems) || !laborItems.length) {
    return;
  }

  laborItems.forEach((item, index) => {
    const row = document.createElement("label");
    const datePrefix = item.date ? `${item.date}: ` : "";
    const prefilledHours = typeof item.hours === "number" ? `value="${item.hours}"` : "";
    row.innerHTML = `
      Hours for ${escapeHtml(datePrefix + item.description)}
      <input data-role="line-hours" type="number" step="0.01" min="0.01" placeholder="e.g. 2.5" ${prefilledHours} />
    `;
    hourlyLineHoursFieldsEl.append(row);
  });
}

function buildInvoiceDocumentMarkup(invoice) {
  const lineRows = invoice.lineItems
    .map(
      (lineItem) => `
        <tr>
          <td>${escapeHtml(lineItem.description || "")}</td>
          <td>${stringValue(lineItem.quantity)}</td>
          <td>${formatMoney(lineItem.unitPrice ?? 0)}</td>
          <td>${formatMoney(lineItem.amount ?? 0)}</td>
        </tr>
      `
    )
    .join("");

  const issueDate = invoice.issueDate || "-";
  const servicePeriod = formatServicePeriod(invoice.servicePeriodStart, invoice.servicePeriodEnd);
  const customerName = invoice.customerName || "-";
  const invoiceNumber = invoice.invoiceNumber || "-";
  const notes = invoice.notes ? `<p><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</p>` : "";
  const discountAmount = typeof invoice.discountAmount === "number" ? Math.max(0, invoice.discountAmount) : 0;
  const discountLabel = invoice.discountReason ? `Discount (${escapeHtml(invoice.discountReason)})` : "Discount";
  const discountRow =
    discountAmount > 0
      ? `<div><span>${discountLabel}</span><span>- ${formatMoney(discountAmount)}</span></div>`
      : "";

  return `
    <article class="invoice-doc">
      <header class="invoice-doc-header">
        <div>
          <h1 class="invoice-doc-title">Invoice</h1>
          <p><strong>Invoice #:</strong> ${escapeHtml(invoiceNumber)}</p>
          <p><strong>Issue Date:</strong> ${escapeHtml(issueDate)}</p>
          <p><strong>Service Period:</strong> ${escapeHtml(servicePeriod)}</p>
        </div>
        <div class="invoice-doc-meta">
          <p><strong>Bill To:</strong></p>
          <p>${escapeHtml(customerName)}</p>
        </div>
      </header>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>

      <section class="invoice-doc-summary">
        <div><span>Subtotal</span><span>${formatMoney(invoice.subtotal ?? 0)}</span></div>
        ${discountRow}
        <div class="invoice-doc-total"><span>Total</span><span>${formatMoney(invoice.total ?? 0)}</span></div>
        <div><span>Balance Due</span><span>${formatMoney(invoice.balanceDue ?? invoice.total ?? 0)}</span></div>
      </section>

      ${notes}
    </article>
  `;
}

function openDocumentPrintWindow(invoice) {
  const docWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!docWindow) {
    throw new Error("Pop-up blocked. Please allow pop-ups to print or download PDF.");
  }

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Invoice ${escapeHtml(invoice.invoiceNumber || "")}</title>
        <style>
          body { font-family: sans-serif; margin: 24px; color: #111; }
          .invoice-doc { max-width: 900px; margin: 0 auto; }
          .invoice-doc-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
          .invoice-doc-title { font-size: 28px; font-weight: 700; margin: 0; }
          .invoice-doc-meta p { margin: 0 0 4px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          .invoice-doc-summary { margin-top: 14px; max-width: 340px; margin-left: auto; }
          .invoice-doc-summary div { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .invoice-doc-total { font-weight: 700; }
          @media print {
            body { margin: 0.5in; }
            @page { size: auto; margin: 0.5in; }
          }
        </style>
      </head>
      <body>
        ${buildInvoiceDocumentMarkup(invoice)}
      </body>
    </html>
  `;

  docWindow.document.open();
  docWindow.document.write(html);
  docWindow.document.close();
  docWindow.focus();
  setTimeout(() => {
    docWindow.print();
  }, 150);
}

function formatServicePeriod(startDate, endDate) {
  if (startDate && endDate) {
    return `${startDate} to ${endDate}`;
  }

  if (startDate) {
    return `From ${startDate}`;
  }

  if (endDate) {
    return `Until ${endDate}`;
  }

  return "-";
}

function generateFallbackInvoiceNumber() {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `INV-${ymd}-${suffix}`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value) {
  return `$${round(value).toFixed(2)}`;
}

function stringValue(value) {
  return typeof value === "number" ? String(value) : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function asErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
}

async function readResponseError(response) {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return payload.error;
    }
  } catch {
    // Fall back to generic message.
  }
  return `Request failed (${response.status})`;
}
