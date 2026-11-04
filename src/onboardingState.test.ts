import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../public/utils/onboardingState.js", import.meta.url), "utf8");
const load = (completedSteps: Record<string, string> = {}) => {
  const storage = new Map([["firstInvoiceOnboarding", JSON.stringify({ completedSteps })]]);
  const window: any = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    dispatchEvent() {}
  };
  vm.runInNewContext(source, { window, CustomEvent: class {} });
  return window.InvoiceOnboardingState;
};

test("manual checklist requires successful save and export milestones", () => {
  const state = load();
  assert.equal(state.buildStatus().totalSteps, 5);
  state.markStep("open_editor");
  assert.equal(state.buildStatus().totalSteps, 3);
  assert.equal(state.buildStatus().nextStep.id, "save_invoice");
  state.markStep("save_invoice");
  assert.equal(state.buildStatus().complete, false);
  assert.equal(state.buildStatus().nextStep.id, "export_pdf");
  state.markStep("export_pdf");
  assert.equal(state.buildStatus().complete, true);
  assert.equal(state.buildStatus().completionVisible, true);
  assert.equal(state.buildStatus().progressPercent, 100);
  assert.equal(state.readState().completedSteps.capture_notes, undefined);
  state.acknowledgeCompletion();
  assert.equal(state.buildStatus().completionVisible, false);
});

test("previously saved manual progress recovers without a storage migration", () => {
  const state = load({ open_editor: "2026-11-01", save_invoice: "2026-11-02", export_pdf: "2026-11-03" });
  assert.equal(state.buildStatus().complete, true);
  assert.equal(state.buildStatus().completedAt, "2026-11-03");
});

test("later intake use does not revoke a completed manual-first flow", () => {
  const state = load({
    open_editor: "2026-11-01T00:00:00.000Z",
    save_invoice: "2026-11-02T00:00:00.000Z",
    export_pdf: "2026-11-03T00:00:00.000Z",
    capture_notes: "2026-11-04T00:00:00.000Z"
  });
  const status = state.buildStatus();
  assert.equal(status.totalSteps, 3);
  assert.equal(status.complete, true);
  assert.equal(status.completedAt, "2026-11-03T00:00:00.000Z");
  state.markStep("review_draft");
  assert.equal(state.buildStatus().complete, true);
  assert.equal(state.buildStatus().totalSteps, 3);
});

test("intake progress retains all five steps", () => {
  for (const intakeStep of ["capture_notes", "review_draft"]) {
    const state = load({ [intakeStep]: "done", open_editor: "done", save_invoice: "done", export_pdf: "done" });
    assert.equal(state.buildStatus().totalSteps, 5);
    assert.equal(state.buildStatus().complete, false);
    state.markStep("capture_notes");
    state.markStep("review_draft");
    assert.equal(state.buildStatus().complete, true);
  }
});
