import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, afterEach, beforeEach, test } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_FILE = path.join(os.tmpdir(), `invoice-test-store-${randomUUID()}.json`);

const [{ app }, { setJsonTaskRunnerForTests }] = await Promise.all([
  import("./server.js"),
  import("./ai/openaiClient.js")
]);

const storeFilePath = process.env.INVOICE_STORE_FILE;
if (!storeFilePath) {
  throw new Error("INVOICE_STORE_FILE is required for tests.");
}

beforeEach(async () => {
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
});

afterEach(() => {
  setJsonTaskRunnerForTests(null);
});

after(async () => {
  setJsonTaskRunnerForTests(null);
  await fs.rm(storeFilePath, { force: true });
});

test("asks one labor pricing follow-up and does not finalize with $0 labor", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, true);
  assert.equal(response.body.invoice, undefined);
  assert.equal(
    response.body.followUp.message,
    "I see labor work, but some labor pricing is missing. Please choose how labor should be billed."
  );
  assert.equal(response.body.followUp.laborItems.length, 2);
});

test("asks labor follow-up when hours exist but labor rate is missing", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Tuesday",
          tasks: [{ description: "Tree removal and haul-off", hours: 8 }]
        },
        {
          date: "Wednesday",
          tasks: [{ description: "Lawn cleanup" }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "I worked 8 hours Tuesday removing trees and Wednesday cleanup."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, true);
  assert.equal(response.body.followUp.laborItems.length, 2);
  assert.equal(response.body.followUp.laborItems[0].hours, 8);
});

test("uses explicit hours and rate in text to avoid labor follow-up", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Fixed faucet leak" }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Fixed faucet leak (2 hours @ $80/hr)."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 1);
  assert.equal(laborLines[0].quantity, 2);
  assert.equal(laborLines[0].unitPrice, 80);
  assert.equal(laborLines[0].amount, 160);
});

test("converts explicit minutes with rate into hours to avoid labor follow-up", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 2",
          tasks: [{ description: "Cabinet door adjustment" }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Feb 2 cabinet door adjustment, 20 minutes at $80/hr."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 1);
  assert.equal(laborLines[0].quantity, 0.33);
  assert.equal(laborLines[0].unitPrice, 80);
  assert.equal(laborLines[0].amount, 26.4);
});

test("does not ask labor follow-up for explicit no-charge labor", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Thursday",
          tasks: [{ description: "Inspect prior repair", amount: 0 }]
        }
      ],
      materials: [{ description: "Washer", quantity: 1, unitCost: 4, amount: 4 }]
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Returned Thursday to inspect prior repair, no charge. Replaced one washer $4."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.total, 4);
});

test("returns unparsed lines when messy notes include unrelated items", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7.\nCustomer asked about painting the fence next month."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.ok(Array.isArray(response.body.unparsedLines));
  const unparsedCombined = response.body.unparsedLines.join(" ").toLowerCase();
  assert.ok(unparsedCombined.includes("painting") || unparsedCombined.includes("fence"));
});

test("creates decisions for ambiguous billable items even when audit is empty", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 3",
          tasks: [{ description: "Fixed leak", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: []
    },
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe — not sure if I should bill it."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.ok(Array.isArray(response.body.openDecisions));
  const hasCabinetDecision = response.body.openDecisions.some((decision: { prompt: string }) =>
    /cabinet/i.test(decision.prompt)
  );
  assert.ok(hasCabinetDecision);
});

test("flags unsure billing as a decision and holds pricing in fast mode", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 3",
          tasks: [
            {
              description: "Emergency leak stop",
              hours: 0.75,
              rate: 95,
              amount: 71.25
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 3 emergency leak stop, not sure if I should bill.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(decisions.length > 0);
  const hasLeakDecision = decisions.some((decision: { prompt: string }) =>
    /leak stop/i.test(decision.prompt)
  );
  assert.ok(hasLeakDecision);

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  const leakLine = laborLines.find((lineItem: { description: string }) =>
    /leak stop/i.test(lineItem.description)
  );
  assert.ok(leakLine);
  assert.equal(leakLine.amount, undefined);
});

test("keeps billing decisions even when the prompt includes an hourly rate", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 3",
          tasks: [
            {
              description: "Emergency leak stop",
              hours: 0.75,
              rate: 95,
              amount: 71.25
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 3 emergency leak stop, 0.75 hours at $95/hr — not sure if I should bill.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(decisions.length > 0);
  const hasLeakDecision = decisions.some((decision: { prompt: string }) =>
    /leak stop/i.test(decision.prompt)
  );
  assert.ok(hasLeakDecision);

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  const leakLine = laborLines.find((lineItem: { description: string }) =>
    /leak stop/i.test(lineItem.description)
  );
  assert.ok(leakLine);
  assert.equal(leakLine.amount, undefined);
});

test("does not resolve billing decisions from a bill-to directive", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 4",
          tasks: [
            {
              description: "Cabinet hinge adjustment",
              hours: 0.25,
              rate: 95,
              amount: 23.75
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Adjusted a cabinet hinge 0.25 hours at $95/hr — not sure if I should bill. Bill to Jill Parker.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(decisions.length > 0);
  const hasHingeDecision = decisions.some((decision: { prompt: string }) =>
    /cabinet hinge/i.test(decision.prompt)
  );
  assert.ok(hasHingeDecision);
});

test("uses prior sentence context for time-only billing uncertainty", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 3",
          tasks: [
            {
              description: "Emergency leak stop at Cafe Luna",
              hours: 0.75,
              rate: 95,
              amount: 71.25
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 3 emergency leak stop at Cafe Luna. 45 mins, not sure if I should bill.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  const hasLeakDecision = decisions.some((decision: { prompt: string }) =>
    /emergency leak stop/i.test(decision.prompt)
  );
  assert.ok(hasLeakDecision);

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  const leakLine = laborLines.find((lineItem: { description: string }) =>
    /emergency leak stop/i.test(lineItem.description)
  );
  assert.ok(leakLine);
  assert.equal(leakLine.amount, undefined);
});

test("does not create a decision for ambiguous tax mention in fast mode", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Fixed leak 2h @ $90/hr. Tax? I sometimes add 7.5% depending on job.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.equal(decisions.length, 0);
});

test("fast mode skips audit and still detects decisions", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe — not sure if I should bill it.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(Array.isArray(decisions));
  const hasCabinetDecision = decisions.some((decision: { prompt: string }) =>
    /cabinet/i.test(decision.prompt)
  );
  assert.ok(hasCabinetDecision);
});

test(
  "audit timeout falls back to heuristic decisions",
  { timeout: 8000 },
  async () => {
    setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
      if (prompt.includes("Parse messy invoice/job notes")) {
        return structuredWithLaborPricing() as T;
      }
      if (prompt.includes("You are auditing a parsed invoice")) {
        return await new Promise<T>(() => {});
      }
      throw new Error("Unexpected prompt");
    });

    const start = Date.now();
    const response = await request(app).post("/api/invoices/from-input").send({
      messyInput:
        "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe — not sure if I should bill it."
    });
    const duration = Date.now() - start;

    assert.equal(response.status, 200);
    assert.ok(duration < 4500);
    const decisions = response.body.openDecisions ?? [];
    const hasCabinetDecision = decisions.some((decision: { prompt: string }) =>
      /cabinet/i.test(decision.prompt)
    );
  assert.ok(hasCabinetDecision);
  }
);

test(
  "audit timeout reports auditStatus timed_out",
  { timeout: 8000 },
  async () => {
    setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
      if (prompt.includes("Parse messy invoice/job notes")) {
        return structuredWithLaborPricing() as T;
      }
      if (prompt.includes("You are auditing a parsed invoice")) {
        return await new Promise<T>(() => {});
      }
      throw new Error("Unexpected prompt");
    });

    const response = await request(app).post("/api/invoices/from-input").send({
      messyInput: "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe."
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.auditStatus, "timed_out");
  }
);

test("audit endpoint returns decisions and assumptions", async () => {
  setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
    if (prompt.includes("You are auditing a parsed invoice")) {
      return {
        assumptions: ["Tax assumed 0%."],
        decisions: [
          {
            kind: "billing",
            prompt: "Bill this item? \"Tightened cabinet hinge\"",
            sourceSnippet: "Tightened cabinet hinge maybe"
          }
        ],
        unparsedLines: ["Customer asked about fence painting"]
      } as T;
    }
    throw new Error("Unexpected prompt");
  });

  const response = await request(app).post("/api/invoices/audit").send({
    sourceText: "Feb 3 fixed leak 2h @ $90/hr. Tightened cabinet hinge maybe.",
    structuredInvoice: structuredWithLaborPricing()
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.openDecisions));
  assert.ok(response.body.openDecisions.length >= 1);
  assert.ok(
    response.body.openDecisions.some((decision: { prompt: string }) => /cabinet/i.test(decision.prompt))
  );
  const assumptions = response.body.assumptions ?? [];
  assert.ok(assumptions.some((item: string) => item.toLowerCase().includes("tax assumed")));
  const unparsed = response.body.unparsedLines ?? [];
  assert.ok(unparsed.some((item: string) => item.toLowerCase().includes("fence")));
});

test("chunks long messy input and merges structured invoices", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 5",
          tasks: [{ description: "Fixed sink", hours: 2, rate: 100, amount: 200 }]
        }
      ],
      materials: []
    },
    {
      workSessions: [],
      materials: [{ description: "Washer", quantity: 1, unitCost: 5, amount: 5 }]
    }
  ]);

  const filler = "lorem ipsum ".repeat(180);
  const paragraphOne = `Job A: Fixed sink 2 hours at $100/hr. ${filler}`;
  const paragraphTwo = `Parts: washer $5. ${filler}`;
  const longInput = `${paragraphOne}\n\n${paragraphTwo}`;
  assert.ok(longInput.length > 4000);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: longInput,
    mode: "fast"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const lineItems = response.body.invoice?.lineItems ?? [];
  const hasLaborLine = lineItems.some((lineItem: { description: string; type: string }) =>
    /fixed sink/i.test(lineItem.description)
  );
  const hasMaterialLine = lineItems.some((lineItem: { description: string; type: string }) =>
    /washer/i.test(lineItem.description)
  );
  assert.ok(hasLaborLine);
  assert.ok(hasMaterialLine);
});

test("moves internal reminder notes to unparsed lines", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 3",
          tasks: [{ description: "Fixed leak", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: [],
      notes: "Need to order a new drill next week."
    },
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Feb 3 fixed leak 2h @ $90/hr. Need to order a new drill next week."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const notes = response.body.invoice?.notes ?? "";
  assert.ok(!notes.toLowerCase().includes("drill"));
  const unparsed = response.body.unparsedLines.join(" ").toLowerCase();
  assert.ok(unparsed.includes("drill"));
});

test("treats ambiguous tax notes as assumptions not invoice notes", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 3",
          tasks: [{ description: "Fixed leak", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: [],
      notes: "Tax may apply at 5% if applicable."
    },
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Feb 3 fixed leak 2h @ $90/hr. Sometimes I add 5% tax."
  });

  assert.equal(response.status, 200);
  const notes = response.body.invoice?.notes ?? "";
  assert.ok(!notes.toLowerCase().includes("tax may apply"));
  const assumptions = (response.body.assumptions ?? []).join(" ").toLowerCase();
  assert.ok(assumptions.includes("tax assumed"));
});

test("does not silently assume labor hour splits when hourly input is incomplete", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal"
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.needsFollowUp, true);

  const second = await request(app).post("/api/invoices/from-input/labor-pricing").send({
    structuredInvoice: first.body.structuredInvoice,
    laborPricing: {
      billingType: "hourly",
      rate: 10,
      lineHours: [5]
    }
  });

  assert.equal(second.status, 400);
  assert.match(second.body.error, /provide hours for every labor line item/i);
});

test("finalizes labor totals from explicit hourly values", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal"
  });

  const second = await request(app).post("/api/invoices/from-input/labor-pricing").send({
    structuredInvoice: first.body.structuredInvoice,
    laborPricing: {
      billingType: "hourly",
      rate: 10,
      lineHours: [3, 2]
    }
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.needsFollowUp, false);

  const laborLines = second.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 2);
  assert.deepEqual(
    laborLines.map((lineItem: { quantity: number }) => lineItem.quantity),
    [3, 2]
  );
  assert.deepEqual(
    laborLines.map((lineItem: { unitPrice: number }) => lineItem.unitPrice),
    [10, 10]
  );
  assert.deepEqual(
    laborLines.map((lineItem: { amount: number }) => lineItem.amount),
    [30, 20]
  );
  assert.equal(second.body.invoice.total, 55);
});

test("auto-generates invoice number when parsed data has none", async () => {
  useMockResponses([
    {
      issueDate: "2026-02-04",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Fixed sink leak", hours: 2, rate: 95, amount: 190 }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.match(response.body.invoice.invoiceNumber, /^INV-\d{8}-\d{4}$/);
});

test("auto-applies explicit discount amount from input notes", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and please add a $20 discount for delay"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.discountAmount, 20);
  assert.equal(response.body.invoice.total, 177);
});

test("does not ask discount follow-up when discount amount is missing", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and apply a discount for delay"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.discountAmount, 0);
});

test("discount endpoint can apply a manual discount to an existing invoice", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr"
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.needsFollowUp, false);

  const second = await request(app).post("/api/invoices/from-input/discount").send({
    invoice: first.body.invoice,
    discountAmount: 25,
    discountReason: "Discount for delay"
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.needsFollowUp, false);
  assert.equal(second.body.invoice.discountAmount, 25);
  assert.equal(second.body.invoice.total, 172);
});

test("edit endpoint applies invoice updates from instruction", async () => {
  useMockResponses([
    {
      invoice: {
        invoiceNumber: "INV-200",
        issueDate: "2026-02-05",
        customerName: "Jamie Client",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Repair work",
            quantity: 2,
            unitPrice: 80,
            amount: 160
          }
        ],
        notes: "Updated notes",
        subtotal: 160,
        total: 160,
        balanceDue: 160
      }
    }
  ]);

  const response = await request(app).post("/api/invoices/edit").send({
    instruction: "Change the labor rate to $80/hr.",
    invoice: {
      invoiceNumber: "INV-200",
      issueDate: "2026-02-05",
      customerName: "Jamie Client",
      currency: "USD",
      lineItems: [
        {
          id: "line-1",
          type: "labor",
          description: "Repair work",
          quantity: 2,
          unitPrice: 90,
          amount: 180
        }
      ],
      notes: "Original notes",
      subtotal: 180,
      total: 180,
      balanceDue: 180
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.lineItems[0].unitPrice, 80);
  assert.equal(response.body.invoice.total, 160);
});

test("does not ask discount follow-up after labor pricing when discount amount is missing", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal; apply a discount for delay"
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.needsFollowUp, true);
  assert.equal(first.body.followUp.type, "labor_pricing");

  const second = await request(app).post("/api/invoices/from-input/labor-pricing").send({
    structuredInvoice: first.body.structuredInvoice,
    laborPricing: {
      billingType: "hourly",
      rate: 10,
      lineHours: [3, 2]
    },
    sourceText: "Jan 10 fixed sink leak and Jan 11 tested seal; apply a discount for delay"
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.needsFollowUp, false);
  assert.equal(second.body.invoice.discountAmount, 0);
});

test("reword-line keeps quantities, rates, and amounts unchanged", async () => {
  useMockResponses([{ description: "Reworded labor description" }]);

  const response = await request(app).post("/api/invoices/reword-line").send({
    lineItemId: "line_1",
    tone: "concise",
    invoice: {
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Original labor description",
          quantity: 2,
          unitPrice: 60,
          amount: 120
        }
      ],
      subtotal: 120,
      total: 120,
      balanceDue: 120
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.lineItems[0].description, "Reworded labor description");
  assert.equal(response.body.invoice.lineItems[0].quantity, 2);
  assert.equal(response.body.invoice.lineItems[0].unitPrice, 60);
  assert.equal(response.body.invoice.lineItems[0].amount, 120);
  assert.equal(response.body.invoice.total, 120);
});

test("save remains explicit-only", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const listBefore = await request(app).get("/api/invoices");
  assert.equal(listBefore.status, 200);
  assert.equal(listBefore.body.invoices.length, 0);

  const generated = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });

  assert.equal(generated.status, 200);
  assert.equal(generated.body.needsFollowUp, false);

  const listAfterGenerate = await request(app).get("/api/invoices");
  assert.equal(listAfterGenerate.status, 200);
  assert.equal(listAfterGenerate.body.invoices.length, 0);

  const rejectedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: false,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  assert.equal(rejectedSave.status, 400);

  const acceptedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  assert.equal(acceptedSave.status, 200);
  assert.equal(acceptedSave.body.invoice.status, "draft");

  const listAfterSave = await request(app).get("/api/invoices");
  assert.equal(listAfterSave.status, 200);
  assert.equal(listAfterSave.body.invoices.length, 1);
});

test("delete removes saved invoice", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const generated = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });

  assert.equal(generated.status, 200);

  const acceptedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  assert.equal(acceptedSave.status, 200);
  const savedId = acceptedSave.body.invoice.invoiceId;
  assert.ok(savedId);

  const deleteResponse = await request(app).delete(`/api/invoices/${savedId}`);
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.ok, true);

  const listAfterDelete = await request(app).get("/api/invoices");
  assert.equal(listAfterDelete.status, 200);
  assert.equal(listAfterDelete.body.invoices.length, 0);
});

test("soft delete hides invoice and restore brings it back", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const generated = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });

  const acceptedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  const savedId = acceptedSave.body.invoice.invoiceId;
  const softDelete = await request(app)
    .post(`/api/invoices/${savedId}/status`)
    .send({ status: "deleted" });

  assert.equal(softDelete.status, 200);
  assert.equal(softDelete.body.invoice.status, "deleted");

  const listAfterSoftDelete = await request(app).get("/api/invoices");
  assert.equal(listAfterSoftDelete.status, 200);
  assert.equal(listAfterSoftDelete.body.invoices.length, 0);

  const listIncludingDeleted = await request(app).get("/api/invoices?includeDeleted=true");
  assert.equal(listIncludingDeleted.status, 200);
  assert.equal(listIncludingDeleted.body.invoices.length, 1);
  assert.equal(listIncludingDeleted.body.invoices[0].status, "deleted");

  const restore = await request(app).post(`/api/invoices/${savedId}/restore`);
  assert.equal(restore.status, 200);
  assert.equal(restore.body.invoice.status, "draft");

  const listAfterRestore = await request(app).get("/api/invoices");
  assert.equal(listAfterRestore.status, 200);
  assert.equal(listAfterRestore.body.invoices.length, 1);
});

function useMockResponses(responses: unknown[]): void {
  const queue = [...responses];
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    if (!queue.length) {
      throw new Error("Mock response queue is empty.");
    }

    return queue.shift() as T;
  });
}

function structuredWithoutLaborPricing() {
  return {
    customerName: undefined,
    invoiceNumber: undefined,
    issueDate: undefined,
    workSessions: [
      {
        date: "Jan 10",
        tasks: [{ description: "Fixed sink leak" }]
      },
      {
        date: "Jan 11",
        tasks: [{ description: "Tested seal" }]
      }
    ],
    materials: [{ description: "Pipe tape", quantity: 1, unitCost: 5, amount: 5 }],
    notes: undefined
  };
}

function structuredWithLaborPricing() {
  return {
    invoiceNumber: "INV-100",
    issueDate: "2026-02-04",
    workSessions: [
      {
        date: "Jan 10",
        tasks: [{ description: "Fixed sink leak", hours: 2, rate: 95, amount: 190 }]
      }
    ],
    materials: [{ description: "Pipe tape", quantity: 1, unitCost: 7, amount: 7 }]
  };
}
