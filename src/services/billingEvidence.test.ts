import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBillingEvidenceLedger,
  buildBillingEvidenceLedger,
  parseBillingEvidence,
  projectUnresolvedEvidenceToDecisions,
  reduceBillingEvidence,
  subjectIdentityKey
} from "./billingEvidence.js";
import { StructuredInvoice } from "../models/invoice.js";

test("AG-094 ledger: later quantity resolves before invoice application", () => {
  const source =
    "Added acid jugs but quantity unknown. Acid jugs quantity is 2.";
  const ledger = buildBillingEvidenceLedger(source);
  const quantityFact = ledger.find((fact) => fact.field === "quantity");
  assert.ok(quantityFact);
  assert.equal(quantityFact.state, "known");
  assert.equal(quantityFact.value, 2);

  const applied = applyBillingEvidenceLedger(
    {
      workSessions: [],
      materials: [{ description: "Acid jugs", unitCost: 74 }]
    } as StructuredInvoice,
    source
  );
  assert.equal(applied.structuredInvoice.materials[0].quantity, 2);
  assert.equal(applied.unresolvedFacts.length, 0);
});

test("AG-094 ledger: acid vs acid wash stay discriminative", () => {
  const source = "Added 1 acid but price unknown. Acid wash for $200.";
  const applied = applyBillingEvidenceLedger(
    {
      workSessions: [],
      materials: [
        { description: "Acid", quantity: 1, unitCost: 0, amount: 0 },
        { description: "Acid wash", quantity: 1, unitCost: 200, amount: 200 }
      ]
    } as StructuredInvoice,
    source
  );

  const acid = applied.structuredInvoice.materials.find((item) =>
    subjectIdentityKey(item.description) === subjectIdentityKey("acid")
  );
  const wash = applied.structuredInvoice.materials.find((item) =>
    /wash/i.test(item.description)
  );
  assert.ok(acid);
  assert.ok(wash);
  assert.equal(acid.unitCost, undefined);
  assert.equal(acid.amount, undefined);
  assert.equal(wash.unitCost, 200);
  assert.equal(wash.amount, 200);
  assert.ok(applied.unresolvedFacts.some((fact) => fact.field === "price"));
});

test("AG-094 ledger: missing rate binds labor and does not materialize", () => {
  const source = "Repaired pump for 2 hours, but rate unknown";
  const applied = applyBillingEvidenceLedger(
    {
      workSessions: [
        {
          tasks: [{ description: "Repaired pump", hours: 2, rate: 125, amount: 250 }]
        }
      ],
      materials: []
    } as StructuredInvoice,
    source
  );

  assert.equal(applied.structuredInvoice.materials.length, 0);
  const task = applied.structuredInvoice.workSessions[0].tasks[0];
  assert.equal(task.rate, undefined);
  assert.equal(task.amount, undefined);
  assert.equal(task.hours, 2);
  assert.ok(applied.unresolvedFacts.some((fact) => fact.field === "rate" && fact.subjectKind === "labor"));
});

test("AG-094 ledger: waived subject cannot authorize sibling via shared noun", () => {
  const source = "No charge for pump. Cleaned pump baskets.";
  const applied = applyBillingEvidenceLedger(
    {
      workSessions: [
        {
          tasks: [
            { description: "Pump", amount: 0 },
            { description: "Cleaned pump baskets", amount: 0 }
          ]
        }
      ],
      materials: []
    } as StructuredInvoice,
    source
  );

  const tasks = applied.structuredInvoice.workSessions[0].tasks;
  assert.ok(tasks.some((task) => /^pump$/i.test(task.description) && task.amount === 0));
  assert.equal(
    tasks.some((task) => /basket/i.test(task.description)),
    false
  );
});

test("AG-094 ledger: cost evidence cannot resolve quantity field", () => {
  const source = "Added acid jugs but quantity unknown. Acid jugs cost $74 each.";
  const ledger = buildBillingEvidenceLedger(source);
  const quantity = ledger.find((fact) => fact.field === "quantity");
  const cost = ledger.find((fact) => fact.field === "cost");
  assert.ok(quantity);
  assert.equal(quantity.state, "unresolved");
  assert.ok(cost);
  assert.equal(cost.state, "known");
  assert.equal(cost.value, 74);

  const applied = applyBillingEvidenceLedger(
    {
      workSessions: [],
      materials: [{ description: "Acid jugs" }]
    } as StructuredInvoice,
    source
  );
  assert.equal(applied.structuredInvoice.materials[0].quantity, undefined);
  assert.equal(applied.structuredInvoice.materials[0].unitCost, 74);
  assert.ok(applied.unresolvedFacts.some((fact) => fact.field === "quantity"));
  const decisions = projectUnresolvedEvidenceToDecisions(applied.unresolvedFacts);
  assert.ok(decisions.some((decision) => decision.evidenceField === "quantity"));
});

test("AG-094 ledger: ambiguous subject identity fails closed", () => {
  const source = "Added filter but price unknown";
  const applied = applyBillingEvidenceLedger(
    {
      workSessions: [],
      materials: [
        { description: "Filter", quantity: 1, unitCost: 40, amount: 40 },
        { description: "Filter", quantity: 2, unitCost: 40, amount: 80 }
      ]
    } as StructuredInvoice,
    source
  );

  // Ambiguous exact matches — do not mutate sibling lines.
  assert.equal(applied.structuredInvoice.materials[0].unitCost, 40);
  assert.equal(applied.structuredInvoice.materials[1].unitCost, 40);
  assert.equal(applied.lineBoundUnresolvedFacts.length, 0);
  assert.ok(applied.unresolvedFacts.some((fact) => fact.field === "price"));
});

test("AG-094 ledger: originating statement cannot self-resolve", () => {
  const raw = parseBillingEvidence("Add 1 acid jug but price unknown");
  const reduced = reduceBillingEvidence(raw);
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].state, "unresolved");
  assert.equal(reduced[0].field, "price");
});
