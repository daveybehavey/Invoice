import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveInvoiceReminderTiming,
  type InvoiceReminderSettings
} from "./invoiceReminderScheduler.js";

const settings: InvoiceReminderSettings = {
  dueAfterDays: 14,
  cooldownDays: 7,
  maxPerRun: 25
};

test("first invoice reminder uses due date when it falls after the original send", () => {
  const timing = resolveInvoiceReminderTiming({
    dueDate: "2026-04-15",
    lastSentAt: "2026-04-01T12:00:00.000Z",
    sendCount: 1,
    settings: {
      ...settings,
      dueAfterDays: 60
    }
  });

  assert.equal(timing?.reason, "past_due");
  assert.equal(timing?.dueDate, "2026-04-15");
  assert.equal(timing?.nextReminderAt, "2026-04-15T00:00:00.000Z");
});

test("first invoice reminder falls back to follow-up window when due date is before send", () => {
  const timing = resolveInvoiceReminderTiming({
    dueDate: "2026-03-20",
    lastSentAt: "2026-04-01T12:00:00.000Z",
    sendCount: 1,
    settings
  });

  assert.equal(timing?.reason, "follow_up_window");
  assert.equal(timing?.dueDate, "2026-03-20");
  assert.equal(timing?.nextReminderAt, "2026-04-15T12:00:00.000Z");
});

test("repeat invoice reminders use cooldown after a reminder has already been sent", () => {
  const timing = resolveInvoiceReminderTiming({
    dueDate: "2026-04-15",
    lastSentAt: "2026-04-20T09:30:00.000Z",
    sendCount: 2,
    settings
  });

  assert.equal(timing?.reason, "cooldown");
  assert.equal(timing?.dueDate, "2026-04-15");
  assert.equal(timing?.nextReminderAt, "2026-04-27T09:30:00.000Z");
});
