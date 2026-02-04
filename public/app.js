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

const workspaceSection = document.getElementById("workspaceSection");
const workspaceMetaEl = document.getElementById("workspaceMeta");
const dirtyIndicatorEl = document.getElementById("dirtyIndicator");
const lineItemsMountEl = document.getElementById("lineItemsMount");
const rewriteInvoiceBtn = document.getElementById("rewriteInvoiceBtn");
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
  pendingLaborFollowUp: null
};

bootstrap();

function bootstrap() {
  for (const radio of document.querySelectorAll('input[name="sourceMode"]')) {
    radio.addEventListener("change", onSourceModeChange);
  }

  generateBtn.addEventListener("click", onGenerateInvoice);
  rewriteInvoiceBtn.addEventListener("click", onRewriteInvoice);
  downloadBtn.addEventListener("click", onDownloadInvoice);
  saveBtn.addEventListener("click", onSaveInvoice);
  applyLaborPricingBtn.addEventListener("click", onApplyLaborPricing);

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
  setEntryBusy(true, "Generating invoice...");

  try {
    const formData = new FormData();
    const mode = getSourceMode();
    state.sourceType = mode;

    if (mode === "text_input") {
      const messyInput = messyInputEl.value.trim();
      if (!messyInput) {
        throw new Error("Paste messy notes before generating.");
      }
      formData.append("messyInput", messyInput);
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
      state.pendingLaborFollowUp = {
        message:
          payload.followUp?.message ||
          "I see labor work, but I don't have hours or a rate yet. Please choose how labor should be billed.",
        laborItems: Array.isArray(payload.followUp?.laborItems) ? payload.followUp.laborItems : []
      };
      state.invoice = null;
      showLaborFollowUp(state.pendingLaborFollowUp);
      workspaceSection.classList.add("hidden");
      setEntryBusy(false, "");
      setEntryMessage("info", "One quick question before finalizing.");
      return;
    }

    state.pendingLaborFollowUp = null;
    state.invoice = ensureEditableInvoice(payload.invoice);
    state.isDirty = true;
    renderWorkspace();
    workspaceSection.classList.remove("hidden");
    setEntryBusy(false, "");
    setEntryMessage("success", "Invoice generated. Review and click Save Invoice when ready.");
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
  applyLaborPricingBtn.disabled = true;

  try {
    const laborPricing = buildLaborPricingPayload();
    laborFollowUpStatusEl.textContent = "Applying labor pricing...";

    const response = await fetch("/api/invoices/from-input/labor-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredInvoice: state.structuredInvoice,
        laborPricing
      })
    });

    if (!response.ok) {
      throw new Error(await readResponseError(response));
    }

    const payload = await response.json();
    state.structuredInvoice = payload.structuredInvoice;
    state.invoice = ensureEditableInvoice(payload.invoice);
    state.pendingLaborFollowUp = null;
    state.isDirty = true;
    hideLaborFollowUp();
    renderWorkspace();
    workspaceSection.classList.remove("hidden");
    setEntryMessage("success", "Invoice generated with labor pricing.");
  } catch (error) {
    entryErrorEl.textContent = `Labor pricing failed: ${asErrorMessage(error)}`;
    setEntryMessage("warning", "Please check labor values and try again.");
  } finally {
    laborFollowUpStatusEl.textContent = "";
    applyLaborPricingBtn.disabled = false;
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

function onDownloadInvoice() {
  if (!state.invoice) {
    return;
  }

  const file = {
    exportedAt: new Date().toISOString(),
    invoice: state.invoice
  };

  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-${Date.now()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setWorkspaceMessage("info", "Downloaded mock invoice JSON.");
}

function renderWorkspace() {
  renderWorkspaceMeta();
  renderLineItemsTable();
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
  return {
    ...invoice,
    lineItems: updatedLineItems,
    subtotal: roundedSubtotal,
    total: roundedSubtotal,
    balanceDue: roundedSubtotal
  };
}

function ensureEditableInvoice(invoice) {
  const withLineIds = {
    ...invoice,
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
  downloadBtn.disabled = isBusy;
  saveBtn.disabled = isBusy;

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

function renderLaborHourInputs(laborItems) {
  hourlyLineHoursFieldsEl.innerHTML = "";

  if (!Array.isArray(laborItems) || !laborItems.length) {
    return;
  }

  laborItems.forEach((item, index) => {
    const row = document.createElement("label");
    const datePrefix = item.date ? `${item.date}: ` : "";
    row.innerHTML = `
      Hours for ${escapeHtml(datePrefix + item.description)}
      <input data-role="line-hours" type="number" step="0.01" min="0.01" placeholder="e.g. 2.5" />
    `;
    hourlyLineHoursFieldsEl.append(row);
  });
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
  return value
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
