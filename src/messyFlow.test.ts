import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, afterEach, beforeEach, test } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_FILE = path.join(os.tmpdir(), `invoice-messy-flow-store-${randomUUID()}.json`);

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
