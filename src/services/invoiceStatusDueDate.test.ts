/**
 * Covers: src/services/invoiceDeliveryPolicy.ts (decideInvoiceStatusTransition)
 *         src/services/invoiceReminderScheduler.ts (resolveInvoiceReminderTiming)
 * Priority area: due-date / status transitions.
 * Fixed ISO clocks only — no wall-clock Date.now() dependence.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideInvoiceStatusTransition } from "./invoiceDeliveryPolicy.js";
import {
  resolveInvoiceReminderTiming,
  type InvoiceReminderSettings
} from "./invoiceReminderScheduler.js";
import type { SavedInvoiceStatus } from "../models/invoice.js";

const SETTINGS: InvoiceReminderSettings = {
  dueAfterDays: 14,
  cooldownDays: 7,
  maxPerRun: 25
};

const ALL_STATUSES: SavedInvoiceStatus[] = ["draft", "sent", "paid", "deleted"];

test("delivery purpose: only draft → sent transitions; every other pair is a no-op", () => {
  for (const current of ALL_STATUSES) {
    for (const requested of ALL_STATUSES) {
      const decision = decideInvoiceStatusTransition({
        currentStatus: current,
        requestedStatus: requested,
        purpose: "delivery"
      });
      assert.equal(decision.zeroBalanceDue, false);
      assert.equal(decision.restoreTotalOnLeavePaid, false);
      if (current === "draft" && requested === "sent") {
        assert.equal(decision.transition, true);
        assert.equal(decision.nextStatus, "sent");
      } else {
        assert.equal(decision.transition, false);
        assert.equal(decision.nextStatus, current);
      }
    }
  }
});

test("lifecycle purpose: requested status applied; paid zeroes balance; leave-paid restores unless deleting", () => {
  // draft → sent
  assert.deepEqual(
    decideInvoiceStatusTransition({
      currentStatus: "draft",
      requestedStatus: "sent",
      purpose: "lifecycle"
    }),
    {
      nextStatus: "sent",
      transition: true,
      zeroBalanceDue: false,
      restoreTotalOnLeavePaid: false
    }
  );

  // sent → paid zeroes balance
  assert.deepEqual(
    decideInvoiceStatusTransition({
      currentStatus: "sent",
      requestedStatus: "paid",
      purpose: "lifecycle"
    }),
    {
      nextStatus: "paid",
      transition: true,
      zeroBalanceDue: true,
      restoreTotalOnLeavePaid: false
    }
  );

  // paid → sent restores total (legacy leave-paid)
  assert.deepEqual(
    decideInvoiceStatusTransition({
      currentStatus: "paid",
      requestedStatus: "sent",
      purpose: "lifecycle"
    }),
    {
      nextStatus: "sent",
      transition: true,
      zeroBalanceDue: false,
      restoreTotalOnLeavePaid: true
    }
  );

  // paid → deleted: no money rewrite flags (audit item 2)
  assert.deepEqual(
    decideInvoiceStatusTransition({
      currentStatus: "paid",
      requestedStatus: "deleted",
      purpose: "lifecycle"
    }),
    {
      nextStatus: "deleted",
      transition: true,
      zeroBalanceDue: false,
      restoreTotalOnLeavePaid: false
    }
  );

  // sent → deleted
  assert.deepEqual(
    decideInvoiceStatusTransition({
      currentStatus: "sent",
      requestedStatus: "deleted",
      purpose: "lifecycle"
    }),
    {
      nextStatus: "deleted",
      transition: true,
      zeroBalanceDue: false,
      restoreTotalOnLeavePaid: false
    }
  );
});

test("lifecycle idempotence: requesting the current status is a no-op", () => {
  for (const status of ALL_STATUSES) {
    const decision = decideInvoiceStatusTransition({
      currentStatus: status,
      requestedStatus: status,
      purpose: "lifecycle"
    });
    assert.equal(decision.transition, false);
    assert.equal(decision.nextStatus, status);
    // Characterisation: mark-paid flag still follows the requested status even on a no-op
    assert.equal(decision.zeroBalanceDue, status === "paid");
    assert.equal(decision.restoreTotalOnLeavePaid, false);
  }
});

test("first reminder: due-date day-before / day-of / day-after relative to last send", () => {
  const lastSentAt = "2026-04-10T12:00:00.000Z";

  // Day before last send → due date is not after send → follow_up_window
  const dayBefore = resolveInvoiceReminderTiming({
    dueDate: "2026-04-09",
    lastSentAt,
    sendCount: 1,
    settings: SETTINGS
  });
  assert.equal(dayBefore?.reason, "follow_up_window");
  assert.equal(dayBefore?.dueDate, "2026-04-09");
  // Hand: 2026-04-10T12:00Z + 14 days = 2026-04-24T12:00Z
  assert.equal(dayBefore?.nextReminderAt, "2026-04-24T12:00:00.000Z");

  // Day of last send at midnight UTC is NOT > lastSentMs (noon) → follow_up_window
  // Characterisation: due date is compared as T00:00:00.000Z against the send instant.
  const dayOf = resolveInvoiceReminderTiming({
    dueDate: "2026-04-10",
    lastSentAt,
    sendCount: 1,
    settings: SETTINGS
  });
  assert.equal(dayOf?.reason, "follow_up_window");
  assert.equal(dayOf?.dueDate, "2026-04-10");
  assert.equal(dayOf?.nextReminderAt, "2026-04-24T12:00:00.000Z");

  // Day after last send → past_due at due-date midnight
  const dayAfter = resolveInvoiceReminderTiming({
    dueDate: "2026-04-11",
    lastSentAt,
    sendCount: 1,
    settings: SETTINGS
  });
  assert.equal(dayAfter?.reason, "past_due");
  assert.equal(dayAfter?.dueDate, "2026-04-11");
  assert.equal(dayAfter?.nextReminderAt, "2026-04-11T00:00:00.000Z");
  assert.equal(dayAfter?.nextReminderAtMs, Date.parse("2026-04-11T00:00:00.000Z"));
});

test("first reminder without a usable due date uses dueAfterDays from the fixed send clock", () => {
  const timing = resolveInvoiceReminderTiming({
    dueDate: "",
    lastSentAt: "2026-01-01T00:00:00.000Z",
    sendCount: 1,
    settings: { ...SETTINGS, dueAfterDays: 10 }
  });
  assert.equal(timing?.reason, "follow_up_window");
  assert.equal(timing?.dueDate, undefined);
  // Hand: 2026-01-01 + 10 days = 2026-01-11
  assert.equal(timing?.nextReminderAt, "2026-01-11T00:00:00.000Z");
});

test("due-date normalisation: ISO datetime prefix kept as date-only; junk and blank discarded", () => {
  const fromDateTime = resolveInvoiceReminderTiming({
    dueDate: "2026-05-01T15:30:00.000Z",
    lastSentAt: "2026-04-01T00:00:00.000Z",
    sendCount: 1,
    settings: SETTINGS
  });
  assert.equal(fromDateTime?.dueDate, "2026-05-01");
  assert.equal(fromDateTime?.reason, "past_due");
  assert.equal(fromDateTime?.nextReminderAt, "2026-05-01T00:00:00.000Z");

  const trimmed = resolveInvoiceReminderTiming({
    dueDate: "  2026-05-02  ",
    lastSentAt: "2026-04-01T00:00:00.000Z",
    sendCount: 1,
    settings: SETTINGS
  });
  assert.equal(trimmed?.dueDate, "2026-05-02");

  const junk = resolveInvoiceReminderTiming({
    dueDate: "not-a-date",
    lastSentAt: "2026-04-01T00:00:00.000Z",
    sendCount: 1,
    settings: SETTINGS
  });
  assert.equal(junk?.dueDate, undefined);
  assert.equal(junk?.reason, "follow_up_window");
});

test("repeat reminders (sendCount > 1) use cooldownDays regardless of due date", () => {
  const timing = resolveInvoiceReminderTiming({
    dueDate: "2026-04-15",
    lastSentAt: "2026-04-20T09:30:00.000Z",
    sendCount: 2,
    settings: SETTINGS
  });
  assert.equal(timing?.reason, "cooldown");
  assert.equal(timing?.dueDate, "2026-04-15");
  // Hand: 2026-04-20T09:30Z + 7 days = 2026-04-27T09:30Z
  assert.equal(timing?.nextReminderAt, "2026-04-27T09:30:00.000Z");
});

test("invalid lastSentAt yields null timing (no invented clock)", () => {
  assert.equal(
    resolveInvoiceReminderTiming({
      dueDate: "2026-04-15",
      lastSentAt: "bogus",
      sendCount: 1,
      settings: SETTINGS
    }),
    null
  );
});
