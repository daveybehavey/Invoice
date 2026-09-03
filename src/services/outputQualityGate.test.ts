import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateInvoiceOutputQuality } from "./outputQualityGate.js";

test("[rule:structure.line_items_present] blocks when no line items are captured", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: { workSessions: [], materials: [] },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [],
      subtotal: 0,
      total: 0,
      balanceDue: 0
    }
  });

  assert.equal(quality.status, "needs_review");
  assert.ok(quality.blockers.some((item) => item.code === "missing_line_items"));
});

test("[rule:structure.totals_present] blocks when subtotal or total is missing", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: { workSessions: [], materials: [] },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "material",
          description: "Washer",
          quantity: 1,
          unitPrice: 5,
          amount: 5
        }
      ],
      subtotal: undefined,
      total: undefined,
      balanceDue: 5
    }
  });

  assert.equal(quality.status, "needs_review");
  assert.ok(quality.blockers.some((item) => item.code === "totals_missing"));
});

test("[rule:structure.totals_consistent] blocks when subtotal conflicts with line-item amounts", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: { workSessions: [], materials: [{ description: "Washer", amount: 5 }] },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "material",
          description: "Washer",
          quantity: 1,
          unitPrice: 5,
          amount: 5
        }
      ],
      subtotal: 8,
      total: 8,
      balanceDue: 8
    }
  });

  assert.equal(quality.status, "needs_review");
  assert.ok(quality.blockers.some((item) => item.code === "totals_conflict"));
});

test("[rule:structure.totals_consistent] blocks when total is below subtotal minus discount", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: { workSessions: [], materials: [{ description: "Washer", amount: 5 }] },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "material",
          description: "Washer",
          quantity: 1,
          unitPrice: 5,
          amount: 5
        }
      ],
      discountAmount: 1,
      subtotal: 5,
      total: 3,
      balanceDue: 3
    }
  });

  assert.equal(quality.status, "needs_review");
  assert.ok(quality.blockers.some((item) => item.code === "totals_conflict"));
});

test("passes send-ready output for clean labor + material invoice", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Jan 30",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: [{ description: "Cartridge", quantity: 1, unitCost: 18.75, amount: 18.75 }]
    },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      customerName: "Mike Johnson",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Faucet repair",
          quantity: 2,
          unitPrice: 80,
          amount: 160,
          sourceSessionDate: "Jan 30"
        },
        {
          id: "line_2",
          type: "material",
          description: "Cartridge replacement",
          quantity: 1,
          unitPrice: 18.75,
          amount: 18.75
        }
      ],
      subtotal: 178.75,
      total: 178.75,
      balanceDue: 178.75
    }
  });

  assert.equal(quality.status, "pass");
  assert.equal(quality.blockerCount, 0);
});

test("[rule:tone.client_facing] warns on informal line-item wording without blocking generate", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: {
      workSessions: [
        {
          date: "Jan 30",
          tasks: [{ description: "fixed sink thing", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: []
    },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "fixed sink thing",
          quantity: 2,
          unitPrice: 80,
          amount: 160,
          sourceSessionDate: "Jan 30"
        }
      ],
      subtotal: 160,
      total: 160,
      balanceDue: 160
    }
  });

  assert.equal(quality.status, "pass");
  assert.equal(quality.blockerCount, 0);
  assert.ok(quality.warnings.some((item) => item.code === "description_clarity"));
});

test("[rule:structure.separate_labor_materials] warns when output loses labor/material separation", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: {
      workSessions: [
        {
          date: "Jan 30",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: [{ description: "Cartridge", quantity: 1, unitCost: 18.75, amount: 18.75 }]
    },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Faucet repair",
          quantity: 2,
          unitPrice: 89.38,
          amount: 178.75,
          sourceSessionDate: "Jan 30"
        }
      ],
      subtotal: 178.75,
      total: 178.75,
      balanceDue: 178.75
    }
  });

  assert.equal(quality.status, "pass");
  assert.equal(quality.blockerCount, 0);
  assert.ok(quality.warnings.some((item) => item.code === "labor_material_separation"));
});

test("[rule:rewording.non_empty_description] blocks line items with blank descriptions", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: {
      workSessions: [
        {
          date: "Jan 30",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: []
    },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "   ",
          quantity: 2,
          unitPrice: 80,
          amount: 160
        }
      ],
      subtotal: 160,
      total: 160,
      balanceDue: 160
    }
  });

  assert.equal(quality.status, "needs_review");
  assert.ok(quality.blockers.some((item) => item.code === "description_clarity"));
});

test("[rule:structure.labor_pricing_format] blocks labor line missing explicit hours x rate", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: {
      workSessions: [
        {
          date: "Jan 30",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: []
    },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Faucet repair",
          quantity: undefined,
          unitPrice: undefined,
          amount: 160,
          sourceSessionDate: "Jan 30"
        }
      ],
      subtotal: 160,
      total: 160,
      balanceDue: 160
    }
  });

  assert.equal(quality.status, "needs_review");
  assert.ok(quality.blockers.some((item) => item.code === "labor_pricing_format"));
  assert.ok(quality.blockers.some((item) => item.code === "missing_price"));
});

test("[rule:money.missing_price] blocks unresolved priced line items", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: {
      workSessions: [
        {
          tasks: [{ description: "Opened pool", hours: 3, rate: 125, amount: 375 }]
        }
      ],
      materials: [{ description: "Acid jug", quantity: 1 }]
    },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Opened pool",
          quantity: 3,
          unitPrice: 125,
          amount: 375
        },
        {
          id: "line_2",
          type: "material",
          description: "Acid jug",
          quantity: 1,
          unitPrice: undefined,
          amount: undefined
        }
      ],
      subtotal: 375,
      total: 375,
      balanceDue: 375
    }
  });

  assert.equal(quality.status, "needs_review");
  assert.ok(quality.blockers.some((item) => item.code === "missing_price"));
});

test("[rule:multi_day.date_context] warns when multi-day work has weak date context", () => {
  const quality = evaluateInvoiceOutputQuality({
    structuredInvoice: {
      workSessions: [
        {
          date: "Jan 28",
          tasks: [{ description: "Inspection", hours: 0.5, rate: 0, amount: 0 }]
        },
        {
          date: "Jan 30",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: []
    },
    invoice: {
      invoiceNumber: "INV-1001",
      issueDate: "2026-02-25",
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Inspection",
          quantity: 0.5,
          unitPrice: 0,
          amount: 0,
          sourceSessionDate: undefined
        },
        {
          id: "line_2",
          type: "labor",
          description: "Faucet repair",
          quantity: 2,
          unitPrice: 80,
          amount: 160,
          sourceSessionDate: undefined
        }
      ],
      subtotal: 160,
      total: 160,
      balanceDue: 160
    }
  });

  assert.equal(quality.status, "pass");
  assert.ok(quality.warnings.some((item) => item.code === "multi_day_structure"));
});
