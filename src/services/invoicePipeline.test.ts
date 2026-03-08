import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setJsonTaskRunnerForTests } from "../ai/openaiClient.js";
import { rewordFullInvoice } from "./invoicePipeline.js";

afterEach(() => {
  setJsonTaskRunnerForTests(null);
});

test("rewordFullInvoice uses the single-line wording path when only one line needs rewriting", async () => {
  let capturedPrompt = "";
  setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
    capturedPrompt = prompt;
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
});

test("rewordFullInvoice keeps the full rewrite path when notes are present", async () => {
  let capturedPrompt = "";
  setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
    capturedPrompt = prompt;
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
});
