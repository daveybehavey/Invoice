import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, afterEach, beforeEach, test } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_FILE = path.join(os.tmpdir(), `invoice-messy-flow-store-${randomUUID()}.json`);
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-messy-ocr-${randomUUID()}.json`);

const [{ app }, { setJsonTaskRunnerForTests }] = await Promise.all([
  import("./server.js"),
  import("./ai/openaiClient.js")
]);

const storeFilePath = process.env.INVOICE_STORE_FILE;
if (!storeFilePath) {
  throw new Error("INVOICE_STORE_FILE is required for tests.");
}
const ocrMetricsStoreFilePath = process.env.OCR_METRICS_STORE_FILE;
if (!ocrMetricsStoreFilePath) {
  throw new Error("OCR_METRICS_STORE_FILE is required for tests.");
}

beforeEach(async () => {
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
  await fs.mkdir(path.dirname(ocrMetricsStoreFilePath), { recursive: true });
  await fs.rm(ocrMetricsStoreFilePath, { force: true });
});

afterEach(() => {
  setJsonTaskRunnerForTests(null);
});

after(async () => {
  setJsonTaskRunnerForTests(null);
  await fs.rm(storeFilePath, { force: true });
  await fs.rm(ocrMetricsStoreFilePath, { force: true });
});

test("messy control script produces a ready draft with no open decisions", async () => {
  useMockResponses([
    {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Fixed leaking sink", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: [{ description: "Washer", quantity: 1, unitCost: 5, amount: 5 }]
    },
    { assumptions: ["Tax assumed 0%."], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Fixed leaking sink on Jan 10. 2 hours at $90/hr. Parts: washer $5. Bill Mike Johnson. No tax."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal((response.body.openDecisions ?? []).length, 0);
  assert.equal(response.body.invoice.customerName, "Mike Johnson");
  assert.equal(response.body.invoice.total, 185);
  assert.equal(response.body.invoice.taxRate ?? 0, 0);
});

test("messy script keeps cabinet decision open and tax as assumption", async () => {
  useMockResponses([
    messyStructuredDraft(),
    {
      assumptions: ["Tax not applied until confirmed."],
      decisions: [
        {
          kind: "billing",
          prompt: "Bill cabinet door adjustment?",
          sourceSnippet: "Didn't really think about charging for that - up to you."
        }
      ],
      unparsedLines: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: [
      "Jan 28 inspection visit, no charge, maybe 30 mins.",
      "Jan 30 faucet repair, about 2 hours at $80/hr.",
      "Parts: cartridge $18.75, washer kit $6, parking $4.50.",
      "Feb 2 cabinet door adjustment maybe 20 mins, up to you if bill.",
      "Logo tweak flat $250.",
      "I sometimes add 5% tax, sometimes not."
    ].join(" ")
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const openDecisions = response.body.openDecisions ?? [];
  assert.ok(openDecisions.some((decision: { prompt: string }) => /cabinet/i.test(decision.prompt)));
  assert.ok(!openDecisions.some((decision: { prompt: string }) => /tax/i.test(decision.prompt)));
  assert.equal(response.body.invoice.taxRate ?? 0, 0);
  assert.ok(
    (response.body.assumptions ?? []).some((assumption: string) => /tax assumed|tax not applied/i.test(assumption))
  );

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  const cabinetLine = laborLines.find((lineItem: { description: string }) =>
    /cabinet/i.test(lineItem.description)
  );
  assert.ok(cabinetLine);
  assert.equal(cabinetLine.amount, undefined);
});

test("messy script clears decisions when user explicitly resolves them", async () => {
  useMockResponses([
    messyStructuredDraft(),
    {
      assumptions: ["Tax not applied until confirmed."],
      decisions: [
        {
          kind: "billing",
          prompt: "Bill cabinet door adjustment?",
          sourceSnippet: "Didn't really think about charging for that - up to you."
        }
      ],
      unparsedLines: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: [
      "Jan 28 inspection visit, no charge, maybe 30 mins.",
      "Jan 30 faucet repair, about 2 hours at $80/hr.",
      "Parts: cartridge $18.75, washer kit $6, parking $4.50.",
      "Feb 2 cabinet door adjustment maybe 20 mins, up to you if bill.",
      "Logo tweak flat $250.",
      "I sometimes add 5% tax, sometimes not.",
      "Don't bill the cabinet door.",
      "No tax."
    ].join(" ")
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal((response.body.openDecisions ?? []).length, 0);
  assert.equal(response.body.invoice.taxRate ?? 0, 0);
});

test("messy regression matrix keeps capture + decision outcomes stable", async () => {
  const cases: Array<{
    name: string;
    messyInput: string;
    responses: unknown[];
    expected: ReturnType<typeof buildMessySnapshot>;
  }> = [
    {
      name: "multi-line baseline with explicit pricing",
      messyInput: [
        "Jan 5 replaced shutoff valve 1 hour at $100/hr.",
        "Jan 6 pipe adjustment 2 hours at $80/hr.",
        "Parts: washer $5.",
        "Bill Jordan Lee.",
        "No tax."
      ].join(" "),
      responses: [
        {
          customerName: "Jordan Lee",
          workSessions: [
            {
              date: "Jan 5",
              tasks: [{ description: "Replaced shutoff valve", hours: 1, rate: 100, amount: 100 }]
            },
            {
              date: "Jan 6",
              tasks: [{ description: "Pipe adjustment", hours: 2, rate: 80, amount: 160 }]
            }
          ],
          materials: [{ description: "Washer", quantity: 1, unitCost: 5, amount: 5 }]
        },
        { assumptions: ["Tax assumed 0%."], decisions: [], unparsedLines: [] }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Jordan Lee",
        servicePeriodStart: "Jan 5",
        servicePeriodEnd: "Jan 6",
        lineItemCount: 3,
        subtotal: 265,
        total: 265,
        taxRate: null
      }
    },
    {
      name: "ambiguous cabinet billing remains open",
      messyInput: [
        "Jan 28 inspection visit, no charge, maybe 30 mins.",
        "Jan 30 faucet repair, about 2 hours at $80/hr.",
        "Parts: cartridge $18.75, washer kit $6, parking $4.50.",
        "Feb 2 cabinet door adjustment maybe 20 mins, up to you if bill.",
        "Logo tweak flat $250.",
        "I sometimes add 5% tax, sometimes not."
      ].join(" "),
      responses: [
        messyStructuredDraft(),
        {
          assumptions: ["Tax not applied until confirmed."],
          decisions: [
            {
              kind: "billing",
              prompt: "Bill cabinet door adjustment?",
              sourceSnippet: "Didn't really think about charging for that - up to you."
            }
          ],
          unparsedLines: []
        }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: ["bill cabinet door adjustment?"],
        qualityStatus: "needs_review",
        qualityBlockerCount: 1,
        customerName: "Mike Johnson",
        servicePeriodStart: "Jan 28",
        servicePeriodEnd: "Feb 2",
        lineItemCount: 7,
        subtotal: 439.25,
        total: 439.25,
        taxRate: null
      }
    },
    {
      name: "explicit resolution clears open decisions",
      messyInput: [
        "Jan 28 inspection visit, no charge, maybe 30 mins.",
        "Jan 30 faucet repair, about 2 hours at $80/hr.",
        "Parts: cartridge $18.75, washer kit $6, parking $4.50.",
        "Feb 2 cabinet door adjustment maybe 20 mins, up to you if bill.",
        "Logo tweak flat $250.",
        "I sometimes add 5% tax, sometimes not.",
        "Don't bill the cabinet door.",
        "No tax."
      ].join(" "),
      responses: [
        messyStructuredDraft(),
        {
          assumptions: ["Tax not applied until confirmed."],
          decisions: [
            {
              kind: "billing",
              prompt: "Bill cabinet door adjustment?",
              sourceSnippet: "Didn't really think about charging for that - up to you."
            }
          ],
          unparsedLines: []
        }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Mike Johnson",
        servicePeriodStart: "Jan 28",
        servicePeriodEnd: "Feb 2",
        lineItemCount: 7,
        subtotal: 465.65,
        total: 465.65,
        taxRate: null
      }
    },
    {
      name: "labor follow-up required when pricing absent",
      messyInput: "Did two labor jobs this week. One was a leak inspection and one was a faucet fix.",
      responses: [
        {
          customerName: "Taylor Quinn",
          workSessions: [
            {
              date: "This week",
              tasks: [{ description: "Leak inspection" }, { description: "Faucet fix" }]
            }
          ],
          materials: []
        }
      ],
      expected: {
        needsFollowUp: true,
        followUpType: "labor_pricing",
        followUpLaborCount: 2,
        openDecisionPrompts: [],
        qualityStatus: null,
        qualityBlockerCount: 0,
        customerName: null,
        servicePeriodStart: null,
        servicePeriodEnd: null,
        lineItemCount: null,
        subtotal: null,
        total: null,
        taxRate: null
      }
    },
    {
      name: "minute-based labor converts to priced labor line",
      messyInput: "Feb 2 adjusted cabinet door for 20 minutes at $80/hr.",
      responses: [
        {
          customerName: "Morgan Vale",
          workSessions: [
            {
              date: "Feb 2",
              tasks: [{ description: "Adjusted cabinet door" }]
            }
          ],
          materials: []
        },
        { assumptions: [], decisions: [], unparsedLines: [] }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Morgan Vale",
        servicePeriodStart: "Feb 2",
        servicePeriodEnd: "Feb 2",
        lineItemCount: 1,
        subtotal: 26.4,
        total: 26.4,
        taxRate: null
      }
    },
    {
      name: "informal labor wording stays pass with quality warning",
      messyInput: "Jan 12 fixed random thing stuff 1h at $90/hr.",
      responses: [
        {
          customerName: "Casey Lane",
          workSessions: [
            {
              date: "Jan 12",
              tasks: [{ description: "fixed random thing stuff", hours: 1, rate: 90, amount: 90 }]
            }
          ],
          materials: []
        },
        { assumptions: [], decisions: [], unparsedLines: [] }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Casey Lane",
        servicePeriodStart: "Jan 12",
        servicePeriodEnd: "Jan 12",
        lineItemCount: 1,
        subtotal: 90,
        total: 90,
        taxRate: null
      }
    },
    {
      name: "materials-only capture remains send-ready",
      messyInput: "Bought PVC glue $8.50 and two couplings $6 total for Mike.",
      responses: [
        {
          customerName: "Mike",
          workSessions: [],
          materials: [
            { description: "PVC glue", quantity: 1, unitCost: 8.5, amount: 8.5 },
            { description: "Couplings", quantity: 2, unitCost: 3, amount: 6 }
          ]
        },
        { assumptions: ["Tax assumed 0%."], decisions: [], unparsedLines: [] }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Mike",
        servicePeriodStart: null,
        servicePeriodEnd: null,
        lineItemCount: 2,
        subtotal: 14.5,
        total: 14.5,
        taxRate: null
      }
    },
    {
      name: "multi-day labor stays pass with explicit service range",
      messyInput: "Jan 2 first visit 1h @ $100/hr, Jan 4 second visit 2h @ $100/hr.",
      responses: [
        {
          customerName: "Dana Holt",
          servicePeriodStart: "Jan 2",
          servicePeriodEnd: "Jan 4",
          workSessions: [
            {
              date: "Jan 2",
              tasks: [{ description: "First visit", hours: 1, rate: 100, amount: 100 }]
            },
            {
              date: "Jan 4",
              tasks: [{ description: "Second visit", hours: 2, rate: 100, amount: 200 }]
            }
          ],
          materials: []
        },
        { assumptions: [], decisions: [], unparsedLines: [] }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Dana Holt",
        servicePeriodStart: "Jan 2",
        servicePeriodEnd: "Jan 4",
        lineItemCount: 2,
        subtotal: 300,
        total: 300,
        taxRate: null
      }
    },
    {
      name: "explicit no-charge labor remains pass with zero totals line",
      messyInput: "Jan 18 inspected leak 30 minutes no charge.",
      responses: [
        {
          customerName: "Nora Kim",
          workSessions: [
            {
              date: "Jan 18",
              tasks: [{ description: "Leak inspection", hours: 0.5, amount: 0 }]
            }
          ],
          materials: []
        },
        { assumptions: [], decisions: [], unparsedLines: [] }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Nora Kim",
        servicePeriodStart: "Jan 18",
        servicePeriodEnd: "Jan 18",
        lineItemCount: 1,
        subtotal: 0,
        total: 0,
        taxRate: null
      }
    },
    {
      name: "logo design flat fee remains pass with clean wording",
      messyInput: "Website logo tweak flat $250 for Acme Bakery.",
      responses: [
        {
          customerName: "Acme Bakery",
          workSessions: [
            {
              date: "Feb 1",
              tasks: [{ description: "logo tweak", amount: 250 }]
            }
          ],
          materials: []
        },
        { assumptions: [], decisions: [], unparsedLines: [] }
      ],
      expected: {
        needsFollowUp: false,
        followUpType: null,
        followUpLaborCount: 0,
        openDecisionPrompts: [],
        qualityStatus: "pass",
        qualityBlockerCount: 0,
        customerName: "Acme Bakery",
        servicePeriodStart: "Feb 1",
        servicePeriodEnd: "Feb 1",
        lineItemCount: 1,
        subtotal: 250,
        total: 250,
        taxRate: null
      }
    }
  ];

  for (const testCase of cases) {
    useMockResponses(testCase.responses);
    const response = await request(app).post("/api/invoices/from-input").send({
      messyInput: testCase.messyInput
    });
    assert.equal(response.status, 200, `status for case: ${testCase.name}`);
    const snapshot = buildMessySnapshot(response.body);
    assert.deepEqual(snapshot, testCase.expected, `snapshot mismatch for case: ${testCase.name}`);
  }
});

function buildMessySnapshot(body: any) {
  const invoice = body?.invoice;
  const followUp = body?.followUp;
  const openDecisionPrompts = Array.isArray(body?.openDecisions)
    ? body.openDecisions
        .map((decision: { prompt?: string }) => String(decision?.prompt ?? "").trim().toLowerCase())
        .filter(Boolean)
        .sort()
    : [];
  return {
    needsFollowUp: Boolean(body?.needsFollowUp),
    followUpType: typeof followUp?.type === "string" ? followUp.type : null,
    followUpLaborCount: Array.isArray(followUp?.laborItems) ? followUp.laborItems.length : 0,
    openDecisionPrompts,
    qualityStatus: typeof body?.qualityGate?.status === "string" ? body.qualityGate.status : null,
    qualityBlockerCount: Number.isFinite(body?.qualityGate?.blockerCount)
      ? body.qualityGate.blockerCount
      : 0,
    customerName: typeof invoice?.customerName === "string" ? invoice.customerName : null,
    servicePeriodStart: typeof invoice?.servicePeriodStart === "string" ? invoice.servicePeriodStart : null,
    servicePeriodEnd: typeof invoice?.servicePeriodEnd === "string" ? invoice.servicePeriodEnd : null,
    lineItemCount: Array.isArray(invoice?.lineItems) ? invoice.lineItems.length : null,
    subtotal: Number.isFinite(invoice?.subtotal) ? invoice.subtotal : null,
    total: Number.isFinite(invoice?.total) ? invoice.total : null,
    taxRate: Number.isFinite(invoice?.taxRate) ? invoice.taxRate : null
  };
}

function useMockResponses(responses: unknown[]): void {
  const queue = [...responses];
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    if (!queue.length) {
      throw new Error("Mock response queue is empty.");
    }
    return queue.shift() as T;
  });
}

function messyStructuredDraft() {
  return {
    customerName: "Mike Johnson",
    workSessions: [
      {
        date: "Jan 28",
        tasks: [{ description: "Inspection visit", amount: 0 }]
      },
      {
        date: "Jan 30",
        tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
      },
      {
        date: "Feb 2",
        tasks: [{ description: "Cabinet door adjustment", hours: 0.33, rate: 80, amount: 26.4 }]
      },
      {
        date: "Earlier in month",
        tasks: [{ description: "Logo tweak", amount: 250 }]
      }
    ],
    materials: [
      { description: "Cartridge", quantity: 1, unitCost: 18.75, amount: 18.75 },
      { description: "Washer kit", quantity: 1, unitCost: 6, amount: 6 },
      { description: "Parking", quantity: 1, unitCost: 4.5, amount: 4.5 }
    ]
  };
}
