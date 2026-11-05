(() => {
  // Shared invoice money computation for the frontend surfaces (editor
  // canvas, inspector preview, client portal). This mirrors the server
  // contract in src/lib/invoiceMath.ts (normalizeInvoice /
  // normalizeLineItem) so every surface derives the same totals from the
  // same lines instead of each keeping a private formula:
  //   - a line's explicit amount takes precedence; otherwise the amount
  //     is quantity x unit price;
  //   - every line amount is rounded to cents before it is summed;
  //   - the discount applies before tax, and tax is charged on the
  //     discounted subtotal;
  //   - the balance is the total minus recorded payments, floored at 0.
  // It deliberately knows nothing about the tax schema: tax enters only
  // as the editor's current rate value, exactly as the canvas has always
  // supplied it. Stored tax fields remain the NB-A-01 contract's concern.

  const toNumber = (value) => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      return Number.parseFloat(value);
    }
    return NaN;
  };

  const roundToCents = (value) => {
    const parsed = toNumber(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  };

  // Accepts both the finished-invoice shape (quantity / unitPrice /
  // amount) and the editor shape (qty / rate, often strings). A line with
  // no explicit amount and no usable quantity/price pair resolves to 0,
  // matching normalizeLineItem leaving the amount unset (subtotal adds 0).
  const resolveLineAmount = (item) => {
    if (!item) {
      return 0;
    }
    const explicitAmount = toNumber(item.amount);
    if (Number.isFinite(explicitAmount)) {
      return roundToCents(explicitAmount);
    }
    const quantity = toNumber(item.quantity ?? item.qty);
    const unitPrice = toNumber(item.unitPrice ?? item.rate);
    if (Number.isFinite(quantity) && Number.isFinite(unitPrice)) {
      return roundToCents(quantity * unitPrice);
    }
    return 0;
  };

  const sumPaymentRecords = (paymentRecords) =>
    roundToCents(
      (Array.isArray(paymentRecords) ? paymentRecords : []).reduce((sum, record) => {
        const amount = toNumber(record?.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0)
    );

  // The caller decides which rows are billable (the editor passes only
  // rows with a description — the same rows its payload builders send —
  // so totals can never include a row the payload/PDF omits).
  const computeInvoiceTotals = ({ lineItems, discountAmount, taxRate, paymentRecords } = {}) => {
    const items = Array.isArray(lineItems) ? lineItems : [];
    const subtotal = roundToCents(items.reduce((sum, item) => sum + resolveLineAmount(item), 0));
    const requestedDiscount = roundToCents(Math.max(0, toNumber(discountAmount) || 0));
    const effectiveDiscountAmount = Math.min(subtotal, requestedDiscount);
    const discountedSubtotal = roundToCents(Math.max(0, subtotal - effectiveDiscountAmount));
    const parsedTaxRate = toNumber(taxRate);
    const taxAmount = roundToCents(discountedSubtotal * ((Number.isFinite(parsedTaxRate) ? parsedTaxRate : 0) / 100));
    const total = roundToCents(discountedSubtotal + taxAmount);
    const amountPaid = sumPaymentRecords(paymentRecords);
    const balanceDue = roundToCents(Math.max(0, total - amountPaid));
    return {
      subtotal,
      discountAmount: effectiveDiscountAmount,
      discountedSubtotal,
      taxAmount,
      total,
      amountPaid,
      balanceDue
    };
  };

  window.InvoiceMoneyUtils = {
    roundToCents,
    resolveLineAmount,
    computeInvoiceTotals
  };
})();
