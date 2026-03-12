import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
process.env.INVOICE_STORE_FILE = path.join(os.tmpdir(), `invoice-ui-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_POSTGRES_URL = "";
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-ui-ocr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(
  os.tmpdir(),
  `invoice-ui-friction-${randomUUID()}.json`
);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(
  os.tmpdir(),
  `invoice-ui-friction-history-${randomUUID()}.json`
);

const [{ app }, { setImageOcrRunnerForTests, setJsonTaskRunnerForTests }] = await Promise.all([
  import("./server.js"),
  import("./ai/openaiClient.js")
]);

let server: Server;
let browser: Browser;
let baseUrl = "";
const ocrMetricsStoreFilePath = process.env.OCR_METRICS_STORE_FILE;
const invoiceStoreFilePath = process.env.INVOICE_STORE_FILE;
const flowFrictionReportFilePath = process.env.FLOW_FRICTION_REPORT_FILE;
const flowFrictionHistoryFilePath = process.env.FLOW_FRICTION_HISTORY_FILE;

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

beforeEach(async () => {
  if (invoiceStoreFilePath) {
    await fs.mkdir(path.dirname(invoiceStoreFilePath), { recursive: true });
    await fs.writeFile(invoiceStoreFilePath, '{\n  "invoices": []\n}\n', "utf8");
  }
  if (ocrMetricsStoreFilePath) {
    await fs.mkdir(path.dirname(ocrMetricsStoreFilePath), { recursive: true });
    await fs.rm(ocrMetricsStoreFilePath, { force: true });
  }
  if (flowFrictionReportFilePath) {
    await fs.mkdir(path.dirname(flowFrictionReportFilePath), { recursive: true });
    await fs.rm(flowFrictionReportFilePath, { force: true });
  }
  if (flowFrictionHistoryFilePath) {
    await fs.mkdir(path.dirname(flowFrictionHistoryFilePath), { recursive: true });
    await fs.rm(flowFrictionHistoryFilePath, { force: true });
  }
  delete process.env.INVOICE_REQUIRE_AUTH;
  delete process.env.INVOICE_DEFAULT_PLAN;
  delete process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH;
  delete process.env.INVOICE_PRO_EMAILS;
  delete process.env.INVOICE_PRO_USER_IDS;
  delete process.env.INVOICE_PRO_OWNER_IDS;
  delete process.env.INVOICE_UPGRADE_URL;
  delete process.env.INVOICE_BILLING_PORTAL_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.APP_BASE_URL;
});

afterEach(() => {
  setJsonTaskRunnerForTests(null);
  setImageOcrRunnerForTests(null);
});

after(async () => {
  setJsonTaskRunnerForTests(null);
  setImageOcrRunnerForTests(null);
  await browser.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  if (ocrMetricsStoreFilePath) {
    await fs.rm(ocrMetricsStoreFilePath, { force: true });
  }
  if (invoiceStoreFilePath) {
    await fs.rm(invoiceStoreFilePath, { force: true });
  }
  if (flowFrictionReportFilePath) {
    await fs.rm(flowFrictionReportFilePath, { force: true });
  }
  if (flowFrictionHistoryFilePath) {
    await fs.rm(flowFrictionHistoryFilePath, { force: true });
  }
});

test("decision CTA switches and undo restores unresolved decision state", async () => {
  useMockResponses([
    structuredDecisionDraft(),
    decisionAudit(),
    structuredDecisionDraft(),
    decisionAudit()
  ]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr. Cabinet door adjustment maybe charge.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Resolve decisions" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Add" }).first().click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo" }).click();

    await page.getByRole("button", { name: "Resolve decisions" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("decision undo toast does not block billie chips on mobile", async () => {
  useMockResponses([structuredDecisionDraft(), decisionAudit()]);

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  try {
    let rewordRequestCount = 0;
    await page.route("**/api/invoices/reword-full", async (route) => {
      rewordRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(safeBillieDecisionSkipEditResponse())
      });
    });
    await page.route("**/api/invoices/edit", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr. Cabinet door adjustment maybe charge.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Skip" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Skip" }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Refine wording" }).click();

    await page
      .locator("form.fixed")
      .getByText("✓ Numbers unchanged")
      .waitFor({ state: "visible" });

    assert.equal(rewordRequestCount, 1);
    assert.equal(await page.getByRole("button", { name: "Undo", exact: true }).isVisible(), true);
  } finally {
    await context.close();
  }
});

test("mobile intake steps start compact and can expand on demand", async () => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page.getByText("Step 1 of 4: Paste").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show steps" }).waitFor({ state: "visible" });
    assert.equal(await page.locator("#intake-step-details").count(), 0);
    await page.getByRole("button", { name: "Show steps" }).click();
    await page.locator("#intake-step-details").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Hide steps" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("labor follow-up shows last used hourly rate quick reply", async () => {
  useMockResponses([
    structuredLaborFollowUpDraft(),
    emptyAudit(),
    structuredLaborFollowUpDraft()
  ]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Did one labor visit this week.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByText("Pricing needed", { exact: true }).waitFor({ state: "visible" });
    await page
      .getByPlaceholder("Reply with a rate and hours or a flat amount…")
      .fill("Hourly $101/hr. 2 hours.");
    await page.getByRole("button", { name: "Send" }).click();

    await page.getByText("Summary updated").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "New intake" }).click();

    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Did one labor visit this week.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Use last ($101/hr)" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("labor follow-up suggests a saved matched hourly rate by service wording", async () => {
  useMockResponses([structuredLaborFollowUpDraft(), emptyAudit()]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-rate-match-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Leak repair service",
          qty: "1",
          rate: "133",
          updatedAt: "2026-03-11T00:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Did one labor visit this week.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByText("Pricing needed", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use saved match ($133/hr)" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("labor follow-up prioritizes client-matched rates over generic saved matches", async () => {
  useMockResponses([
    {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Jan 11",
          tasks: [{ description: "Leak inspection" }]
        }
      ],
      materials: []
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-rate-client-match-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "142",
          clientName: "Other Client",
          updatedAt: "2026-03-11T12:00:00.000Z"
        },
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "155",
          clientName: "Mike Johnson",
          updatedAt: "2026-03-10T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Did one labor visit this week.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByText("Pricing needed", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use client match ($155/hr)" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("labor follow-up favors higher-usage client matches when overlap is tied", async () => {
  useMockResponses([
    {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Jan 11",
          tasks: [{ description: "Leak inspection" }]
        }
      ],
      materials: []
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-rate-usage-priority-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "142",
          clientName: "Mike Johnson",
          usageCount: 6,
          updatedAt: "2026-03-09T12:00:00.000Z"
        },
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "155",
          clientName: "Mike Johnson",
          usageCount: 1,
          updatedAt: "2026-03-11T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Did one labor visit this week.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByText("Pricing needed", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use client match ($142/hr)" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("review quick actions include merge duplicates when duplicate line items are present", async () => {
  useMockResponses([structuredDuplicateDraft(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Fixed faucet and added two washers.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByText("Quick actions").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Merge duplicates" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("billie workspace shows action chips and allows safe wording undo", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    let rewordRequestCount = 0;
    let editRequestCount = 0;
    await page.route("**/api/invoices/reword-full", async (route) => {
      rewordRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(safeBillieEditResponse())
      });
    });
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByText("Wording only. Numbers stay locked.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Refine wording" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Ask Billie" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Show review details" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Faucet repair"
      )
    );

    await page.getByRole("button", { name: "Refine wording" }).click();

    await page
      .locator("form.fixed")
      .getByText("✓ Numbers unchanged")
      .waitFor({ state: "visible" });
    assert.equal(rewordRequestCount, 1);
    assert.equal(editRequestCount, 0);
    await page.getByRole("button", { name: "Show review details" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Kitchen faucet repair service"
      )
    );
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page
      .locator("form.fixed")
      .getByText("Undid last Billie change")
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show review details" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Faucet repair"
      )
    );
  } finally {
    await context.close();
  }
});

test("review details shows before-and-after transparency preview", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Show review details" }).click();
    const transparencyCard = page.locator("div.rounded-xl").filter({ hasText: /Before and after/i });
    await transparencyCard.getByText(/Before and after/i).waitFor({ state: "visible" });
    await transparencyCard.getByText(/Cleaned lines:/i).waitFor({ state: "visible" });
    await transparencyCard.getByRole("button", { name: "Show full comparison" }).click();
    await transparencyCard.getByText(/From your notes/i).waitFor({ state: "visible" });
    await transparencyCard.getByText(/Client-facing draft/i).waitFor({ state: "visible" });
    await transparencyCard.getByText("Faucet repair").first().waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("review details shows a service timeline for multi-day jobs", async () => {
  useMockResponses([structuredInvoiceForTimeline(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 28 inspected leak. Jan 30 repaired leak. Feb 2 tightened cabinet door.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Show review details" }).click();
    const timelineCard = page.locator("div.rounded-xl").filter({ hasText: /Service timeline/i });
    await timelineCard.getByText(/Service timeline/i).waitFor({ state: "visible" });
    await timelineCard.getByText("Jan 28").waitFor({ state: "visible" });
    await timelineCard.getByText("Jan 30").waitFor({ state: "visible" });
    await timelineCard.getByText("Feb 2").waitFor({ state: "visible" });
    await timelineCard.getByText(/task captured|item/i).first().waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("billie workspace keeps secondary chips behind a mobile more toggle", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Refine wording" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Make simpler" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "More formal" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Make stronger" }).count(), 0);

    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Make stronger" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Less" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("billie workspace blocks money-changing edits and keeps totals unchanged", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(unsafeBillieMoneyEditResponse())
      });
    });
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show review details" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-xs.text-slate-500")).some((node) =>
        (node.textContent ?? "").includes("2h × $80.00/hr • $160.00")
      )
    );

    const billieComposer = page.locator("form.fixed textarea#ai-intake-input");
    await billieComposer.waitFor({ state: "visible" });
    await billieComposer.fill("Increase labor to 3 hours.");
    await page.getByRole("button", { name: "Ask Billie" }).click();

    await page
      .locator("form.fixed")
      .getByText("⚠ Money decision required")
      .waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-xs.text-slate-500")).some((node) =>
        (node.textContent ?? "").includes("2h × $80.00/hr • $160.00")
      )
    );
  } finally {
    await context.close();
  }
});

test("line-level billie refine rewrites only the selected line and keeps undo working", async () => {
  useMockResponses([structuredDuplicateDraft(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    let rewordLineRequestCount = 0;
    await page.route("**/api/invoices/reword-line", async (route) => {
      rewordLineRequestCount += 1;
      const body = route.request().postDataJSON() as {
        lineItemId: string;
        invoice: { lineItems: Array<{ id?: string; description: string }> };
      };
      const nextInvoice = {
        ...body.invoice,
        lineItems: body.invoice.lineItems.map((lineItem: { id?: string; description: string }) =>
          lineItem.id === body.lineItemId
            ? {
                ...lineItem,
                description: "Kitchen faucet repair service"
              }
            : lineItem
        )
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ invoice: nextInvoice })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 10 faucet repair and washer replacement.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show review details" }).click();
    await page.getByRole("button", { name: "Billie for Faucet repair" }).click();
    await page.getByRole("button", { name: "Refine Faucet repair" }).click();

    await page
      .locator("form.fixed")
      .getByText("✓ Numbers unchanged")
      .waitFor({ state: "visible" });
    const lineChangePreview = page.locator('[data-testid="billie-change-preview"]');
    await lineChangePreview.waitFor({ state: "visible" });
    await lineChangePreview.getByText(/^Last Billie change$/).waitFor({ state: "visible" });
    await lineChangePreview.getByText(/^Before$/).waitFor({ state: "visible" });
    await lineChangePreview.getByText(/^After$/).waitFor({ state: "visible" });
    await lineChangePreview.getByText(/^Faucet repair$/).waitFor({ state: "visible" });
    await lineChangePreview.getByText(/^Kitchen faucet repair service$/).waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Show review details" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Kitchen faucet repair service"
      )
    );
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Washer"
      )
    );
    assert.equal(rewordLineRequestCount, 1);

    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page
      .locator("form.fixed")
      .getByText("Undid last Billie change")
      .waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-testid="billie-change-preview"]').count(), 0);
    await page.getByRole("button", { name: "Show review details" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Faucet repair"
      )
    );
  } finally {
    await context.close();
  }
});

test("notes-only billie refine rewrites notes without changing line items", async () => {
  useMockResponses([structuredInvoiceWithNotes(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    let rewordNotesRequestCount = 0;
    await page.route("**/api/invoices/reword-notes", async (route) => {
      rewordNotesRequestCount += 1;
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            ...body.invoice,
            notes: "Payment due within 7 days. Thank you for your business."
          }
        })
      });
    });
    await page.route("**/api/invoices/reword-line", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected line reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 10 faucet repair.\nNotes: pay in 7 days thanks.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show review details" }).click();
    await page.getByRole("main").getByText("pay in 7 days thanks", { exact: true }).first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Billie for notes" }).click();
    await page.getByRole("button", { name: "Refine notes" }).click();

    await page
      .locator("form.fixed")
      .getByText("✓ Numbers unchanged")
      .waitFor({ state: "visible" });
    const notesChangePreview = page.locator('[data-testid="billie-change-preview"]');
    await notesChangePreview.waitFor({ state: "visible" });
    await notesChangePreview.getByText(/^Last Billie change$/).waitFor({ state: "visible" });
    await notesChangePreview.getByText("pay in 7 days thanks").waitFor({ state: "visible" });
    await notesChangePreview
      .getByText(/^Payment due within 7 days\. Thank you for your business\.$/)
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show review details" }).click();
    await page
      .getByRole("main")
      .getByText(/^Payment due within 7 days\. Thank you for your business\.$/)
      .waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Faucet repair"
      )
    );
    assert.equal(rewordNotesRequestCount, 1);
  } finally {
    await context.close();
  }
});

test("importing image notes requires OCR review before building draft", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Jan 30 faucet repair, 2 hours at $80/hr.",
    warnings: ["One line was hard to read."]
  }));
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Upload invoice files or photo notes" }).waitFor({
      state: "visible"
    });

    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.png",
      mimeType: "image/png",
      buffer: Buffer.from("fake-image-content")
    });

    await page.getByText("Review extracted text (required)").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Extract text" }).click();

    await page.getByText("One line was hard to read.").waitFor({ state: "visible" });
    await page.getByText("Recommended fixes").waitFor({ state: "visible" });
    await page
      .getByText("Use brighter, even light and hold steady.")
      .waitFor({ state: "visible" });
    await page.getByText("OCR confidence:").waitFor({ state: "visible" });
    await page.getByText("Medium").first().waitFor({ state: "visible" });
    await page
      .locator('textarea[placeholder="Review and edit extracted text if needed."]')
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Build draft from reviewed text" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
  } finally {
    await context.close();
  }
});

test("previewing document text lets the user review before building", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Jan 30 faucet repair, 2 hours at $80/hr for Mike Johnson.")
    });

    await page.getByRole("button", { name: "Preview extracted text" }).click();
    const reviewTextarea = page.locator('textarea[placeholder="Review and edit extracted text if needed."]');
    await reviewTextarea.waitFor({ state: "visible" });
    await expectValueContains(reviewTextarea, "Jan 30 faucet repair");
    await page.getByRole("button", { name: "Build draft from reviewed text" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
  } finally {
    await context.close();
  }
});

test("import screen shows pre-limit warning when one free save remains", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "2";
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);
  const now = new Date().toISOString();

  await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: { workSessions: [], materials: [] },
      finishedInvoice: {
        invoiceNumber: "INV-100",
        issueDate: "2026-03-11",
        customerName: "Test Client",
        currency: "USD",
        lineItems: [{ description: "Existing", quantity: 1, unitPrice: 10, amount: 10 }],
        notes: "",
        subtotal: 10,
        total: 10,
        balanceDue: 10
      }
    }
  });

  if (invoiceStoreFilePath) {
    const raw = await fs.readFile(invoiceStoreFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.invoices) && parsed.invoices.length > 0) {
      parsed.invoices[0].createdAt = now;
      parsed.invoices[0].updatedAt = now;
      await fs.writeFile(invoiceStoreFilePath, JSON.stringify(parsed, null, 2), "utf8");
    }
  }

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "local-default");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
    await page
      .getByText("1 save left this month before upgrade is required.")
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor polishes line item wording on blur", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const description = page.getByPlaceholder("Description").first();
    await description.fill("fixed sink");
    await description.press("Tab");

    await page.waitForFunction(() => {
      const input = document.querySelector('input[placeholder="Description"]');
      return input instanceof HTMLInputElement && input.value === "Sink repair";
    });
  } finally {
    await context.close();
  }
});

test("manual editor quick clean descriptions polishes existing draft line items", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "invoiceDraft",
      JSON.stringify({
        invoiceNumber: "INV-9001",
        invoiceDate: "2026-02-10",
        fromDetails: "",
        billToDetails: "",
        notes: "",
        taxRate: "0",
        lineItems: [
          { id: "line-1", description: "fixed sink", qty: "2", rate: "90" },
          { id: "line-2", description: "replaced washer", qty: "1", rate: "5" }
        ],
        logoUrl: null,
        stylePreset: "default",
        savedInvoiceId: ""
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Tone" }).first().click();
    await page.getByRole("button", { name: "Quick clean descriptions" }).click();

    await page.waitForFunction(() => {
      const inputs = Array.from(document.querySelectorAll('input[placeholder="Description"]'));
      if (inputs.length < 2) {
        return false;
      }
      const first = inputs[0];
      const second = inputs[1];
      return (
        first instanceof HTMLInputElement &&
        second instanceof HTMLInputElement &&
        first.value === "Sink repair" &&
        second.value === "Washer replacement"
      );
    });
  } finally {
    await context.close();
  }
});

test("manual billie applies style commands locally without calling the AI edit route", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Use the bold template with a navy accent.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page
      .getByText("Applied style updates: template → Bold, accent → Navy.")
      .waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);

    await page.getByRole("button", { name: "Style" }).first().click();
    await page
      .getByRole("button", { name: /Bold.*Selected/i })
      .waitFor({ state: "visible" });
    await page.getByText("#093064").first().waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual billie applies explicit tax commands locally without calling the AI edit route", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Set tax to 5%.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page.getByText("Applied tax → 5%.").waitFor({ state: "visible" });
    await expectValueEquals(page.locator('input[type="number"]').last(), "5");
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie applies explicit discount commands locally and supports undo", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByPlaceholder("0").first().fill("1");
    await page.getByPlaceholder("$0").first().fill("100");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Apply a $25 discount.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page.getByText("Applied discount → $25.00.").waitFor({ state: "visible" });
    await expectValueEquals(page.getByLabel("Discount amount"), "25");
    await page.getByText("$75.00").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page.getByText("Undid last Billie change.").first().waitFor({ state: "visible" });
    await expectValueEquals(page.getByLabel("Discount amount"), "0");
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie applies explicit line pricing commands locally and supports undo", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const firstRow = page.locator("tbody tr").first();
    await firstRow.getByPlaceholder("Description", { exact: true }).fill("Faucet repair");
    await firstRow.getByPlaceholder("0", { exact: true }).fill("1");
    await firstRow.getByPlaceholder("$0", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Make it 3 hours at $90/hr.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await expectValueEquals(firstRow.getByPlaceholder("0", { exact: true }), "3");
    await expectValueEquals(firstRow.getByPlaceholder("$0", { exact: true }), "90");
    await page.waitForFunction(() => document.body.innerText.includes("$270.00"));
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page.getByText("Undid last Billie change.").first().waitFor({ state: "visible" });
    await expectValueEquals(firstRow.getByPlaceholder("0", { exact: true }), "1");
    await expectValueEquals(firstRow.getByPlaceholder("$0", { exact: true }), "100");
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie asks for a line number before changing pricing on multi-line drafts", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const firstRow = page.locator("tbody tr").nth(0);
    const secondRow = page.locator("tbody tr").nth(1);
    await firstRow.getByPlaceholder("Description", { exact: true }).fill("Faucet repair");
    await firstRow.getByPlaceholder("0", { exact: true }).fill("1");
    await firstRow.getByPlaceholder("$0", { exact: true }).fill("100");
    await page.getByRole("button", { name: "+ Add line item" }).click();
    await secondRow.getByPlaceholder("Description", { exact: true }).fill("Cartridge");
    await secondRow.getByPlaceholder("0", { exact: true }).fill("1");
    await secondRow.getByPlaceholder("$0", { exact: true }).fill("25");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Set the rate to $90.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await expectValueEquals(firstRow.getByPlaceholder("$0", { exact: true }), "100");
    await expectValueEquals(secondRow.getByPlaceholder("$0", { exact: true }), "25");
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie applies explicit payment link commands locally and supports undo", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let exportRequestBody: any = null;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });
    await page.route("**/api/invoices/export-pdf", async (route) => {
      exportRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "content-disposition": 'attachment; filename="Invoice-Draft.pdf"'
        },
        body: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Set payment link to https://pay.notebill.app/inv-1001");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page
      .getByText("Applied payment link → https://pay.notebill.app/inv-1001.")
      .waitFor({ state: "visible" });
    await expectValueEquals(page.getByLabel("Payment link"), "https://pay.notebill.app/inv-1001");
    assert.equal(editRequestCount, 0);

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByRole("button", { name: "Download PDF" }).click();
    await waitForCondition(() => Boolean(exportRequestBody), {
      message: "Expected export payload after downloading PDF."
    });
    assert.equal(exportRequestBody?.invoice?.paymentLinkUrl, "https://pay.notebill.app/inv-1001");

    await page.getByRole("button", { name: "Edit with Billie" }).first().click();
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page.getByText("Undid last Billie change.").first().waitFor({ state: "visible" });
    await expectValueEquals(page.getByLabel("Payment link"), "");
  } finally {
    await context.close();
  }
});

test("manual billie quick actions trigger safe wording rewrites without using the edit route", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let rewordDescriptionsRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-descriptions", async (route) => {
      rewordDescriptionsRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            invoiceNumber: "INV-0001",
            issueDate: "2026-03-10",
            customerName: "Mike Johnson",
            currency: "USD",
            lineItems: [
              {
                id: "line-1",
                type: "other",
                description: "Kitchen faucet repair service",
                quantity: 1,
                unitPrice: 90,
                amount: 90
              }
            ],
            notes: "Leave check at the front desk.",
            subtotal: 90,
            total: 90,
            balanceDue: 90
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("fixed sink");
    await page.getByPlaceholder("Thank you for your business").fill("Leave check at the front desk.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    await page.getByRole("button", { name: "Formal descriptions" }).click();

    await page
      .getByText("Descriptions updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    await expectValueEquals(page.getByPlaceholder("Description").first(), "Kitchen faucet repair service");
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page.getByText("Undid last Billie change.").first().waitFor({ state: "visible" });
    await expectValueEquals(page.getByPlaceholder("Description").first(), "Sink repair");
    await page.getByRole("button", { name: "Stronger wording" }).click();
    await page
      .getByText("Descriptions updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    await expectValueEquals(page.getByPlaceholder("Description").first(), "Kitchen faucet repair service");
    assert.equal(rewordDescriptionsRequestCount, 2);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie quick line action rewrites only one line via reword-line", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let rewordLineCount = 0;
  let rewordFullCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      rewordFullCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-line", async (route) => {
      rewordLineCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            invoiceNumber: "INV-0001",
            issueDate: "2026-03-10",
            customerName: "Mike Johnson",
            currency: "USD",
            lineItems: [
              {
                id: "line-1",
                type: "other",
                description: "Kitchen faucet repair service",
                quantity: 1,
                unitPrice: 90,
                amount: 90
              }
            ],
            notes: "Thanks.",
            subtotal: 90,
            total: 90,
            balanceDue: 90
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("fixed sink");
    await page.getByPlaceholder("Thank you for your business").fill("Thanks.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    await page.getByRole("button", { name: "Refine line 1" }).click();
    await page.getByText("Line 1 updated. Numbers unchanged.").waitFor({ state: "visible" });
    await expectValueEquals(page.getByPlaceholder("Description").first(), "Kitchen faucet repair service");

    assert.equal(rewordLineCount, 1);
    assert.equal(rewordFullCount, 0);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie routes description wording requests through safe rewording", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let rewordDescriptionsRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-descriptions", async (route) => {
      rewordDescriptionsRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            invoiceNumber: "INV-0001",
            issueDate: "2026-03-10",
            customerName: "Mike Johnson",
            currency: "USD",
            lineItems: [
              {
                id: "line-1",
                type: "other",
                description: "Kitchen faucet repair service",
                quantity: 1,
                unitPrice: 90,
                amount: 90
              }
            ],
            notes: "Leave check at the front desk.",
            subtotal: 90,
            total: 90,
            balanceDue: 90
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("fixed sink");
    await page.getByPlaceholder("Thank you for your business").fill("Leave check at the front desk.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Make the descriptions more formal.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page
      .getByText("Descriptions updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    assert.equal(
      await page.locator("p.text-xs.text-slate-500").filter({
        hasText: "Descriptions updated. Numbers unchanged."
      }).count(),
      0
    );
    await expectValueEquals(page.getByPlaceholder("Description").first(), "Kitchen faucet repair service");
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Leave check at the front desk."
    );
    assert.equal(rewordDescriptionsRequestCount, 1);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie routes notes wording requests through safe notes rewording", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let rewordNotesRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      rewordNotesRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            invoiceNumber: "INV-0001",
            issueDate: "2026-03-10",
            customerName: "Mike Johnson",
            currency: "USD",
            lineItems: [
              {
                id: "line-1",
                type: "other",
                description: "Faucet repair",
                quantity: 1,
                unitPrice: 90,
                amount: 90
              }
            ],
            notes: "Payment due within 14 days of receipt.",
            subtotal: 90,
            total: 90,
            balanceDue: 90
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByPlaceholder("Thank you for your business").fill("Pay in 14 days.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Make the notes more formal.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page
      .getByText("Notes updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Payment due within 14 days of receipt."
    );
    await expectValueEquals(page.getByPlaceholder("Description").first(), "Faucet repair");
    assert.equal(rewordNotesRequestCount, 1);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie can combine safe description wording and style changes in one instruction", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let rewordDescriptionsRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected notes reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-descriptions", async (route) => {
      rewordDescriptionsRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            invoiceNumber: "INV-0001",
            issueDate: "2026-03-10",
            customerName: "Mike Johnson",
            currency: "USD",
            lineItems: [
              {
                id: "line-1",
                type: "other",
                description: "Kitchen faucet repair service",
                quantity: 1,
                unitPrice: 90,
                amount: 90
              }
            ],
            notes: "Leave check at the front desk.",
            subtotal: 90,
            total: 90,
            balanceDue: 90
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("fixed sink");
    await page.getByPlaceholder("Thank you for your business").fill("Leave check at the front desk.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Use a navy accent and make the descriptions more formal.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page.getByText("Applied style updates: accent → Navy.").first().waitFor({ state: "visible" });
    await page
      .getByText("Descriptions updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    await expectValueEquals(page.getByPlaceholder("Description").first(), "Kitchen faucet repair service");
    await page.getByRole("button", { name: "Style" }).first().click();
    await page.getByText("#093064").first().waitFor({ state: "visible" });
    assert.equal(rewordDescriptionsRequestCount, 1);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie can combine safe notes wording and spacing changes in one instruction", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let rewordNotesRequestCount = 0;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/reword-full", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected full reword route call." })
      });
    });
    await page.route("**/api/invoices/reword-notes", async (route) => {
      rewordNotesRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            invoiceNumber: "INV-0001",
            issueDate: "2026-03-10",
            customerName: "Mike Johnson",
            currency: "USD",
            lineItems: [
              {
                id: "line-1",
                type: "other",
                description: "Faucet repair",
                quantity: 1,
                unitPrice: 90,
                amount: 90
              }
            ],
            notes: "Payment due within 14 days of receipt.",
            subtotal: 90,
            total: 90,
            balanceDue: 90
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByPlaceholder("Thank you for your business").fill("Pay in 14 days.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Use airy spacing and make the notes more formal.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page.getByText("Applied style updates: spacing → Airy.").first().waitFor({ state: "visible" });
    await page
      .getByText("Notes updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Payment due within 14 days of receipt."
    );
    await page.locator("[data-spacing-density='airy']").first().waitFor({ state: "visible" });
    assert.equal(rewordNotesRequestCount, 1);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie can hide and show the logo locally and export preserves visibility state", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const draft = {
      invoiceNumber: "INV-LOGO-1",
      invoiceDate: "2026-03-10",
      fromDetails: "Acme Plumbing",
      billToDetails: "Mike Johnson",
      notes: "Thanks for your business.",
      taxRate: "0",
      lineItems: [{ id: "line-1", description: "Faucet repair", qty: "1", rate: "90" }],
      logoUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgBxVSnoAAAAASUVORK5CYII=",
      logoVisible: true,
      stylePreset: "default",
      accentColor: "#093064",
      savedInvoiceId: ""
    };
    window.localStorage.setItem("invoiceDraft", JSON.stringify(draft));
  });
  const page = await context.newPage();
  let editRequestCount = 0;
  let exportRequestBody: any = null;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/export-pdf", async (route) => {
      exportRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "content-disposition": 'attachment; filename="Invoice-INV-LOGO-1.pdf"'
        },
        body: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByAltText("Company logo").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();

    await composer.fill("Hide the logo.");
    await page.getByRole("button", { name: "Draft edit" }).click();
    await page.getByText("Applied style updates: logo → hidden.").waitFor({ state: "visible" });
    await page.getByAltText("Company logo").waitFor({ state: "hidden" });
    assert.equal(editRequestCount, 0);

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByRole("button", { name: "Download PDF" }).click();
    await waitForCondition(() => Boolean(exportRequestBody), {
      message: "Expected export payload after downloading PDF."
    });
    assert.equal(exportRequestBody?.logoVisible, false);
    assert.match(String(exportRequestBody?.logoUrl || ""), /^data:image\/png;base64,/);

    await page.getByRole("button", { name: "Edit with Billie" }).first().click();
    await composer.fill("Show the logo.");
    await page.getByRole("button", { name: "Draft edit" }).click();
    await page.getByText("Applied style updates: logo → visible.").waitFor({ state: "visible" });
    await page.getByAltText("Company logo").waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie can switch header layout locally and export preserves the selected layout", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let exportRequestBody: any = null;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/export-pdf", async (route) => {
      exportRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "content-disposition": 'attachment; filename="Invoice-Draft.pdf"'
        },
        body: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.locator("[data-header-layout='split']").first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Center the header and use a split layout later if needed.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page
      .getByText("Applied style updates: header → Centered.")
      .waitFor({ state: "visible" });
    await page.locator("[data-header-layout='centered']").first().waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByRole("button", { name: "Download PDF" }).click();
    await waitForCondition(() => Boolean(exportRequestBody), {
      message: "Expected export payload after downloading PDF."
    });
    assert.equal(exportRequestBody?.headerLayout, "centered");

    await page.getByRole("button", { name: "Edit with Billie" }).first().click();
    await composer.fill("Use the split header.");
    await page.getByRole("button", { name: "Draft edit" }).click();
    await page.getByText("Applied style updates: header → Split.").waitFor({ state: "visible" });
    await page.locator("[data-header-layout='split']").first().waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie can change spacing density locally and export preserves the selected density", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let exportRequestBody: any = null;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/export-pdf", async (route) => {
      exportRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "content-disposition": 'attachment; filename="Invoice-Draft.pdf"'
        },
        body: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.locator("[data-spacing-density='balanced']").first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Use airy spacing.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page
      .getByText("Applied style updates: spacing → Airy.")
      .waitFor({ state: "visible" });
    await page.locator("[data-spacing-density='airy']").first().waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByRole("button", { name: "Download PDF" }).click();
    await waitForCondition(() => Boolean(exportRequestBody), {
      message: "Expected export payload after downloading PDF."
    });
    assert.equal(exportRequestBody?.spacingDensity, "airy");

    await page.getByRole("button", { name: "Edit with Billie" }).first().click();
    await composer.fill("Use tighter spacing.");
    await page.getByRole("button", { name: "Draft edit" }).click();
    await page
      .getByText("Applied style updates: spacing → Tighter.")
      .waitFor({ state: "visible" });
    await page.locator("[data-spacing-density='tight']").first().waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie can hide and show notes locally and export preserves visibility state", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let editRequestCount = 0;
  let exportRequestBody: any = null;
  try {
    await page.route("**/api/invoices/edit", async (route) => {
      editRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected edit route call." })
      });
    });
    await page.route("**/api/invoices/export-pdf", async (route) => {
      exportRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "content-disposition": 'attachment; filename="Invoice-Draft.pdf"'
        },
        body: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByPlaceholder("Thank you for your business").fill("Payment due in 14 days.");
    await page.locator("[data-notes-visible='true']").first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Hide the notes on the invoice.");
    await page.getByRole("button", { name: "Draft edit" }).click();

    await page
      .getByText("Applied style updates: notes → hidden.")
      .waitFor({ state: "visible" });
    await page.locator("[data-notes-visible='false']").first().waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByRole("button", { name: "Download PDF" }).click();
    await waitForCondition(() => Boolean(exportRequestBody), {
      message: "Expected export payload after downloading PDF."
    });
    assert.equal(exportRequestBody?.notesVisible, false);

    await page.getByRole("button", { name: "Edit with Billie" }).first().click();
    await composer.fill("Show the notes again.");
    await page.getByRole("button", { name: "Draft edit" }).click();
    await page
      .getByText("Applied style updates: notes → visible.")
      .waitFor({ state: "visible" });
    await page.locator("[data-notes-visible='true']").first().waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("business identity defaults prefill new manual drafts", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Show manage tools" }).click();
    await page.getByRole("button", { name: "Business Identity" }).click();
    await page.waitForURL(/\/settings\/business$/, { timeout: 10000 });
    await page.getByRole("heading", { name: "Set your default invoice branding" }).waitFor({
      state: "visible"
    });
    await page
      .locator("#business-from-details")
      .fill("Acme Plumbing\n123 Main St\n(555) 555-1234");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.getByRole("button", { name: "Save defaults" }).click();
    await page.getByText("Business identity saved.").waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const fromInput = page.getByPlaceholder("Your Name / Company");
    await fromInput.waitFor({ state: "visible" });
    await expectValueContains(fromInput, "Acme Plumbing");
  } finally {
    await context.close();
  }
});

test("ai intake applies business identity defaults when generating draft", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Show manage tools" }).click();
    await page.getByRole("button", { name: "Business Identity" }).click();
    await page.waitForURL(/\/settings\/business$/, { timeout: 10000 });
    await page.getByRole("heading", { name: "Set your default invoice branding" }).waitFor({
      state: "visible"
    });
    await page
      .locator("#business-from-details")
      .fill("Acme Plumbing\n123 Main St\n(555) 555-1234");
    await page.getByRole("button", { name: "Save defaults" }).click();
    await page.getByText("Business identity saved.").waitFor({ state: "visible" });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Generate Invoice" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    const fromInput = page.getByPlaceholder("Your Name / Company");
    await fromInput.waitFor({ state: "visible" });
    await expectValueContains(fromInput, "Acme Plumbing");
  } finally {
    await context.close();
  }
});

test("ai intake shows free-plan upgrade surface when monthly save limit is reached", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  process.env.INVOICE_UPGRADE_URL = "https://notebill.app/upgrade";
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-intake-plan-owner");
  });

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-intake-plan-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Intake Plan Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-INTAKE-PLAN-1",
          issueDate: "2026-03-12",
          customerName: "Intake Plan Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Plan seed labor",
              quantity: 1,
              unitPrice: 90,
              amount: 90
            }
          ],
          subtotal: 90,
          total: 90,
          balanceDue: 90
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByText("Free plan limit reached").waitFor({ state: "visible" });
    await page.getByText("Free plan · 1/1 saved this month (limit reached)").waitFor({
      state: "visible"
    });
    const upgradeLink = page.getByRole("link", { name: "Upgrade plan" });
    await upgradeLink.waitFor({ state: "visible" });
    assert.equal(await upgradeLink.getAttribute("href"), "https://notebill.app/upgrade");
  } finally {
    await context.close();
  }
});

test("launcher shows free-plan usage when monthly save limit is reached", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  process.env.INVOICE_UPGRADE_URL = "https://notebill.app/upgrade";

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-plan-owner");
  });

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-plan-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Plan Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PLAN-1",
          issueDate: "2026-03-10",
          customerName: "Plan Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Plan check",
              quantity: 1,
              unitPrice: 100,
              amount: 100
            }
          ],
          subtotal: 100,
          total: 100,
          balanceDue: 100
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByText("Free plan · 1/1 saved this month (limit reached)").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Plan options" }).click();
    const upgradeLink = page.getByRole("link", { name: "Upgrade" });
    await upgradeLink.waitFor({ state: "visible" });
    assert.equal(await upgradeLink.getAttribute("href"), "https://notebill.app/upgrade");
  } finally {
    await context.close();
  }
});

test("launcher shows upgrade button when stripe checkout is configured", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_PRICE_ID = "price_test_placeholder";

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Plan options" }).click();
    await page.getByRole("button", { name: "Upgrade" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("link", { name: "Upgrade" }).count(), 0);
  } finally {
    await context.close();
  }
});

test("launcher shows billing link for pro accounts when portal URL is configured", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "pro";
  process.env.INVOICE_BILLING_PORTAL_URL = "https://notebill.app/billing";

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByText("Pro plan · Unlimited saved invoices").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Plan options" }).click();
    const billingLink = page.getByRole("link", { name: "Billing" });
    await billingLink.waitFor({ state: "visible" });
    assert.equal(await billingLink.getAttribute("href"), "https://notebill.app/billing");
  } finally {
    await context.close();
  }
});

test("launcher shows billing button when stripe portal is configured", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "pro";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Plan options" }).click();
    await page.getByRole("button", { name: "Billing" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("link", { name: "Billing" }).count(), 0);
  } finally {
    await context.close();
  }
});

test("launcher shows billing completion notice and clears billing query param", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/?billing=success`, { waitUntil: "networkidle" });
    await page
      .getByText("Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription.")
      .waitFor({ state: "visible" });
    await waitForCondition(() => !new URL(page.url()).searchParams.has("billing"), {
      timeoutMs: 2000,
      message: "Billing query param should be removed after launcher notice renders."
    });
  } finally {
    await context.close();
  }
});

test("launcher shows resume draft shortcut when a scoped draft exists", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-resume-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceDraft::owner:${ownerId}`,
      JSON.stringify({
        invoiceNumber: "INV-RESUME-1",
        invoiceDate: "2026-03-10",
        lineItems: [{ id: "line-1", description: "Resume draft line", qty: "1", rate: "99", amount: "$99.00" }]
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Resume last draft" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Resume last draft" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });
  } finally {
    await context.close();
  }
});

test("launcher shows draft recovery inbox for saved draft invoices", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-draft-recovery-owner");
  });
  const olderResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-draft-recovery-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recovery Client A",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECOVERY-OLD",
          issueDate: "2026-03-10",
          customerName: "Recovery Client A",
          currency: "USD",
          lineItems: [
            {
              id: "line-a",
              type: "labor",
              description: "Draft recovery old",
              quantity: 1,
              unitPrice: 85,
              amount: 85
            }
          ],
          subtotal: 85,
          total: 85,
          balanceDue: 85
        }
      }
    }
  });
  assert.equal(olderResponse.status(), 200);
  const olderPayload = await olderResponse.json();
  await mutateStoredInvoice(olderPayload?.invoice?.invoiceId, {
    updatedAt: "2026-03-10T12:00:00.000Z"
  });

  const newerResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-draft-recovery-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recovery Client B",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECOVERY-NEW",
          issueDate: "2026-03-11",
          customerName: "Recovery Client B",
          currency: "USD",
          lineItems: [
            {
              id: "line-b",
              type: "labor",
              description: "Draft recovery new",
              quantity: 1,
              unitPrice: 105,
              amount: 105
            }
          ],
          subtotal: 105,
          total: 105,
          balanceDue: 105
        }
      }
    }
  });
  assert.equal(newerResponse.status(), 200);
  const newerPayload = await newerResponse.json();
  await mutateStoredInvoice(newerPayload?.invoice?.invoiceId, {
    updatedAt: "2026-03-11T12:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const recoverySection = page.locator("section").filter({ hasText: "Draft recovery" });
    await recoverySection.getByText("INV-RECOVERY-NEW").waitFor({ state: "visible" });
    await recoverySection.getByText("INV-RECOVERY-OLD").waitFor({ state: "visible" });
    await recoverySection.getByRole("button", { name: "Resume INV-RECOVERY-NEW" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    assert.equal(await page.getByLabel("Invoice #").inputValue(), "INV-RECOVERY-NEW");
  } finally {
    await context.close();
  }
});

test("launcher shows pre-limit warning when one free save remains", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "2";

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-plan-warning-owner");
  });

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-plan-warning-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Plan Warning Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PLAN-WARN-1",
          issueDate: "2026-03-10",
          customerName: "Plan Warning Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Plan warning baseline",
              quantity: 1,
              unitPrice: 95,
              amount: 95
            }
          ],
          subtotal: 95,
          total: 95,
          balanceDue: 95
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByText("Free plan · 1/2 saved this month").waitFor({ state: "visible" });
    await page.getByText("1 save left this month before upgrade is required.").waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("invoice library shows free-plan limit banner when monthly cap is reached", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  process.env.INVOICE_UPGRADE_URL = "https://notebill.app/upgrade";

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-library-plan-owner");
  });

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-library-plan-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Plan Banner Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PLAN-BANNER-1",
          issueDate: "2026-03-10",
          customerName: "Plan Banner Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Plan banner baseline",
              quantity: 1,
              unitPrice: 120,
              amount: 120
            }
          ],
          subtotal: 120,
          total: 120,
          balanceDue: 120
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Free plan limit reached").waitFor({ state: "visible" });
    await page.getByText("Free plan · 1/1 saved this month (limit reached)").waitFor({ state: "visible" });
    const upgradeLink = page.getByRole("link", { name: "Upgrade plan" });
    await upgradeLink.waitFor({ state: "visible" });
    assert.equal(await upgradeLink.getAttribute("href"), "https://notebill.app/upgrade");
  } finally {
    await context.close();
  }
});

test("invoice library shows sign-in-required panel when auth policy requires it", async () => {
  process.env.INVOICE_REQUIRE_AUTH = "true";
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Sign in required to use Invoice Library").waitFor({ state: "visible" });
    await page.getByText("Local mode").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Go to launcher sign-in" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "I signed in, retry" }).waitFor({ state: "visible" });
  } finally {
    delete process.env.INVOICE_REQUIRE_AUTH;
    await context.close();
  }
});

test("invoice library surfaces follow-up reminders for stale sent invoices", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-reminder-owner");
  });
  const draftSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Draft Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-DRAFT-1",
          issueDate: "2026-03-10",
          customerName: "Reminder Draft Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-draft-1",
              type: "labor",
              description: "Draft reminder baseline",
              quantity: 1,
              unitPrice: 90,
              amount: 90
            }
          ],
          subtotal: 90,
          total: 90,
          balanceDue: 90
        }
      }
    }
  });
  assert.equal(draftSeedResponse.status(), 200);

  const sentSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Sent Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-SENT-1",
          issueDate: "2026-02-01",
          customerName: "Reminder Sent Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-sent-1",
              type: "labor",
              description: "Sent reminder baseline",
              quantity: 1,
              unitPrice: 110,
              amount: 110
            }
          ],
          subtotal: 110,
          total: 110,
          balanceDue: 110
        }
      }
    }
  });
  assert.equal(sentSeedResponse.status(), 200);
  const sentSeedPayload = await sentSeedResponse.json();
  await mutateStoredInvoice(sentSeedPayload?.invoice?.invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T00:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Follow-up reminders").waitFor({ state: "visible" });
    await page.getByText("1 sent invoice may need follow-up.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Invoice again oldest" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show sent invoices" }).click();
    await page.getByText("INV-SENT-1").waitFor({ state: "visible" });
    assert.equal(await page.getByText("INV-DRAFT-1").count(), 0);
  } finally {
    await context.close();
  }
});

test("invoice library follow-up reminder supports snooze and persists it", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-reminder-snooze-owner");
  });

  const sentSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-snooze-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Snooze Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-SNOOZE-1",
          issueDate: "2026-02-01",
          customerName: "Reminder Snooze Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-sent-1",
              type: "labor",
              description: "Sent reminder snooze baseline",
              quantity: 1,
              unitPrice: 115,
              amount: 115
            }
          ],
          subtotal: 115,
          total: 115,
          balanceDue: 115
        }
      }
    }
  });
  assert.equal(sentSeedResponse.status(), 200);
  const sentSeedPayload = await sentSeedResponse.json();
  await mutateStoredInvoice(sentSeedPayload?.invoice?.invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T00:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Follow-up reminders").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Snooze 7 days" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Dismiss" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Snooze 7 days" }).click();
    await page.getByText("Follow-up reminders").waitFor({ state: "hidden" });

    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByText("Follow-up reminders").count(), 0);
  } finally {
    await context.close();
  }
});

test("invoice library follow-up reminder can send oldest reminder without prompting", async () => {
  const ownerId = "ui-reminder-resend-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const sentSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Resend Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-REM-RESEND-1",
          issueDate: "2026-02-01",
          customerName: "Reminder Resend Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-rem-resend-1",
              type: "labor",
              description: "Reminder resend baseline",
              quantity: 1,
              unitPrice: 120,
              amount: 120
            }
          ],
          subtotal: 120,
          total: 120,
          balanceDue: 120
        }
      }
    }
  });
  const sentSeedPayload = await sentSeedResponse.json();
  const invoiceId = sentSeedPayload?.invoice?.invoiceId as string;
  await mutateStoredInvoice(invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T00:00:00.000Z"
  });
  const sendResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      recipientEmail: "resend@example.com"
    }
  });
  assert.equal(sendResponse.status(), 200);
  await mutateStoredInvoice(invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T00:00:00.000Z"
  });

  const page = await context.newPage();
  let dialogTriggered = false;
  page.on("dialog", async (dialog) => {
    dialogTriggered = true;
    await dialog.dismiss();
  });
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Send reminder" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Send reminder" }).click();
    const startedAt = Date.now();
    let sendCount = 0;
    while (Date.now() - startedAt < 5000) {
      const response = await context.request.get(`${baseUrl}/api/invoices`, {
        headers: {
          "x-invoice-user-id": ownerId
        }
      });
      const payload = await response.json();
      sendCount = payload?.invoices?.[0]?.delivery?.sendCount ?? 0;
      if (sendCount > 1) {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 75);
      });
    }
    assert.equal(sendCount > 1, true);
    assert.equal(dialogTriggered, false);
  } finally {
    await context.close();
  }
});

test("invoice library supports recurring monthly reminders with pause", async () => {
  const ownerId = "ui-recurring-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recurring Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECUR-1",
          issueDate: "2026-03-01",
          customerName: "Recurring Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-recur-1",
              type: "labor",
              description: "Recurring baseline",
              quantity: 1,
              unitPrice: 125,
              amount: 125
            }
          ],
          subtotal: 125,
          total: 125,
          balanceDue: 125
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const setRecurringButton = page.getByRole("button", {
      name: "Set monthly recurring for INV-RECUR-1"
    });
    await setRecurringButton.waitFor({ state: "visible" });
    await setRecurringButton.click();

    await page.getByText("Recurring reminders").waitFor({ state: "visible" });
    await page.getByText(/Next recurring invoice is due/i).waitFor({ state: "visible" });
    await page.getByText("Recurring monthly").waitFor({ state: "visible" });
    await page
      .locator('select[aria-label="Recurring cadence for INV-RECUR-1"]')
      .selectOption("7");
    await page.getByText("Recurring weekly").waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "Pause recurring for INV-RECUR-1" })
      .waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Pause recurring for INV-RECUR-1" }).click();
    await page.getByText("Recurring reminders").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Set monthly recurring for INV-RECUR-1" })
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library recurring reminder opens invoice-again for the next due invoice", async () => {
  const ownerId = "ui-recurring-open-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recurring Open Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECUR-OPEN-1",
          issueDate: "2026-02-01",
          customerName: "Recurring Open Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-recur-open-1",
              type: "labor",
              description: "Recurring open baseline",
              quantity: 1,
              unitPrice: 140,
              amount: 140
            }
          ],
          subtotal: 140,
          total: 140,
          balanceDue: 140
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);
  const seedPayload = await seedResponse.json();
  const invoiceId = seedPayload?.invoice?.invoiceId as string;
  assert.equal(typeof invoiceId, "string");

  await context.addInitScript(
    ({ initOwnerId, initInvoiceId }) => {
      const key = `invoiceRecurringSchedules::owner:${initOwnerId}`;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          entries: {
            [initInvoiceId]: {
              intervalDays: 30,
              nextDueAt: "2026-01-01T00:00:00.000Z"
            }
          }
        })
      );
    },
    { initOwnerId: ownerId, initInvoiceId: invoiceId }
  );

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Recurring reminders").waitFor({ state: "visible" });
    await page.getByText("1 recurring invoice is due.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Invoice again next due" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Recurring Open Client");
  } finally {
    await context.close();
  }
});

test("invoice library shows draft recovery inbox for stale draft invoices", async () => {
  const ownerId = "ui-library-draft-recovery-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const olderResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Library Draft Recovery A",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LIB-REC-OLD",
          issueDate: "2026-03-01",
          customerName: "Library Draft Recovery A",
          currency: "USD",
          lineItems: [
            {
              id: "line-lib-rec-old",
              type: "labor",
              description: "Library draft old baseline",
              quantity: 1,
              unitPrice: 95,
              amount: 95
            }
          ],
          subtotal: 95,
          total: 95,
          balanceDue: 95
        }
      }
    }
  });
  assert.equal(olderResponse.status(), 200);
  const olderPayload = await olderResponse.json();
  await mutateStoredInvoice(olderPayload?.invoice?.invoiceId, {
    updatedAt: "2026-02-01T00:00:00.000Z"
  });

  const newerResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Library Draft Recovery B",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LIB-REC-NEW",
          issueDate: "2026-03-08",
          customerName: "Library Draft Recovery B",
          currency: "USD",
          lineItems: [
            {
              id: "line-lib-rec-new",
              type: "labor",
              description: "Library draft new baseline",
              quantity: 1,
              unitPrice: 115,
              amount: 115
            }
          ],
          subtotal: 115,
          total: 115,
          balanceDue: 115
        }
      }
    }
  });
  assert.equal(newerResponse.status(), 200);
  const newerPayload = await newerResponse.json();
  await mutateStoredInvoice(newerPayload?.invoice?.invoiceId, {
    updatedAt: "2026-03-09T00:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Draft recovery inbox").waitFor({ state: "visible" });
    await page.getByText("1 draft has been inactive for over a week.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Resume oldest draft" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    assert.equal(await page.getByLabel("Invoice #").inputValue(), "INV-LIB-REC-OLD");
  } finally {
    await context.close();
  }
});

test("invoice library send action records delivery and supports mark opened", async () => {
  const ownerId = "ui-send-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Send Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-SEND-1",
          issueDate: "2026-03-10",
          customerName: "Send Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-send-1",
              type: "labor",
              description: "Send baseline",
              quantity: 1,
              unitPrice: 130,
              amount: 130
            }
          ],
          subtotal: 130,
          total: 130,
          balanceDue: 130
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Send invoice INV-SEND-1" }).click();
    await page.getByPlaceholder("client@example.com").fill("client@example.com");
    await page.getByRole("button", { name: "Send now" }).click();
    await page.getByText(/(Sent to|Prepared for) client@example.com/i).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Mark opened INV-SEND-1" }).click();
    await page.getByText("Marked as opened.").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library invoice again opens a fresh draft with today's date and a new number", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-test-owner");
  });
  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-test-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Mike Johnson",
          workSessions: [
            {
              date: "Jan 10",
              tasks: [{ description: "Faucet repair", hours: 1, rate: 90, amount: 90 }]
            }
          ],
          materials: [{ description: "Washer", quantity: 1, unitCost: 5, amount: 5 }]
        },
        finishedInvoice: {
          invoiceNumber: "INV-1001",
          issueDate: "2026-02-26",
          customerName: "Mike Johnson",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Faucet repair",
              quantity: 1,
              unitPrice: 90,
              amount: 90
            },
            {
              id: "line-2",
              type: "material",
              description: "Washer",
              quantity: 1,
              unitPrice: 5,
              amount: 5
            }
          ],
          subtotal: 95,
          total: 95,
          balanceDue: 95
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    const today = new Date().toISOString().slice(0, 10);
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Invoice Library" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Invoice again" }).first().click();

    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await page.getByPlaceholder("Description").first().waitFor({ state: "visible" });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Mike Johnson");
    assert.equal(await page.getByLabel("Date").inputValue(), today);
    assert.notEqual(await page.getByLabel("Invoice #").inputValue(), "INV-1001");
    await expectValueContains(page.getByPlaceholder("Description").first(), "Faucet repair");
  } finally {
    await context.close();
  }
});

test("invoice library supports sent and paid status actions", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-status-owner");
  });
  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-status-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Casey Client",
          workSessions: [
            {
              date: "Jan 10",
              tasks: [{ description: "Roof patch", hours: 2, rate: 110, amount: 220 }]
            }
          ],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-STATUS-1",
          issueDate: "2026-03-10",
          customerName: "Casey Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Roof patch",
              quantity: 2,
              unitPrice: 110,
              amount: 220
            }
          ],
          subtotal: 220,
          total: 220,
          balanceDue: 220
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const card = page
      .locator("div.rounded-2xl.border.border-slate-200.bg-white")
      .filter({ hasText: "INV-STATUS-1" })
      .first();
    await card.getByRole("button", { name: "Mark sent" }).click();
    await card.locator("span.rounded-full", { hasText: "sent" }).waitFor({ state: "visible" });

    await card.getByRole("button", { name: "Mark paid" }).click();
    await card.locator("span.rounded-full", { hasText: "paid" }).waitFor({ state: "visible" });

    const listResponse = await context.request.get(`${baseUrl}/api/invoices`, {
      headers: {
        "x-invoice-user-id": "ui-status-owner"
      }
    });
    assert.equal(listResponse.status(), 200);
    const listPayload = await listResponse.json();
    const savedInvoice = (listPayload.invoices || []).find(
      (invoice: { invoiceNumber?: string }) => invoice.invoiceNumber === "INV-STATUS-1"
    );
    assert.ok(savedInvoice);
    assert.equal(savedInvoice.status, "paid");
  } finally {
    await context.close();
  }
});

test("invoice library filters cards by lifecycle status", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-status-filter-owner");
  });

  const createInvoice = async (invoiceNumber: string, description: string) => {
    const response = await context.request.post(`${baseUrl}/api/invoices/save`, {
      headers: {
        "x-invoice-user-id": "ui-status-filter-owner"
      },
      data: {
        confirmSave: true,
        sourceType: "text_input",
        invoiceData: {
          structuredInvoice: {
            customerName: "Filter Client",
            workSessions: [
              {
                date: "Jan 10",
                tasks: [{ description, hours: 1, rate: 120, amount: 120 }]
              }
            ],
            materials: []
          },
          finishedInvoice: {
            invoiceNumber,
            issueDate: "2026-03-10",
            customerName: "Filter Client",
            currency: "USD",
            lineItems: [
              {
                id: `${invoiceNumber}-line-1`,
                type: "labor",
                description,
                quantity: 1,
                unitPrice: 120,
                amount: 120
              }
            ],
            subtotal: 120,
            total: 120,
            balanceDue: 120
          }
        }
      }
    });
    assert.equal(response.status(), 200);
    return (await response.json()).invoice.invoiceId as string;
  };

  const sentId = await createInvoice("INV-FILTER-SENT", "Leak inspection");
  await context.request.post(`${baseUrl}/api/invoices/${sentId}/status`, {
    headers: {
      "x-invoice-user-id": "ui-status-filter-owner",
      "Content-Type": "application/json"
    },
    data: { status: "sent" }
  });

  await createInvoice("INV-FILTER-DRAFT", "Pipe replacement");

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sent (1)" }).click();

    await page.getByText("INV-FILTER-SENT").waitFor({ state: "visible" });
    await page.getByText("INV-FILTER-DRAFT").waitFor({ state: "hidden" });
  } finally {
    await context.close();
  }
});

test("invoice library shows open pay link action when payment link exists", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-pay-link-owner");
  });
  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-pay-link-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Pay Link Client",
          workSessions: [
            {
              date: "Jan 10",
              tasks: [{ description: "Emergency patch", hours: 1, rate: 140, amount: 140 }]
            }
          ],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PAY-LINK-1",
          issueDate: "2026-03-10",
          customerName: "Pay Link Client",
          currency: "USD",
          paymentLinkUrl: "https://pay.example.com/invoice/INV-PAY-LINK-1",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Emergency patch",
              quantity: 1,
              unitPrice: 140,
              amount: 140
            }
          ],
          subtotal: 140,
          total: 140,
          balanceDue: 140
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const card = page
      .locator("div.rounded-2xl.border.border-slate-200.bg-white")
      .filter({ hasText: "INV-PAY-LINK-1" })
      .first();
    await card.getByRole("link", { name: "Open pay link" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("saving a client remembers bill-to details and autofills later matching drafts", async () => {
  useMockResponses([structuredDuplicateDraft(), emptyAudit()]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-client-memory-owner");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("faucet repair");
    await page.getByPlaceholder("Client Name").fill("Mike Johnson\n1423 Pine St");
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Generate Invoice" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Mike Johnson\n1423 Pine St");
  } finally {
    await context.close();
  }
});

test("intake review surfaces recent saved jobs for the matched client", async () => {
  const seedResponse = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: {
        customerName: "Mike Johnson",
        workSessions: [],
        materials: [],
        notes: "Collect a 50% deposit before ordering cedar shingles."
      },
      finishedInvoice: {
        invoiceNumber: "INV-RECENT-1",
        issueDate: "2026-03-01",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "recent-line-1",
            type: "labor",
            description: "Detached garage cedar reroof",
            quantity: 1,
            unitPrice: 900,
            amount: 900
          }
        ],
        notes: "Collect a 50% deposit before ordering cedar shingles.",
        subtotal: 900,
        total: 900,
        balanceDue: 900
      }
    }
  });
  assert.equal(seedResponse.status, 200);

  useMockResponses([structuredDuplicateDraft(), emptyAudit()]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "local-default");
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await page.getByRole("button", { name: "Build invoice" }).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    await page.getByText("Recent for Mike Johnson").waitFor({ state: "visible" });
    await page.getByText("INV-RECENT-1").waitFor({ state: "visible" });
    await page.getByText("Collect a 50% deposit before ordering cedar shingles.").waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("saving an invoice remembers line items and allows one-tap reinsertion later", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-line-item-library-owner");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Faucet repair");
    await page.getByPlaceholder("0").first().fill("1");
    await page.getByPlaceholder("$0").first().fill("90");
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.evaluate(() => {
      window.localStorage.removeItem("invoiceDraft::owner:ui-line-item-library-owner");
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Saved items/i }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /Saved items/i }).click();
    await page.getByRole("button", { name: "Insert saved item Faucet repair" }).click();

    await expectValueContains(page.getByPlaceholder("Description").first(), "Faucet repair");
    assert.equal(await page.getByPlaceholder("0").first().inputValue(), "1");
    assert.equal(await page.getByPlaceholder("$0").first().inputValue(), "90");
  } finally {
    await context.close();
  }
});

test("manual saved items prioritize same-client matches in suggestions", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-manual-client-match-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "142",
          clientName: "Other Client",
          updatedAt: "2026-03-11T12:00:00.000Z"
        },
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "155",
          clientName: "Mike Johnson",
          updatedAt: "2026-03-10T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Mike Johnson");
    await page.getByPlaceholder("Description").first().fill("Leak inspection");
    await page.getByRole("button", { name: /Saved items/i }).click();

    const firstSavedItem = page.locator('button[aria-label^="Insert saved item"]').first();
    await firstSavedItem.getByText("Rate $155").waitFor({ state: "visible" });
    await firstSavedItem.getByText("Client match").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual line items offer one-tap suggested rate from saved client history", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-manual-rate-suggestion-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "142",
          clientName: "Other Client",
          updatedAt: "2026-03-12T12:00:00.000Z"
        },
        {
          description: "Leak inspection service",
          qty: "1",
          rate: "155",
          clientName: "Mike Johnson",
          updatedAt: "2026-03-11T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Mike Johnson");
    await page.getByPlaceholder("Description").first().fill("Leak inspection of roof flashing");

    await page
      .getByRole("button", { name: /Apply suggested rate \$155\.00 to line 1/i })
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: /Apply suggested rate \$155\.00 to line 1/i }).click();

    assert.equal(await page.getByPlaceholder("$0").first().inputValue(), "155");
    await page.getByText(/Applied suggested rate \$155\.00\/hr \(client match/i).waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("manual editor save shows sign-in guidance when auth is required", async () => {
  process.env.INVOICE_REQUIRE_AUTH = "true";
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("sink repair");
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();

    await page.getByText("Sign in required to save invoices.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Go to launcher sign-in" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "I signed in, retry" }).waitFor({ state: "visible" });
  } finally {
    delete process.env.INVOICE_REQUIRE_AUTH;
    await context.close();
  }
});

test("manual editor export shows pre-limit warning when one free save remains", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "2";

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-plan-warning-manual-owner");
  });

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-plan-warning-manual-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Manual Warning Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PLAN-WARN-MANUAL-1",
          issueDate: "2026-03-10",
          customerName: "Manual Warning Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Manual warning baseline",
              quantity: 1,
              unitPrice: 100,
              amount: 100
            }
          ],
          subtotal: 100,
          total: 100,
          balanceDue: 100
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Free plan · 1/2 saved this month").waitFor({ state: "visible" });
    await page.getByText("1 save left this month before upgrade is required.").waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("manual editor save shows free-plan limit message from API", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  process.env.INVOICE_UPGRADE_URL = "https://notebill.app/upgrade";

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-plan-save-owner");
  });

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-plan-save-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Plan Save Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PLAN-SAVE-1",
          issueDate: "2026-03-10",
          customerName: "Plan Save Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Plan save baseline",
              quantity: 1,
              unitPrice: 100,
              amount: 100
            }
          ],
          subtotal: 100,
          total: 100,
          balanceDue: 100
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Second invoice");
    await page.getByPlaceholder("0").first().fill("1");
    await page.getByPlaceholder("$0").first().fill("120");
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Free plan · 1/1 saved this month (limit reached)").waitFor({ state: "visible" });
    await page.getByText("Save limit reached. Update existing invoices or upgrade to save more.").waitFor({
      state: "visible"
    });
    const upgradeLink = page.getByRole("link", { name: "Upgrade plan" });
    await upgradeLink.waitFor({ state: "visible" });
    assert.equal(await upgradeLink.getAttribute("href"), "https://notebill.app/upgrade");
    await page.getByRole("button", { name: "Save invoice" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Save invoice" }).isDisabled(), true);
  } finally {
    await context.close();
  }
});

test("manual export panel can mark a saved invoice as sent then paid", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-manual-status-owner");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Description").first().fill("Roof leak repair");
    await page.getByPlaceholder("0").first().fill("1");
    await page.getByPlaceholder("$0").first().fill("180");

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Mark sent" }).click();
    await page.getByText("Current: sent").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Mark paid" }).click();
    await page.getByText("Current: paid").waitFor({ state: "visible" });

    const listResponse = await context.request.get(`${baseUrl}/api/invoices`, {
      headers: {
        "x-invoice-user-id": "ui-manual-status-owner"
      }
    });
    assert.equal(listResponse.status(), 200);
    const listPayload = await listResponse.json();
    assert.equal(Array.isArray(listPayload.invoices), true);
    assert.equal(listPayload.invoices.length, 1);
    assert.equal(listPayload.invoices[0].status, "paid");
  } finally {
    await context.close();
  }
});

test("diagnostics route shows OCR, friction, persistence, billing, and delivery panels", async () => {
  if (flowFrictionReportFilePath) {
    await fs.writeFile(
      flowFrictionReportFilePath,
      JSON.stringify(
        {
          timestamp: "2026-02-20T10:30:00.000Z",
          baseUrl: "http://localhost:3000",
          checks: [{ name: "single primary action on paste", pass: true, details: "Build invoice only" }],
          issues: []
        },
        null,
        2
      ),
      "utf8"
    );
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/diagnostics`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Intake telemetry" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "System health snapshot" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "OCR confidence" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Trend baseline" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Flow friction checks" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Persistence migration" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Billing diagnostics" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Delivery diagnostics" }).waitFor({ state: "visible" });
    await page.getByText("No legacy file-store invoices detected.").waitFor({ state: "visible" });
    await page.getByText("single primary action on paste").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

async function openIntake(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
  await page.getByText(/(AI Invoice Assistant|Billie at NoteBill)/).waitFor({ state: "visible" });
}

async function waitForCondition(
  condition: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 50;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
  throw new Error(options.message || "Condition timed out.");
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

function structuredDecisionDraft() {
  return {
    customerName: "Mike Johnson",
    workSessions: [
      {
        date: "Jan 30",
        tasks: [
          { description: "Faucet repair", hours: 2, rate: 80, amount: 160 },
          { description: "Cabinet door adjustment", hours: 0.33, rate: 80, amount: 26.4 }
        ]
      }
    ],
    materials: []
  };
}

function decisionAudit() {
  return {
    assumptions: [],
    decisions: [
      {
        kind: "billing",
        prompt: "Bill cabinet door adjustment?",
        sourceSnippet: "Cabinet door adjustment maybe charge."
      }
    ],
    unparsedLines: []
  };
}

function structuredLaborFollowUpDraft() {
  return {
    workSessions: [
      {
        date: "Jan 11",
        tasks: [{ description: "Leak inspection" }]
      }
    ],
    materials: []
  };
}

function structuredDuplicateDraft() {
  return {
    customerName: "Mike Johnson",
    workSessions: [
      {
        date: "Jan 10",
        tasks: [{ description: "Faucet repair", hours: 1, rate: 90, amount: 90 }]
      }
    ],
    materials: [
      { description: "Washer", quantity: 1, unitCost: 5, amount: 5 },
      { description: "Washer", quantity: 1, unitCost: 5, amount: 5 }
    ]
  };
}

function structuredInvoiceForImport() {
  return {
    customerName: "Mike Johnson",
    workSessions: [
      {
        date: "Jan 30",
        tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
      }
    ],
    materials: []
  };
}

function structuredInvoiceForTimeline() {
  return {
    customerName: "Mike Johnson",
    workSessions: [
      {
        date: "Jan 28",
        tasks: [{ description: "Leak inspection", hours: 0.5, rate: 0, amount: 0 }]
      },
      {
        date: "Jan 30",
        tasks: [{ description: "Leak repair", hours: 2, rate: 80, amount: 160 }]
      },
      {
        date: "Feb 2",
        tasks: [{ description: "Cabinet door adjustment", hours: 0.5, rate: 80, amount: 40 }]
      }
    ],
    materials: [{ description: "Washer kit", quantity: 1, unitCost: 6, amount: 6 }]
  };
}

function structuredInvoiceWithNotes() {
  return {
    customerName: "Mike Johnson",
    workSessions: [
      {
        date: "Jan 30",
        tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
      }
    ],
    materials: [],
    notes: "pay in 7 days thanks"
  };
}

function safeBillieEditResponse() {
  return {
    invoice: {
      currency: "USD",
      lineItems: [
        {
          type: "labor",
          description: "Kitchen faucet repair service",
          quantity: 2,
          unitPrice: 80,
          amount: 160
        }
      ],
      notes: "Thank you for your business."
    }
  };
}

function safeBillieDecisionSkipEditResponse() {
  return {
    invoice: {
      currency: "USD",
      lineItems: [
        {
          type: "labor",
          description: "Kitchen faucet repair service",
          quantity: 2,
          unitPrice: 80,
          amount: 160
        },
        {
          type: "labor",
          description: "Cabinet door alignment service",
          quantity: 0.33,
          unitPrice: 0,
          amount: 0
        }
      ],
      notes: ""
    }
  };
}

function unsafeBillieMoneyEditResponse() {
  return {
    invoice: {
      currency: "USD",
      lineItems: [
        {
          type: "labor",
          description: "Faucet repair",
          quantity: 3,
          unitPrice: 80,
          amount: 240
        }
      ]
    }
  };
}

function emptyAudit() {
  return {
    assumptions: [],
    decisions: [],
    unparsedLines: []
  };
}

async function mutateStoredInvoice(
  invoiceId: string,
  updates: { status?: string; updatedAt?: string }
) {
  if (!invoiceStoreFilePath || !invoiceId) {
    return;
  }
  const raw = await fs.readFile(invoiceStoreFilePath, "utf8");
  const parsed = JSON.parse(raw);
  const invoices = Array.isArray(parsed?.invoices) ? parsed.invoices : [];
  parsed.invoices = invoices.map((invoice: Record<string, unknown>) => {
    if (invoice?.invoiceId !== invoiceId) {
      return invoice;
    }
    return {
      ...invoice,
      status: updates.status ?? invoice.status,
      updatedAt: updates.updatedAt ?? invoice.updatedAt
    };
  });
  await fs.writeFile(invoiceStoreFilePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

async function expectValueContains(
  locator: Locator,
  expectedValue: string,
  timeoutMs = 5000
) {
  await locator.waitFor({ state: "visible" });
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentValue = await locator.inputValue();
    if (currentValue.includes(expectedValue)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const finalValue = await locator.inputValue();
  throw new Error(`Expected value to include "${expectedValue}" but got "${finalValue}".`);
}

async function expectValueEquals(
  locator: Locator,
  expectedValue: string,
  timeoutMs = 5000
) {
  await locator.waitFor({ state: "visible" });
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentValue = await locator.inputValue();
    if (currentValue === expectedValue) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const finalValue = await locator.inputValue();
  throw new Error(`Expected value to equal "${expectedValue}" but got "${finalValue}".`);
}
