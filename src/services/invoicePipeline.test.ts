import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setJsonTaskRunnerForTests } from "../ai/openaiClient.js";
import {
  changeDescriptionsWording,
  changeLineWording,
  changeNotesWording,
  detectDiscountIntent,
  rewriteFollowUpMessage,
  rewordFullInvoice
} from "./invoicePipeline.js";

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

test("rewordFullInvoice preserves an already-polished trade description when the model returns the awkward lead-in wording", async () => {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    return {
      lineItems: [{ id: "line-1", description: "Of sink and replacement of cartridge repair" }],
      notes: "Please remit payment within 7 days. Thank you."
    } as T;
  });

  const updated = await rewordFullInvoice({
    invoiceNumber: "INV-2C",
    issueDate: "2026-03-07",
    customerName: "Mike Johnson",
    currency: "USD",
    lineItems: [
      {
        id: "line-1",
        type: "labor",
        description: "Sink repair and cartridge replacement",
        quantity: 1,
        unitPrice: 90,
        amount: 90
      }
    ],
    notes: "pay in 7 days thanks",
    subtotal: 90,
    total: 90,
    balanceDue: 90
  });

  assert.equal(updated.lineItems[0]?.description, "Sink repair and cartridge replacement");
  assert.equal(updated.notes, "Please remit payment within 7 days. Thank you.");
});

test("rewordFullInvoice falls back when the model returns a repair-of phrasing that polishes into an awkward lead-in", async () => {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    return {
      lineItems: [{ id: "line-1", description: "Repair of sink and replacement of cartridge" }],
      notes: "Please remit payment within 7 days. Thank you."
    } as T;
  });

  const updated = await rewordFullInvoice({
    invoiceNumber: "INV-2D",
    issueDate: "2026-03-07",
    customerName: "Mike Johnson",
    currency: "USD",
    lineItems: [
      {
        id: "line-1",
        type: "labor",
        description: "Sink repair and cartridge replacement",
        quantity: 1,
        unitPrice: 90,
        amount: 90
      }
    ],
    notes: "pay in 7 days thanks",
    subtotal: 90,
    total: 90,
    balanceDue: 90
  });

  assert.equal(updated.lineItems[0]?.description, "Sink repair and cartridge replacement");
  assert.equal(updated.notes, "Please remit payment within 7 days. Thank you.");
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

test("rewriteFollowUpMessage keeps reminder intent and uses wording task", async () => {
  let capturedPrompt = "";
  let capturedOptions: CapturedTaskOptions | null = null;
  setJsonTaskRunnerForTests(async <T>(prompt: string, options?: CapturedTaskOptions): Promise<T> => {
    capturedPrompt = prompt;
    capturedOptions = options ?? null;
    return {
      message:
        "Hi Mike,\n\nJust checking in on INV-22. It was due yesterday. If anything is holding payment up, please let me know and I can help.\n\nBillie from NoteBill"
    } as T;
  });

  const rewritten = await rewriteFollowUpMessage(
    "Hi Mike,\n\nA quick follow-up on INV-22.\nIt was due yesterday.\nIf possible, please take a look and let me know if anything is blocking payment.\n\nBillie from NoteBill",
    "Friendlier"
  );

  assert.match(capturedPrompt, /Rewrite a payment follow-up message only\./);
  assert.equal((capturedOptions as CapturedTaskOptions | null)?.taskType, "wording");
  assert.match(rewritten, /INV-22/);
  assert.match(rewritten, /Billie from NoteBill/);
});

test("changeLineWording uses a deterministic fast path for Formal tone", async () => {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    throw new Error("Model should not run for deterministic Formal line wording.");
  });

  const updated = await changeLineWording(
    {
      invoiceNumber: "INV-5",
      issueDate: "2026-03-07",
      customerName: "Mike Johnson",
      currency: "USD",
      lineItems: [
        {
          id: "line-1",
          type: "labor",
          description: "fixed sink",
          quantity: 2,
          unitPrice: 80,
          amount: 160
        }
      ],
      notes: "",
      subtotal: 160,
      total: 160,
      balanceDue: 160
    },
    "line-1",
    "Formal"
  );

  assert.equal(updated.lineItems[0]?.description, "Sink repair");
  assert.equal(updated.lineItems[0]?.quantity, 2);
  assert.equal(updated.lineItems[0]?.unitPrice, 80);
  assert.equal(updated.lineItems[0]?.amount, 160);
});

test("changeDescriptionsWording uses a deterministic fast path for Neutral tone", async () => {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    throw new Error("Model should not run for deterministic Neutral description wording.");
  });

  const updated = await changeDescriptionsWording(
    {
      invoiceNumber: "INV-6",
      issueDate: "2026-03-07",
      customerName: "Mike Johnson",
      currency: "USD",
      lineItems: [
        {
          id: "line-1",
          type: "labor",
          description: "fixed sink",
          quantity: 2,
          unitPrice: 80,
          amount: 160
        },
        {
          id: "line-2",
          type: "material",
          description: "replaced washer",
          quantity: 1,
          unitPrice: 5,
          amount: 5
        }
      ],
      notes: "pay in 7 days thanks",
      subtotal: 165,
      total: 165,
      balanceDue: 165
    },
    "Neutral"
  );

  assert.deepEqual(
    updated.lineItems.map((lineItem) => lineItem.description),
    ["Sink repair", "Washer replacement"]
  );
  assert.equal(updated.notes, "pay in 7 days thanks");
});

test("rewordFullInvoice uses deterministic description cleanup when notes are blank and tone is Formal", async () => {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    throw new Error("Model should not run for deterministic Formal full wording cleanup.");
  });

  const updated = await rewordFullInvoice(
    {
      invoiceNumber: "INV-7",
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
        },
        {
          id: "line-2",
          type: "material",
          description: "washer kit",
          quantity: 1,
          unitPrice: 6,
          amount: 6
        }
      ],
      notes: "",
      subtotal: 166,
      total: 166,
      balanceDue: 166
    },
    "Formal"
  );

  assert.deepEqual(
    updated.lineItems.map((lineItem) => lineItem.description),
    ["Sink repair and cartridge replacement", "Washer kit"]
  );
});

// Pass-7 P1 (finding 2): the word "credit" near any number used to become
// an invoice discount — "Credit card payment: $500" became a $500 discount
// and "credit terms net 30" became $30 off. Payment/terms uses of "credit"
// must not discount, while genuine discount phrasing still does.
test("detectDiscountIntent ignores a credit-card payment mention", () => {
  assert.deepEqual(
    detectDiscountIntent("Fixed the faucet. Credit card payment: $500."),
    { kind: "none" },
    "a $500 credit-card payment is not a $500 discount"
  );
  assert.deepEqual(
    detectDiscountIntent("Paid $500 credit card for the repair."),
    { kind: "none" },
    "an amount before 'credit card' is not a discount either"
  );
});

test("detectDiscountIntent ignores credit terms", () => {
  assert.deepEqual(
    detectDiscountIntent("Job done, credit terms net 30, please invoice."),
    { kind: "none" },
    "'credit terms net 30' is not a $30 discount"
  );
});

test("detectDiscountIntent ignores other non-discount credit phrases", () => {
  for (const text of [
    "Customer credit limit $5000 on file.",
    "Ran a credit check, score 720.",
    "Credit score is 720.",
    "Paid from the credit account, $300."
  ]) {
    assert.deepEqual(detectDiscountIntent(text), { kind: "none" }, text);
  }
});

test("detectDiscountIntent still applies genuine discount phrasing", () => {
  assert.deepEqual(
    detectDiscountIntent("Sink leak repair 2h @ $95/hr and please add a $20 discount for delay."),
    { kind: "apply", amount: 20, reason: "Discount for delay" },
    "the golden-corpus $20 discount still applies"
  );
  assert.deepEqual(
    detectDiscountIntent("Apply a $25 credit for the delay."),
    { kind: "apply", amount: 25, reason: "Discount for the delay" },
    "an explicit $25 credit still applies"
  );
  assert.deepEqual(
    detectDiscountIntent("Credit $50 for the late arrival."),
    { kind: "apply", amount: 50, reason: "Discount for the late arrival" },
    "'credit $50 for ...' still applies"
  );
  assert.deepEqual(
    detectDiscountIntent("Please apply a credit of $50 for the inconvenience."),
    { kind: "apply", amount: 50, reason: "Discount for the inconvenience" },
    "'credit of $50' still applies"
  );
  assert.deepEqual(
    detectDiscountIntent("Take $30 off the total for the delay."),
    { kind: "apply", amount: 30, reason: "Discount for the delay" },
    "'$30 off' still applies"
  );
});

test("detectDiscountIntent keeps the customer's reason wording verbatim", () => {
  assert.deepEqual(
    detectDiscountIntent("Give a $20 discount for credit card processing."),
    { kind: "apply", amount: 20, reason: "Discount for credit card processing" },
    "masking must not rewrite the reason to 'payment processing'"
  );
});

test("detectDiscountIntent does not take a reason from a later sentence", () => {
  assert.deepEqual(
    detectDiscountIntent("Give a $20 discount. Credit card for materials."),
    { kind: "apply", amount: 20, reason: undefined },
    "a masked phrase in a later sentence cannot donate its reason"
  );
});

test("detectDiscountIntent ties the reason to the genuine discount, not an earlier credit phrase", () => {
  assert.deepEqual(
    detectDiscountIntent("Credit card for materials. Give a $20 discount for delay."),
    { kind: "apply", amount: 20, reason: "Discount for delay" },
    "the reason comes from the discount's own sentence, not the earlier credit-card phrase"
  );
});

test("detectDiscountIntent picks the real discount when credit-card text is also present", () => {
  assert.deepEqual(
    detectDiscountIntent("Credit card payment: $500. Give a $20 discount for delay."),
    { kind: "apply", amount: 20, reason: "Discount for delay" },
    "the $500 payment is ignored and only the $20 discount applies"
  );
});
