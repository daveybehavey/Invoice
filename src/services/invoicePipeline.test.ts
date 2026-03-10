import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setJsonTaskRunnerForTests } from "../ai/openaiClient.js";
import { changeNotesWording, rewordFullInvoice } from "./invoicePipeline.js";

type CapturedTaskOptions = {
  taskType?: string;
  maxCompletionTokens?: number;
};

afterEach(() => {
  setJsonTaskRunnerForTests(null);
});

test("rewordFullInvoice uses the single-line wording path when only one line needs rewriting", async () => {
  let capturedPrompt = "";
  let capturedOptions: CapturedTaskOptions | null = null;
  setJsonTaskRunnerForTests(async <T>(prompt: string, options?: CapturedTaskOptions): Promise<T> => {
    capturedPrompt = prompt;
    capturedOptions = options ?? null;
    return { description: "Kitchen faucet repair service" } as T;
  });

  const updated = await rewordFullInvoice({
    invoiceNumber: "INV-1",
    issueDate: "2026-03-07",
    customerName: "Mike Johnson",
    currency: "USD",
    lineItems: [
      {
        id: "line-1",
        type: "labor",
        description: "Faucet repair",
        quantity: 2,
        unitPrice: 80,
        amount: 160
      }
    ],
    notes: "",
    subtotal: 160,
    total: 160,
    balanceDue: 160
  });

  assert.equal(updated.lineItems[0]?.description, "Kitchen faucet repair service");
  assert.match(capturedPrompt, /Reword a single invoice line item\./);
  assert.doesNotMatch(capturedPrompt, /Rewrite invoice wording only\./);
  assert.equal((capturedOptions as CapturedTaskOptions | null)?.maxCompletionTokens, undefined);
});

test("rewordFullInvoice keeps the full rewrite path when notes are present", async () => {
  let capturedPrompt = "";
  let capturedOptions: CapturedTaskOptions | null = null;
  setJsonTaskRunnerForTests(async <T>(prompt: string, options?: CapturedTaskOptions): Promise<T> => {
    capturedPrompt = prompt;
    capturedOptions = options ?? null;
    return {
      lineItems: [{ id: "line-1", description: "Kitchen faucet repair service" }],
      notes: "Thank you for your business."
    } as T;
  });

  const updated = await rewordFullInvoice({
    invoiceNumber: "INV-2",
    issueDate: "2026-03-07",
    customerName: "Mike Johnson",
    currency: "USD",
    lineItems: [
      {
        id: "line-1",
        type: "labor",
        description: "Faucet repair",
        quantity: 2,
        unitPrice: 80,
        amount: 160
      }
    ],
    notes: "Thanks for your business.",
    subtotal: 160,
    total: 160,
    balanceDue: 160
  });

  assert.equal(updated.lineItems[0]?.description, "Kitchen faucet repair service");
  assert.equal(updated.notes, "Thank you for your business.");
  assert.match(capturedPrompt, /Rewrite invoice wording only\./);
  assert.equal((capturedOptions as CapturedTaskOptions | null)?.taskType, "wording");
  assert.ok(((capturedOptions as CapturedTaskOptions | null)?.maxCompletionTokens ?? 0) >= 500);
});

test("rewordFullInvoice falls back to a polished original when the model returns the exact awkward lead-in wording seen in production", async () => {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    return {
      lineItems: [{ id: "line-1", description: "Of sink and replacement of cartridge repair" }],
      notes: "Thank you for your business."
    } as T;
  });

  const updated = await rewordFullInvoice({
    invoiceNumber: "INV-2B",
    issueDate: "2026-03-07",
    customerName: "Mike Johnson",
    currency: "USD",
    lineItems: [
      {
        id: "line-1",
        type: "labor",
        description: "fixed sink and replaced cartridge",
        quantity: 2,
        unitPrice: 80,
        amount: 160
      }
    ],
    notes: "Thanks for your business.",
    subtotal: 160,
    total: 160,
    balanceDue: 160
  });

  assert.equal(updated.lineItems[0]?.description, "Sink repair and cartridge replacement");
  assert.equal(updated.notes, "Thank you for your business.");
});

test("rewordFullInvoice raises wording token budget for larger multi-line drafts", async () => {
  let capturedOptions: CapturedTaskOptions | null = null;
  setJsonTaskRunnerForTests(async <T>(_prompt: string, options?: CapturedTaskOptions): Promise<T> => {
    capturedOptions = options ?? null;
    return {
      lineItems: [
        { id: "line-1", description: "Inspect leaking faucet" },
        { id: "line-2", description: "Repair faucet assembly" },
        { id: "line-3", description: "Supply replacement cartridge" },
        { id: "line-4", description: "Supply washer kit" },
        { id: "line-5", description: "Parking reimbursement" },
        { id: "line-6", description: "Cabinet door adjustment" }
      ]
    } as T;
  });

  await rewordFullInvoice({
    invoiceNumber: "INV-3",
    issueDate: "2026-03-07",
    customerName: "Mike Johnson",
    currency: "USD",
    lineItems: [
      { id: "line-1", type: "labor", description: "inspect faucet", quantity: 0.5, unitPrice: 0, amount: 0 },
      { id: "line-2", type: "labor", description: "fix faucet", quantity: 2, unitPrice: 80, amount: 160 },
      { id: "line-3", type: "material", description: "cartridge", quantity: 1, unitPrice: 18.75, amount: 18.75 },
      { id: "line-4", type: "material", description: "washer kit", quantity: 1, unitPrice: 6, amount: 6 },
      { id: "line-5", type: "material", description: "parking", quantity: 1, unitPrice: 4.5, amount: 4.5 },
      { id: "line-6", type: "other", description: "cabinet door", quantity: 1, unitPrice: 0, amount: 0 }
    ],
    notes: "",
    subtotal: 189.25,
    total: 189.25,
    balanceDue: 189.25
  });

  assert.equal((capturedOptions as CapturedTaskOptions | null)?.taskType, "wording");
  assert.ok(((capturedOptions as CapturedTaskOptions | null)?.maxCompletionTokens ?? 0) >= 1000);
});

test("changeNotesWording rewrites only notes and keeps line items untouched", async () => {
  let capturedPrompt = "";
  let capturedOptions: CapturedTaskOptions | null = null;
  setJsonTaskRunnerForTests(async <T>(prompt: string, options?: CapturedTaskOptions): Promise<T> => {
    capturedPrompt = prompt;
    capturedOptions = options ?? null;
    return {
      notes: "Payment due within 7 days. Thank you for your business."
    } as T;
  });

  const updated = await changeNotesWording(
    {
      invoiceNumber: "INV-4",
      issueDate: "2026-03-07",
      customerName: "Mike Johnson",
      currency: "USD",
      lineItems: [
        {
          id: "line-1",
          type: "labor",
          description: "Faucet repair",
          quantity: 2,
          unitPrice: 80,
          amount: 160
        }
      ],
      notes: "pay in 7 days thanks",
      subtotal: 160,
      total: 160,
      balanceDue: 160
    },
    "More formal"
  );

  assert.equal(updated.notes, "Payment due within 7 days. Thank you for your business.");
  assert.equal(updated.lineItems[0]?.description, "Faucet repair");
  assert.match(capturedPrompt, /Rewrite invoice notes only\./);
  assert.equal((capturedOptions as CapturedTaskOptions | null)?.taskType, "wording");
});
