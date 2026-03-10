import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
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
    await page.getByText("pay in 7 days thanks").waitFor({ state: "visible" });
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

test("business identity defaults prefill new manual drafts", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
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

test("diagnostics route shows OCR and friction telemetry panels", async () => {
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
    await page.getByRole("heading", { name: "OCR confidence" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Trend baseline" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Flow friction checks" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Persistence migration" }).waitFor({ state: "visible" });
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

async function expectValueContains(
  locator: ReturnType<Page["getByPlaceholder"]>,
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
