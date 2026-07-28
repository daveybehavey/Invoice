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
import type { SavedInvoice } from "./models/invoice.js";

/** Browser-local recurring schedule entry shape used by launcher/library storage. */
type RecurringScheduleEntry = {
  intervalDays: number;
  nextDueAt: string;
  autoSendEnabled?: boolean;
  autoSendRunCount?: number;
  lastAutoSendAt?: string;
  lastAutoSendRecipient?: string;
  lastAutoSendMode?: string;
};

type RecurringScheduleStore = {
  entries?: Record<string, RecurringScheduleEntry>;
};

declare global {
  interface Window {
    __copiedSharePack?: string;
  }
}

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

test("public policy pages render from their routes", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/privacy`);
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Privacy Policy");
    assert.equal(await page.getByRole("link", { name: "Data deletion" }).isVisible(), true);

    await page.goto(`${baseUrl}/support`);
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Support");
    assert.equal(await page.getByText("Support email: support@notebill.app", { exact: true }).isVisible(), true);

    await page.goto(`${baseUrl}/help`);
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Help Center");
    await page.getByTestId("help-center-quick-starts").getByText("Build your first invoice").waitFor({
      state: "visible"
    });
    await page.getByTestId("help-center-faq").getByText("Where should I start if I only have messy job notes?").waitFor({
      state: "visible"
    });

    await page.goto(`${baseUrl}/feedback`);
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Feedback");
    const feedbackLink = page.getByRole("link", { name: "Email feedback" });
    assert.equal(await feedbackLink.isVisible(), true);
    assert.match(decodeURIComponent((await feedbackLink.getAttribute("href")) ?? ""), /NoteBill feedback details/);
    assert.equal(await page.getByText("Two-minute tester script", { exact: true }).isVisible(), true);
    await page.getByTestId("feedback-v2-test-plan").getByText("V2 tester pass").waitFor({ state: "visible" });
    await page.getByTestId("feedback-v2-test-plan").getByText("Send/payment").waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/data-deletion`);
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Account and Data Deletion");
    assert.equal(await page.locator(`text=${"Delete my NoteBill account"}`).isVisible(), true);

    await page.goto(`${baseUrl}/delete-account`);
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Account and Data Deletion");
  } finally {
    await context.close();
  }
});

test("feedback page exposes device details for tester reports", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/feedback?token=secret-test-value#debug`);
    const deviceDetails = await page.locator("pre").textContent();
    assert.match(deviceDetails ?? "", /NoteBill feedback details/);
    assert.match(deviceDetails ?? "", /Viewport:/);
    assert.match(deviceDetails ?? "", /User agent:/);
    assert.doesNotMatch(deviceDetails ?? "", /secret-test-value/);

    await page.getByRole("button", { name: "Copy device details" }).click();

    await page.locator('[role="status"]').waitFor();
    assert.match(
      (await page.locator('[role="status"]').textContent()) ?? "",
      /Device details copied\.|Copy failed\.|Copy is unavailable here\./
    );
  } finally {
    await context.close();
  }
});

test("launcher manage tools include a tester feedback shortcut", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Show manage tools" }).click();
    await page.locator("#launcher-manage-options").getByRole("button", { name: /Feedback/ }).click();
    await page.waitForSelector("h1");

    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Feedback");
  } finally {
    await context.close();
  }
});

test("launcher manage tools include support access", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Show manage tools" }).click();
    await page.locator("#launcher-manage-options").getByRole("button", { name: /Help and support/ }).click();
    await page.waitForSelector("h1");

    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Support");
  } finally {
    await context.close();
  }
});

test("manual, intake, and library can open the help center", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Help center" }).click();
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Help Center");

    await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Help center" }).click();
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Help Center");

    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Help" }).click();
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Help Center");
  } finally {
    await context.close();
  }
});

test("launcher manage tools include a saved service catalog shortcut", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Show manage tools" }).click();
    await page.locator("#launcher-manage-options").getByRole("button", { name: /Services/ }).click();
    await page.waitForSelector("h1");

    assert.equal((await page.locator("h1").textContent())?.trim(), "Review and reuse your service catalog");
  } finally {
    await context.close();
  }
});

test("launcher footer exposes feedback and support", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Feedback" }).waitFor({ state: "visible" });
    assert.equal(
      await page.getByRole("link", { name: "Support" }).getAttribute("href"),
      "mailto:support@notebill.app"
    );

    await page.getByRole("button", { name: "Feedback" }).click();
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Feedback");
  } finally {
    await context.close();
  }
});

test("launcher welcome screen shows sign-in and guest entry", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.addInitScript(() => {
      window.localStorage.removeItem("invoiceGuestEntryDismissed");
      window.localStorage.removeItem("invoiceAuthPendingReturnPath");
    });
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    await page.getByRole("heading", { name: "NoteBill" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Continue with Google" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Continue with email" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Continue as guest" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Continue as guest" }).click();

    await page.getByRole("button", { name: "Show manage tools" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("launcher sign-in modal shows provider readiness and keeps email-link flow active", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    const providerList = page.getByTestId("launcher-auth-provider-list");
    await providerList.waitFor({ state: "visible" });
    await providerList.getByText("Email sign-in link", { exact: true }).waitFor({ state: "visible" });
    await providerList.getByText("Available now", { exact: true }).waitFor({ state: "visible" });
    await providerList
      .getByText("Email sign-in will use preview links until an email provider is configured.")
      .waitFor({ state: "visible" });
    await providerList.getByText("Google Sign-In", { exact: true }).waitFor({ state: "visible" });
    await providerList.getByText("Needs setup", { exact: true }).waitFor({ state: "visible" });
    await providerList
      .getByText("Google Sign-In requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before it can be used.")
      .waitFor({ state: "visible" });

    await page.getByLabel("Email link sign-in").fill("owner@example.com");
    await page.getByRole("button", { name: "Email sign-in link" }).click();
    await page
      .getByText("Email delivery is not configured here, so a preview sign-in link is available below.")
      .waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Open preview sign-in link" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("google sign-in completion page stores a hosted session and returns to launcher", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const linkResponse = await context.request.post(`${baseUrl}/api/auth/session`, {
      data: { email: "owner@example.com" }
    });
    assert.equal(linkResponse.status(), 200);
    const previewUrl = String((await linkResponse.json()).previewUrl ?? "");
    const tokenFromLink = new URL(previewUrl).searchParams.get("token");
    assert.ok(tokenFromLink);
    const verifyResponse = await context.request.post(`${baseUrl}/api/auth/session/verify`, {
      data: { token: tokenFromLink }
    });
    assert.equal(verifyResponse.status(), 200);
    const verifiedPayload = await verifyResponse.json();
    const hostedToken = String(verifiedPayload.token ?? "");
    const hostedSession = verifiedPayload.session ?? {};

    await page.goto(
      `${baseUrl}/auth/google#token=${encodeURIComponent(hostedToken)}&userId=${encodeURIComponent(
        String(hostedSession.userId ?? "")
      )}&email=${encodeURIComponent(String(hostedSession.email ?? ""))}&expiresAt=${encodeURIComponent(
        String(hostedSession.expiresAt ?? "")
      )}&next=%2F`,
      { waitUntil: "networkidle" }
    );

    await page.waitForURL(`${baseUrl}/`, { timeout: 10000 });
    await page
      .getByText("Signed in as owner@example.com with Google Sign-In. Setup progress is now tied to your account.")
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("email sign-in verification returns to the pending app route", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const linkResponse = await context.request.post(`${baseUrl}/api/auth/session`, {
      data: { email: "owner@example.com" }
    });
    assert.equal(linkResponse.status(), 200);
    const previewUrl = String((await linkResponse.json()).previewUrl ?? "");
    const tokenFromLink = new URL(previewUrl).searchParams.get("token");
    assert.ok(tokenFromLink);

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.sessionStorage.setItem("invoiceAuthPendingReturnPath", "/manual");
    });

    await page.goto(`${baseUrl}/auth/verify?token=${encodeURIComponent(String(tokenFromLink))}`, {
      waitUntil: "networkidle"
    });

    await page.waitForURL(`${baseUrl}/manual`, { timeout: 10000 });
  } finally {
    await context.close();
  }
});

test("legacy import page explains old file import and editable follow-up", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
    await page.waitForSelector("h1");

    assert.equal((await page.locator("h1").textContent())?.trim(), "Upload old invoice files or photo notes");
    await page.getByText("Legacy import", { exact: true }).waitFor({ state: "visible" });
    const bodyText = (await page.locator("main").textContent()) ?? "";
    assert.match(
      bodyText,
      /Older PDFs, CSVs, text files, and photo notes can be imported directly or previewed first\./i
    );
    assert.match(
      bodyText,
      /Imported content stays editable so Billie can help polish the draft later\./i
    );
  } finally {
    await context.close();
  }
});

test("manual editor opens Billie edit tab when requested by query param", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/manual?tab=assistant&source=import`, { waitUntil: "networkidle" });
    const mainText = (await page.locator("main").textContent()) ?? "";
    assert.match(mainText, /Imported draft ready for Billie review\./i);
    const billieIntro = page
      .getByText("Ask for changes without retyping. Billie will only adjust what you request.", {
        exact: true
      })
      .first();
    await billieIntro.waitFor({ state: "visible" });
    assert.equal(
      await billieIntro.isVisible(),
      true
    );
  } finally {
    await context.close();
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
    await getPrimaryIntakeBuildButton(page).click();

    await getPrimaryIntakeStickyButton(page, "Resolve decisions").waitFor({ state: "visible" });

    await page.locator("div.nb-sticky-panel").getByRole("button", { name: "Add" }).click();

    await getPrimaryIntakeStickyButton(page, "Generate Invoice").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo" }).click();

    await getPrimaryIntakeStickyButton(page, "Resolve decisions").waitFor({ state: "visible" });
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
    await getPrimaryIntakeBuildButton(page).click();

    await page.locator("div.nb-sticky-panel").getByRole("button", { name: "Skip" }).waitFor({
      state: "visible"
    });
    await page.locator("div.nb-sticky-panel").getByRole("button", { name: "Skip" }).click();

    await getPrimaryIntakeStickyButton(page, "Generate Invoice").waitFor({ state: "visible" });
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

test("mobile generate CTA stays clear of Billie composer footer", async () => {
  useMockResponses([structuredDecisionDraft(), decisionAudit()]);

  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr. Cabinet door adjustment maybe charge.");
    await getPrimaryIntakeBuildButton(page).click();

    await page.locator("div.nb-sticky-panel").getByRole("button", { name: "Skip" }).waitFor({
      state: "visible"
    });
    await page.locator("div.nb-sticky-panel").getByRole("button", { name: "Skip" }).click();

    await getPrimaryIntakeStickyButton(page, "Generate Invoice").waitFor({ state: "visible" });
    await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    });

    const geometry = await page.evaluate(() => {
      const stickyPanel = document.querySelector("div.nb-sticky-panel");
      const generateButton = stickyPanel
        ? Array.from(stickyPanel.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Generate Invoice"
          )
        : null;
      const composer = document.querySelector(".nb-billie-composer");
      if (!generateButton || !composer) {
        return null;
      }
      const buttonRect = generateButton.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();
      const centerX = Math.max(0, Math.min(window.innerWidth - 1, buttonRect.left + buttonRect.width / 2));
      const centerY = Math.max(0, Math.min(window.innerHeight - 1, buttonRect.top + buttonRect.height / 2));
      const topElement = document.elementFromPoint(centerX, centerY);
      return {
        buttonBottom: buttonRect.bottom,
        composerTop: composerRect.top,
        topText: topElement?.textContent?.trim() ?? "",
        viewportHeight: window.innerHeight
      };
    });

    assert.ok(geometry, "Expected Generate Invoice button and Billie composer to be present.");
    assert.ok(
      geometry.buttonBottom <= geometry.composerTop - 8,
      `Generate Invoice button overlaps footer: ${JSON.stringify(geometry)}`
    );
    assert.match(geometry.topText, /Generate Invoice/);
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

test("launcher sample notes open intake with a realistic starter draft", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByText("Start with Billie", { exact: true }).first().waitFor({ state: "visible" });
    await page.getByTestId("launcher-first-invoice-guide").getByText("Guided first invoice").waitFor({
      state: "visible"
    });
    await page.getByText(/First invoice\?/i).waitFor({ state: "visible" });
    await page.getByText(/Try sample notes.*quick walkthrough/i).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Start walkthrough" }).click();

    const notes = page.getByPlaceholder(/Example: Jan 10 fixed sink/i);
    await notes.waitFor({ state: "visible" });
    await expectValueContains(notes, "Repaired leaking kitchen sink");
    await page.getByTestId("intake-onboarding-section").getByText("Guided walkthrough").waitFor({
      state: "visible"
    });
    await page.getByTestId("intake-starter-walkthrough").waitFor({ state: "visible" });
    await page.getByTestId("intake-starter-walkthrough").getByText("Sample notes loaded").waitFor({
      state: "visible"
    });
    await page
      .getByText("Sample notes loaded. Review them, then build the invoice.")
      .waitFor({ state: "visible" });
    await page.getByTestId("intake-starter-walkthrough").getByRole("button", { name: "Hide guide" }).click();
    await page.getByTestId("intake-starter-walkthrough").waitFor({ state: "hidden" });
  } finally {
    await context.close();
  }
});

test("guided walkthrough stays active from launcher through manual editor", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openLauncher(page);
    await page.getByRole("button", { name: "Start walkthrough" }).click();

    await page.getByTestId("intake-onboarding-section").getByText("Guided walkthrough").waitFor({
      state: "visible"
    });

    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Generate Invoice" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });

    const manualOnboarding = page.getByTestId("manual-onboarding-section");
    await manualOnboarding.waitFor({ state: "visible" });
    await manualOnboarding.getByText("Guided walkthrough").waitFor({ state: "visible" });
    await manualOnboarding
      .getByText("You made it to the editor. Save this draft first, then export the PDF")
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual onboarding cue updates through save, payment link, and portal setup", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-manual-onboarding-cue-owner");
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/*/payment-link", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          paymentLinkUrl: "https://pay.stripe.test/plink_manual_onboarding_123"
        })
      });
    });
    await page.route("**/api/invoices/*/client-portal-link", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          clientPortalUrl: "https://app.notebill.app/portal/123e4567-e89b-12d3-a456-426614174111/token-onboarding",
          invoice: {
            invoiceData: {
              finishedInvoice: {
                portalAccessToken: "token-onboarding"
              }
            }
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const cue = page.getByTestId("manual-onboarding-next-cue");
    await cue.getByText("Make this invoice send-ready first.").waitFor({ state: "visible" });

    await page.locator('textarea[placeholder="Client Name"]:visible').fill("Northwind Roofing");
    await page.locator('input[placeholder="Description"]:visible').first().fill("Roof patch repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("325");

    await cue.getByText("Your draft is ready to save.").waitFor({ state: "visible" });
    await cue.getByRole("button", { name: "Save draft" }).click();
    await cue.getByText("The draft is saved. Add the customer handoff pieces next.").waitFor({
      state: "visible"
    });
    await cue.getByRole("button", { name: "Create payment link" }).click();
    await cue.getByText("Payment link is ready. Add the portal to finish the handoff.").waitFor({
      state: "visible"
    });

    await cue.getByRole("button", { name: "Create client portal" }).click();
    await cue.getByText("Everything needed for a polished handoff is ready.").waitFor({
      state: "visible"
    });
    await cue.getByRole("button", { name: "Copy share pack" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("intake Billie next-up guide updates from notes to draft-ready state", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openIntake(page);
    const guide = page.getByTestId("intake-billie-next-up");
    await guide.getByText("Load notes to start the draft.").waitFor({ state: "visible" });

    await guide.getByRole("button", { name: "Try sample notes" }).click();
    await guide.getByText("Build this sample into a draft.").waitFor({ state: "visible" });

    await guide.getByRole("button", { name: "Build invoice" }).click();
    await guide.getByText("The draft is ready for the editor.").waitFor({ state: "visible" });
    await guide.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await guide.getByRole("button", { name: "Open Billie workspace" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("intake can hand off directly into manual Billie workspace", async () => {
  useMockResponses([structuredInvoiceWithNotes(), emptyAudit()]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.\nNotes: pay in 7 days thanks.");
    await getPrimaryIntakeBuildButton(page).click();
    await getPrimaryIntakeStickyButton(page, "Generate Invoice").waitFor({ state: "visible" });
    await getIntakeButtonOutsideNextUp(page, "Show review details").click();
    await page.getByText(/Notes:\s*pay in 7 days thanks/i).waitFor({ state: "visible" });
    const nextUp = page.getByTestId("intake-billie-next-up");
    await nextUp.getByRole("button", { name: "Open Billie workspace" }).waitFor({ state: "visible" });
    await nextUp.getByRole("button", { name: "Open Billie workspace" }).click();

    await page.waitForURL(/\/manual\?tab=assistant&source=intake$/, { timeout: 10000 });
    await page.getByText("Draft ready for Billie handoff from intake review.").waitFor({ state: "visible" });
    await page.getByText("Continue from intake review", { exact: true }).waitFor({ state: "visible" });
    await page
      .getByText(
        "Billie already helped structure the draft. Use these starter actions to tighten wording and notes before you move into save, payment, or portal handoff."
      )
      .waitFor({ state: "visible" });
    await page
      .locator('[data-testid="manual-billie-workspace"]')
      .getByRole("button", { name: "Polish intake draft" })
      .waitFor({ state: "visible" });
    await expectValueEquals(
      page.locator('[data-testid="manual-billie-workspace"]').getByPlaceholder(/Ask Billie to refine wording/i),
      "Refine the line item wording and notes so this invoice feels polished and client-ready. Keep numbers unchanged."
    );
  } finally {
    await context.close();
  }
});

test("library can reopen a saved invoice directly in Billie workspace", async () => {
  const ownerId = "ui-library-billie-open-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Library Billie Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LIB-BILLIE-1",
          issueDate: "2026-03-12",
          customerName: "Library Billie Client",
          currency: "USD",
          lineItems: [
            {
              id: "library-billie-line-1",
              type: "labor",
              description: "Rough maintenance wording",
              quantity: 1,
              unitPrice: 120,
              amount: 120
            }
          ],
          notes: "Need cleaner client-facing notes.",
          subtotal: 120,
          total: 120,
          balanceDue: 120
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open with Billie" }).first().click();

    await page.waitForURL(/\/manual\?tab=assistant&source=library$/, { timeout: 10000 });
    await page.getByText("Saved invoice reopened in Billie workspace.").waitFor({ state: "visible" });
    await page.getByText("Continue from saved work").waitFor({ state: "visible" });
    await page
      .locator('[data-testid="manual-billie-workspace"]')
      .getByRole("button", { name: "Polish reopened draft" })
      .waitFor({ state: "visible" });
    await expectValueEquals(
      page.locator('[data-testid="manual-billie-workspace"]').getByPlaceholder(/Ask Billie to refine wording/i),
      "Refine the invoice wording and notes so this saved draft feels polished and client-ready. Keep numbers unchanged."
    );
  } finally {
    await context.close();
  }
});

test("first invoice onboarding tracks progress across launcher, intake, and manual", async () => {
  useMockResponses([structuredInvoiceForImport(), emptyAudit()]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openLauncher(page);
    const launcherOnboarding = page.getByTestId("launcher-onboarding-section");
    await launcherOnboarding.waitFor({ state: "visible" });
    await launcherOnboarding.getByText(/0 of 5 complete/i).waitFor({ state: "visible" });
    await launcherOnboarding.getByRole("button", { name: "Start with Billie" }).click();

    const intakeOnboarding = page.getByTestId("intake-onboarding-section");
    await intakeOnboarding.waitFor({ state: "visible" });
    await intakeOnboarding.getByText("1 of 5 core steps complete").waitFor({ state: "visible" });

    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await intakeOnboarding.getByText("2 of 5 core steps complete").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Generate Invoice" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });

    const manualOnboarding = page.getByTestId("manual-onboarding-section");
    await manualOnboarding.waitFor({ state: "visible" });
    await manualOnboarding.getByText("3 of 5 core steps complete").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });
    await manualOnboarding.getByText("4 of 5 core steps complete").waitFor({ state: "visible" });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    assert.match(await download.suggestedFilename(), /^Invoice-.*\.pdf$/i);
    await manualOnboarding.getByText("You finished the first full NoteBill loop.").waitFor({
      state: "visible"
    });

    await openLauncher(page);
    const completionCard = page.getByTestId("launcher-onboarding-complete");
    await completionCard.waitFor({ state: "visible" });
    await completionCard.getByText("You finished the full first-invoice loop.").waitFor({
      state: "visible"
    });
    await completionCard.getByText("0 of 4 setup steps complete").waitFor({ state: "visible" });
    await completionCard.getByTestId("launcher-v2-runway").getByText("V2 launch runway").waitFor({
      state: "visible"
    });
    await completionCard.getByRole("button", { name: "Open branding" }).click();
    await page.waitForURL(/\/settings\/business(?:\?from=onboarding-complete)?$/, { timeout: 10000 });
    await page.getByRole("heading", { name: "Set your default invoice branding" }).waitFor({
      state: "visible"
    });
    await page
      .getByText("First invoice complete. Branding is the fastest next upgrade.")
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("onboarding completion setup pages chain branding, memory, and services", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-onboarding-setup-owner");
    window.localStorage.setItem(
      "firstInvoiceOnboarding::owner:ui-onboarding-setup-owner",
      JSON.stringify({
        version: 1,
        startedAt: "2026-05-01T12:00:00.000Z",
        completionAcknowledgedAt: "2026-05-01T12:05:00.000Z",
        completedSetupSteps: {},
        completedSteps: {
          capture_notes: "2026-05-01T12:01:00.000Z",
          review_draft: "2026-05-01T12:02:00.000Z",
          open_editor: "2026-05-01T12:03:00.000Z",
          save_invoice: "2026-05-01T12:04:00.000Z",
          export_pdf: "2026-05-01T12:05:00.000Z"
        }
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/settings/business?from=onboarding-complete`, {
      waitUntil: "networkidle"
    });
    await page.getByText("First invoice complete. Branding is the fastest next upgrade.").waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Save defaults" }).click();
    await page.getByText("Business identity saved.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open memory" }).click();

    await page.waitForURL(/\/settings\/memory\?from=onboarding-complete$/, { timeout: 10000 });
    await page.getByText("Nice work. Now make repeat clients feel easier.").waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Open services" }).click();

    await page.waitForURL(/\/settings\/services\?from=onboarding-complete$/, { timeout: 10000 });
    await page.getByText("Your first invoice is done. Now save the work you want to repeat.").waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Return to launcher" }).click();
    await page.waitForURL(/\/$/, { timeout: 10000 });
    const setupSection = page.getByTestId("launcher-setup-section");
    await setupSection.waitFor({ state: "visible" });
    await setupSection.getByText("3 of 4 setup steps complete").waitFor({ state: "visible" });
    await setupSection.getByText("Link your account").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("launcher shows a V2 runway after onboarding and setup are complete", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-v2-ready-owner");
    window.localStorage.setItem(
      "firstInvoiceOnboarding::owner:ui-v2-ready-owner",
      JSON.stringify({
        version: 1,
        startedAt: "2026-05-01T12:00:00.000Z",
        completionAcknowledgedAt: "2026-05-01T12:10:00.000Z",
        completedSteps: {
          capture_notes: "2026-05-01T12:01:00.000Z",
          review_draft: "2026-05-01T12:02:00.000Z",
          open_editor: "2026-05-01T12:03:00.000Z",
          save_invoice: "2026-05-01T12:04:00.000Z",
          export_pdf: "2026-05-01T12:05:00.000Z"
        },
        completedSetupSteps: {
          sign_in: "2026-05-01T12:06:00.000Z",
          setup_branding: "2026-05-01T12:07:00.000Z",
          setup_memory: "2026-05-01T12:08:00.000Z",
          setup_services: "2026-05-01T12:09:00.000Z"
        }
      })
    );
  });
  const page = await context.newPage();
  try {
    await openLauncher(page);
    const readySection = page.getByTestId("launcher-v2-ready-section");
    await readySection.waitFor({ state: "visible" });
    await readySection.getByText("V2 launch runway is unlocked.").waitFor({ state: "visible" });
    await readySection.getByText("Send/payment dress rehearsal").waitFor({ state: "visible" });
    await readySection.getByText("Portal-ready invoice").waitFor({ state: "visible" });
    await readySection.getByRole("button", { name: "Open feedback" }).click();
    await page.waitForSelector("h1");
    assert.equal((await page.locator("h1").textContent())?.trim(), "NoteBill Feedback");
  } finally {
    await context.close();
  }
});

test("launcher sign-in setup step explains the post-sign-in return path", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-onboarding-signin-owner");
    window.localStorage.setItem(
      "firstInvoiceOnboarding::owner:ui-onboarding-signin-owner",
      JSON.stringify({
        version: 1,
        startedAt: "2026-05-01T12:00:00.000Z",
        completionAcknowledgedAt: "2026-05-01T12:10:00.000Z",
        completedSteps: {
          capture_notes: "2026-05-01T12:01:00.000Z",
          review_draft: "2026-05-01T12:02:00.000Z",
          open_editor: "2026-05-01T12:03:00.000Z",
          save_invoice: "2026-05-01T12:04:00.000Z",
          export_pdf: "2026-05-01T12:05:00.000Z"
        },
        completedSetupSteps: {}
      })
    );
  });
  const page = await context.newPage();
  try {
    await openLauncher(page);
    const setupSection = page.getByTestId("launcher-setup-section");
    await setupSection.waitFor({ state: "visible" });
    await setupSection.getByRole("button", { name: "Open sign-in" }).first().click();
    await page.getByText("After sign-in, you'll go straight to branding setup.").waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("launcher opens the daily scratchpad quick capture flow", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openLauncher(page);
    await page.getByRole("button", { name: "Open scratchpad" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open scratchpad" }).click();
    await page.getByRole("heading", { name: "Capture work fast. Invoice later." }).waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Back to launcher" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("daily scratchpad saves a note and moves it into the manual invoice draft", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openDailyScratchpad(page);
    await scratchpadNoteEditor(page).fill("Installed replacement filter and checked pressure.");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByText("1 saved note").waitFor({ state: "visible" });
    await page.getByText("Installed replacement filter and checked pressure.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use in invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use in invoice" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(
      page.getByPlaceholder("Thank you for your business"),
      "Installed replacement filter and checked pressure."
    );
  } finally {
    await context.close();
  }
});

test("daily scratchpad can hand a note off to Billie intake", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openDailyScratchpad(page);
    await scratchpadNoteEditor(page).fill("Installed replacement filter and checked pressure.");
    await page
      .getByPlaceholder("Tags, comma separated: client, job, materials")
      .fill("hvac, urgent");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByRole("button", { name: "Open with Billie" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open with Billie" }).click();
    await page.waitForURL(/\/ai-intake$/, { timeout: 10000 });
    await page.getByTestId("scratchpad-seed-notice").waitFor({ state: "visible" });
    await page.getByText("Scratchpad note loaded with tags: #hvac, #urgent").waitFor({ state: "visible" });
    await expectValueContains(
      page.locator("#ai-intake-input"),
      "Installed replacement filter and checked pressure."
    );
  } finally {
    await context.close();
  }
});

test("daily scratchpad transcribes a voice note into the note editor", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/transcribe-audio", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceType: "audio",
          extractedText: "Installed replacement filter and checked pressure."
        })
      });
    });

    await openDailyScratchpad(page);
    await page.getByRole("button", { name: "Add voice note" }).click();
    await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({
      name: "voice-note.webm",
      mimeType: "audio/webm",
      buffer: Buffer.from("fake-audio")
    });

    await page
      .getByText("Added transcript from voice-note.webm. Review it, then save the note.")
      .waitFor({ state: "visible" });
    await expectValueContains(
      scratchpadNoteEditor(page),
      "Installed replacement filter and checked pressure."
    );
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByText("Saved to today's scratchpad.").waitFor({ state: "visible" });
    await page.getByText("voice-note.webm").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("daily scratchpad tags notes and filters by tag", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openDailyScratchpad(page);

    await scratchpadNoteEditor(page).fill("Installed replacement filter and checked pressure.");
    await page
      .getByPlaceholder("Tags, comma separated: client, job, materials")
      .fill("plumbing, urgent");
    await page.getByRole("button", { name: "Save note" }).click();

    await scratchpadNoteEditor(page).fill("Replaced outlet cover and verified power.");
    await page
      .getByPlaceholder("Tags, comma separated: client, job, materials")
      .fill("electrical");
    await page.getByRole("button", { name: "Save note" }).click();

    await page.getByRole("button", { name: "#electrical" }).first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "#plumbing" }).first().waitFor({ state: "visible" });

    await page.getByRole("button", { name: "#plumbing" }).first().click();
    await page.getByText("Installed replacement filter and checked pressure.").waitFor({ state: "visible" });
    await page.getByText("Replaced outlet cover and verified power.").waitFor({ state: "hidden" });
    await page.getByText("1 shown of 2 saved notes").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("core mobile routes do not create horizontal page overflow", async () => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3
  });
  const page = await context.newPage();
  const routes = ["/", "/ai-intake", "/manual", "/scratchpad", "/import", "/invoices", "/privacy", "/help", "/support", "/feedback"];

  try {
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      await page.locator("#root").waitFor({ state: "visible" });

      const overflow = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      }));

      assert.ok(
        overflow.documentScrollWidth <= overflow.innerWidth + 1,
        `${route} creates horizontal document overflow: ${JSON.stringify(overflow)}`
      );
      assert.ok(
        overflow.bodyScrollWidth <= overflow.innerWidth + 1,
        `${route} creates horizontal body overflow: ${JSON.stringify(overflow)}`
      );
    }
  } finally {
    await context.close();
  }
});

test("core mobile app routes keep controls thumb friendly", async () => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3
  });
  const page = await context.newPage();
  const routes = ["/", "/ai-intake", "/manual", "/scratchpad", "/import", "/invoices"];

  try {
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      await page.locator("#root").waitFor({ state: "visible" });

      const crampedTargets = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button, a"))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);
            const text = (element.textContent || element.getAttribute("aria-label") || "")
              .replace(/\s+/g, " ")
              .trim();
            return {
              text,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              visible:
                rect.width > 0 &&
                rect.height > 0 &&
                styles.display !== "none" &&
                styles.visibility !== "hidden"
            };
          })
          .filter(
            (target) =>
              target.visible &&
              target.text.length > 0 &&
              target.width < 120 &&
              target.height < 34
          )
      );

      assert.deepEqual(crampedTargets, [], `${route} has cramped controls`);
    }
  } finally {
    await context.close();
  }
});

test("voice-note upload appends transcript into intake notes before build", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/transcribe-audio", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceType: "audio",
          extractedText: "Feb 12 repaired ridge vent, 1.5 hours at $110/hr."
        })
      });
    });

    await openIntake(page);
    await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({
      name: "voice-note.webm",
      mimeType: "audio/webm",
      buffer: Buffer.from("fake-audio")
    });

    await page
      .getByText("Added transcript from voice-note.webm. Review it, then build the invoice.")
      .waitFor({ state: "visible" });
    await expectValueContains(
      page.getByPlaceholder(/Example: Jan 10 fixed sink/i),
      "Feb 12 repaired ridge vent, 1.5 hours at $110/hr."
    );
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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

    await getPrimaryIntakeStickyButton(page, "Generate Invoice").waitFor({ state: "visible" });
    await page.getByText("Wording only. Numbers stay locked.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Refine wording" }).waitFor({ state: "visible" });
    await getIntakeButtonOutsideNextUp(page, "Ask Billie").waitFor({ state: "visible" });

    await getIntakeButtonOutsideNextUp(page, "Show review details").click();
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
    await getIntakeButtonOutsideNextUp(page, "Show review details").click();
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
    await getIntakeButtonOutsideNextUp(page, "Show review details").click();
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
    await getPrimaryIntakeBuildButton(page).click();

    await getIntakeButtonOutsideNextUp(page, "Show review details").click();
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
    await getPrimaryIntakeBuildButton(page).click();

    await getIntakeButtonOutsideNextUp(page, "Show review details").click();
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
    await getPrimaryIntakeBuildButton(page).click();

    await getPrimaryIntakeStickyButton(page, "Generate Invoice").waitFor({ state: "visible" });
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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

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
    await getPrimaryIntakeBuildButton(page).click();

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
    await page.getByRole("heading", { name: "Upload old invoice files or photo notes" }).waitFor({
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
    await page.getByRole("button", { name: "Preview line items" }).click();
    await page.getByText("Likely line items", { exact: true }).last().waitFor({ state: "visible" });
    await page.getByText("Faucet repair", { exact: true }).last().waitFor({ state: "visible" });
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
    await page.getByRole("button", { name: "Open Billie review" }).click();

    await page.waitForURL(/\/manual\?tab=assistant&source=import$/, { timeout: 10000 });
    await page.getByTestId("manual-import-cleanup-card").waitFor({ state: "visible" });
    await page.getByText("notes.txt").waitFor({ state: "visible" });
    await page.getByText(/Jan 30 faucet repair, 2 hours at \$80\/hr for Mike Johnson\./).waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Use source text in Billie" }).click();
    await page.getByText("Billie loaded the imported source text for cleanup.").waitFor({ state: "visible" });
    const storedInstruction = await page.evaluate(() => {
      const match = Object.keys(window.localStorage).find((key) => key.includes("billieWorkspaceInstruction"));
      return match ? window.localStorage.getItem(match) : "";
    });
    assert.match(String(storedInstruction || ""), /Jan 30 faucet repair/);
  } finally {
    await context.close();
  }
});

test("manual import cleanup card seeds Billie from stored import source text", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "invoiceDraft",
      JSON.stringify({
        invoiceNumber: "INV-IMPORT-SEED-1",
        invoiceDate: "2026-03-10",
        fromDetails: "Acme Plumbing",
        billToDetails: "Mike Johnson",
        notes: "Imported draft notes.",
        taxRate: "0",
        lineItems: [{ id: "line-1", description: "Faucet repair", qty: "2", rate: "80" }],
        importSourceFileName: "notes.txt",
        importSourceText: "Jan 30 faucet repair, 2 hours at $80/hr for Mike Johnson."
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual?tab=assistant&source=import`, { waitUntil: "networkidle" });
    await page.getByTestId("manual-import-cleanup-card").waitFor({ state: "visible" });
    await page.getByText("notes.txt").waitFor({ state: "visible" });
    await page.getByText(/Jan 30 faucet repair, 2 hours at \$80\/hr for Mike Johnson\./).waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Use source text in Billie" }).click();
    await page.getByText("Billie loaded the imported source text for cleanup.").waitFor({ state: "visible" });
    const storedInstruction = await page.evaluate(() => {
      const match = Object.keys(window.localStorage).find((key) => key.includes("billieWorkspaceInstruction"));
      return match ? window.localStorage.getItem(match) : "";
    });
    assert.match(String(storedInstruction || ""), /Jan 30 faucet repair/);
  } finally {
    await context.close();
  }
});

test("daily scratchpad groups notes by day and converts selected notes into one draft", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openDailyScratchpad(page);

    await page.getByRole("button", { name: "Record voice memo" }).waitFor({ state: "visible" });

    await scratchpadNoteEditor(page).fill("Installed replacement filter.");
    await page.getByRole("button", { name: "Save note" }).click();
    await scratchpadNoteEditor(page).fill("Checked pressure and left the system running.");
    await page.getByRole("button", { name: "Save note" }).click();

    await page.getByText("Today").first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Select all shown" }).click();
    await page.getByText("2 selected notes ready to convert").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use selected in invoice" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Thank you for your business"), "Installed replacement filter.");
    await expectValueContains(
      page.getByPlaceholder("Thank you for your business"),
      "Checked pressure and left the system running."
    );
  } finally {
    await context.close();
  }
});

test("daily scratchpad can convert a whole session directly into Billie intake", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openDailyScratchpad(page);

    await scratchpadNoteEditor(page).fill("Installed replacement filter.");
    await page.getByRole("button", { name: "Save note" }).click();
    await scratchpadNoteEditor(page).fill("Checked pressure and left the system running.");
    await page.getByRole("button", { name: "Save note" }).click();

    await page.getByRole("button", { name: "Use session in invoice" }).first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open session with Billie" }).first().click();
    await page.waitForURL(/\/ai-intake$/, { timeout: 10000 });
    await page.getByTestId("scratchpad-seed-notice").waitFor({ state: "visible" });
    await expectValueContains(
      page.locator("#ai-intake-input"),
      "Installed replacement filter.\n\nChecked pressure and left the system running."
    );
  } finally {
    await context.close();
  }
});

test("import cleanup studio surfaces seeded source context in intake", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "invoiceImportSeed",
      JSON.stringify({
        fileName: "legacy-notes.txt",
        notes: "Client said to keep the wording simple.",
        sourceText:
          "Legacy invoice: Jan 30 faucet repair, 2 hours at $80/hr for Mike Johnson. Cabinet adjustment maybe charge.",
        payload: {
          needsFollowUp: false,
          followUp: null,
          structuredInvoice: {
            customerName: "Mike Johnson",
            workSessions: [
              {
                date: "Jan 30",
                tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
              }
            ],
            materials: []
          },
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
          },
          openDecisions: [
            {
              kind: "billing",
              prompt: "Bill cabinet adjustment?",
              sourceSnippet: "Cabinet adjustment maybe charge."
            }
          ],
          assumptions: ["Assumed faucet repair was labor."],
          unparsedLines: ["Cabinet adjustment maybe charge."],
          qualityGate: { blockerCount: 1 },
          auditStatus: null
        }
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
    const studio = page.getByTestId("import-cleanup-studio");
    await studio.waitFor({ state: "visible" });
    await studio.getByText("legacy-notes.txt", { exact: true }).waitFor({ state: "visible" });
    await studio.getByRole("listitem").filter({ hasText: "1 decision pending" }).waitFor({ state: "visible" });
    await studio.getByRole("listitem").filter({ hasText: "1 uncaptured line" }).waitFor({ state: "visible" });
    await studio.getByRole("listitem").filter({ hasText: "1 quality blocker" }).waitFor({ state: "visible" });
    await studio.getByText("Captured context").waitFor({ state: "visible" });
    await studio.getByText("Still needs cleanup").waitFor({ state: "visible" });
    await studio.getByText("Source sessions").waitFor({ state: "visible" });
    await studio.getByText("Draft line items").waitFor({ state: "visible" });
    await studio.getByRole("button", { name: "Use source in chat" }).click();
    await expectValueContains(
      page.locator("#ai-intake-input"),
      "Legacy invoice: Jan 30 faucet repair, 2 hours at $80/hr for Mike Johnson."
    );
    await studio.getByRole("button", { name: "Use compare in chat" }).click();
    await expectValueContains(page.locator("#ai-intake-input"), "Source sessions:");
  } finally {
    await context.close();
  }
});

test("import cleanup studio can use uncaptured lines in chat", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-import-studio-unparsed-owner");
    window.localStorage.setItem(
      "invoiceImportSeed::owner:ui-import-studio-unparsed-owner",
      JSON.stringify({
        fileName: "legacy-estimate.txt",
        notes: "Imported estimate with a missed deposit line.",
        sourceText: "Deposit 50% upfront. Remaining on completion.",
        payload: {
          needsFollowUp: true,
          followUp: {
            question: "What amount should the deposit be?",
            kind: "labor_pricing"
          },
          structuredInvoice: {
            customerName: "Legacy Client",
            workSessions: [],
            materials: []
          },
          openDecisions: [],
          assumptions: [],
          unparsedLines: ["Deposit 50% upfront."],
          qualityGate: { blockerCount: 1 },
          auditStatus: null
        }
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
    const studio = page.getByTestId("import-cleanup-studio");
    await studio.waitFor({ state: "visible" });
    await studio.getByText("Deposit 50% upfront.", { exact: true }).waitFor({ state: "visible" });
    await studio.getByRole("button", { name: "Use uncaptured lines" }).click();
    await expectValueContains(
      page.locator("#ai-intake-input"),
      "Use these uncaptured imported lines to finish the cleanup"
    );
  } finally {
    await context.close();
  }
});

test("import cleanup studio can use unresolved decisions in chat", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-import-studio-decisions-owner");
    window.localStorage.setItem(
      "invoiceImportSeed::owner:ui-import-studio-decisions-owner",
      JSON.stringify({
        fileName: "legacy-decision-notes.txt",
        notes: "Imported job with two unresolved billing choices.",
        sourceText: "Charge travel time? Add disposal fee?",
        payload: {
          needsFollowUp: false,
          structuredInvoice: {
            customerName: "Legacy Client",
            workSessions: [],
            materials: []
          },
          openDecisions: [
            {
              kind: "billing",
              prompt: "Should travel time be billed separately?",
              sourceSnippet: "Travel time maybe charge separately."
            },
            {
              kind: "materials",
              prompt: "Should disposal be added as a separate fee?",
              sourceSnippet: "Disposal maybe separate."
            }
          ],
          assumptions: [],
          unparsedLines: [],
          qualityGate: { blockerCount: 0 },
          auditStatus: null
        }
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
    const studio = page.getByTestId("import-cleanup-studio");
    await studio.waitFor({ state: "visible" });
    await studio
      .getByText("Should travel time be billed separately?", { exact: true })
      .waitFor({ state: "visible" });
    await studio.getByRole("button", { name: "Use decisions in chat" }).click();
    await expectValueContains(
      page.locator("#ai-intake-input"),
      "Use these unresolved imported decisions to finish the cleanup"
    );
    await expectValueContains(page.locator("#ai-intake-input"), "Should travel time be billed separately?");
  } finally {
    await context.close();
  }
});

test("import cleanup studio can use assumptions and blockers in chat", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-import-studio-assumptions-owner");
    window.localStorage.setItem(
      "invoiceImportSeed::owner:ui-import-studio-assumptions-owner",
      JSON.stringify({
        fileName: "legacy-blocked-import.txt",
        notes: "Imported job with assumptions and blocker warnings.",
        sourceText: "Assume labor is for plumbing. Missing disposal fee detail.",
        payload: {
          needsFollowUp: false,
          structuredInvoice: {
            customerName: "Legacy Assumption Client",
            workSessions: [],
            materials: []
          },
          openDecisions: [],
          assumptions: ["Assumed plumbing labor was the main service."],
          unparsedLines: [],
          qualityGate: {
            blockerCount: 1,
            blockers: [{ code: "missing_fee", message: "Missing disposal fee detail." }]
          },
          auditStatus: null
        }
      })
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
    const studio = page.getByTestId("import-cleanup-studio");
    await studio.waitFor({ state: "visible" });
    await studio.getByRole("button", { name: "Use assumptions in chat" }).click();
    await expectValueContains(
      page.locator("#ai-intake-input"),
      "Use these imported assumptions to double-check the cleanup"
    );
    await studio.getByRole("button", { name: "Use blockers in chat" }).click();
    await expectValueContains(
      page.locator("#ai-intake-input"),
      "Use these quality blockers to finish the import cleanup"
    );
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

test("import screen shows billing completion notice and clears billing query param", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/import?billing=success`, { waitUntil: "networkidle" });
    await page
      .getByText("Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription.")
      .waitFor({ state: "visible" });
    await waitForCondition(() => !new URL(page.url()).searchParams.has("billing"), {
      timeoutMs: 2000,
      message: "Billing query param should be removed after import notice renders."
    });
  } finally {
    await context.close();
  }
});

test("import screen shows stripe upgrade button when checkout is configured", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_PRICE_ID = "price_test_placeholder";

  await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: { workSessions: [], materials: [] },
      finishedInvoice: {
        invoiceNumber: "INV-IMPORT-UPGRADE-1",
        issueDate: "2026-03-11",
        customerName: "Import Upgrade Client",
        currency: "USD",
        lineItems: [{ description: "Existing", quantity: 1, unitPrice: 10, amount: 10 }],
        notes: "",
        subtotal: 10,
        total: 10,
        balanceDue: 10
      }
    }
  });

  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "local-default");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
    await page.getByText("Free plan · 1/1 saved this month (limit reached)").waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Upgrade plan" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("link", { name: "Upgrade plan" }).count(), 0);
  } finally {
    await context.close();
  }
});

test("manual editor polishes line item wording on blur", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const description = page.locator('input[placeholder="Description"]:visible').first();
    await description.fill("fixed sink");
    await description.press("Tab");

    await page.waitForFunction(() => {
      const inputs = Array.from(document.querySelectorAll('input[placeholder="Description"]'));
      return inputs.some((input) => {
        if (!(input instanceof HTMLInputElement)) {
          return false;
        }
        const rect = input.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && input.value === "Sink repair";
      });
    });
  } finally {
    await context.close();
  }
});

test("manual editor time capture adds a billable line item", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    let now = 1_700_000_000_000;
    (window as Window & { __setNow?: (value: number) => void }).__setNow = (value: number) => {
      now = value;
    };
    Date.now = () => now;
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByLabel("Time note").fill("Site visit");
    await page.getByLabel("Time rate").fill("95");
    await page.getByRole("button", { name: "Start timer" }).click();
    await page.evaluate(() => {
      const api = window as Window & { __setNow?: (value: number) => void };
      api.__setNow?.(Date.now() + 90 * 60 * 1000);
    });
    await page.getByRole("button", { name: "Stop & add line item" }).click();

    const firstDescription = page.locator('tbody tr').first().getByPlaceholder("Description");
    await expectValueEquals(firstDescription, "Site visit");
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('tbody tr input[placeholder="0"]')).some(
        (input) => input instanceof HTMLInputElement && input.value === "1.5"
      )
    );
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('tbody tr input[placeholder="$0"]')).some(
        (input) => input instanceof HTMLInputElement && input.value === "95"
      )
    );
  } finally {
    await context.close();
  }
});

test("manual editor uses touch-friendly line item cards on narrow phones", async () => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const descriptionInput = page.locator('input[placeholder="Description"]:visible').first();
    const qtyInput = page.locator('input[placeholder="0"]:visible').nth(1);
    const rateInput = page.locator('input[placeholder="$0"]:visible').first();

    await descriptionInput.waitFor({ state: "visible" });
    await page.getByText("Line 1").waitFor({ state: "visible" });

    const [descriptionBox, qtyBox, rateBox] = await Promise.all([
      descriptionInput.boundingBox(),
      qtyInput.boundingBox(),
      rateInput.boundingBox()
    ]);

    assert.ok(
      descriptionBox && descriptionBox.width >= 220,
      `Description input is cramped: ${JSON.stringify(descriptionBox)}`
    );
    assert.ok(qtyBox && qtyBox.width >= 120, `Quantity input is cramped: ${JSON.stringify(qtyBox)}`);
    assert.ok(rateBox && rateBox.width >= 120, `Rate input is cramped: ${JSON.stringify(rateBox)}`);
  } finally {
    await context.close();
  }
});

test("manual editor surfaces repeat-client memory without changing money until reuse", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-client-memory-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Quarterly drain maintenance",
          qty: "2",
          rate: "120",
          clientName: "Casey Client",
          usageCount: 4,
          updatedAt: "2026-04-01T12:00:00.000Z"
        },
        {
          description: "Generic faucet repair",
          qty: "1",
          rate: "95",
          clientName: "Other Client",
          usageCount: 8,
          updatedAt: "2026-04-02T12:00:00.000Z"
        }
      ])
    );
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Casey Client\n123 Main St");

    await page.getByText("Past work for Casey Client").waitFor({ state: "visible" });
    await page.getByText("Money never changes automatically.").waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "Reuse Quarterly drain maintenance from client memory" })
      .waitFor({ state: "visible" });
    await page.getByText("Rate $120 / Used 4 times").waitFor({ state: "visible" });
    const firstRow = page.locator("tbody tr").first();
    await expectValueEquals(firstRow.getByPlaceholder("Description", { exact: true }), "");
    await expectValueEquals(firstRow.getByPlaceholder("0", { exact: true }), "");
    await expectValueEquals(firstRow.getByPlaceholder("$0", { exact: true }), "");

    await page
      .getByRole("button", { name: "Reuse Quarterly drain maintenance from client memory" })
      .click();

    await expectValueEquals(
      firstRow.getByPlaceholder("Description", { exact: true }),
      "Quarterly drain maintenance"
    );
    await expectValueEquals(firstRow.getByPlaceholder("0", { exact: true }), "2");
    await expectValueEquals(firstRow.getByPlaceholder("$0", { exact: true }), "120");
  } finally {
    await context.close();
  }
});

test("manual editor can quick fill repeat client setup from memory", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-repeat-quick-fill-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Casey Client",
          details: "Casey Client\n123 Main St",
          defaultNotes: "Monthly maintenance visit. Payment due on receipt.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Quarterly drain maintenance",
          qty: "2",
          rate: "120",
          clientName: "Casey Client",
          usageCount: 4,
          updatedAt: "2026-04-21T12:00:00.000Z"
        }
      ])
    );
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Casey");

    await page.getByText("Quick fill from memory").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Quick fill repeat setup for Casey Client" }).click();

    await expectValueContains(page.getByPlaceholder("Client Name"), "Casey Client");
    const firstRow = page.locator("tbody tr").first();
    await expectValueEquals(
      firstRow.getByPlaceholder("Description", { exact: true }),
      "Quarterly drain maintenance"
    );
    await expectValueEquals(firstRow.getByPlaceholder("0", { exact: true }), "2");
    await expectValueEquals(firstRow.getByPlaceholder("$0", { exact: true }), "120");
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Monthly maintenance visit. Payment due on receipt."
    );
  } finally {
    await context.close();
  }
});

test("manual editor offers prior client notes without auto-filling them", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-client-note-memory-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Note Memory Client",
          details: "Note Memory Client",
          defaultNotes: "Payment due on receipt. Thanks for trusting us with the work.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Note Memory Client");

    await page.getByTestId("manual-note-suggestions-card").waitFor({ state: "visible" });
    await page.getByText("Repeat-work notes").waitFor({ state: "visible" });
    await page.getByText("Saved in client memory").waitFor({ state: "visible" });
    await page.getByText("Saved client note", { exact: true }).waitFor({ state: "visible" });
    await page
      .getByText("Payment due on receipt. Thanks for trusting us with the work.")
      .waitFor({ state: "visible" });
    await expectValueEquals(page.getByPlaceholder("Thank you for your business"), "");

    await page.getByRole("button", { name: "Use saved client note" }).click();
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Payment due on receipt. Thanks for trusting us with the work."
    );
  } finally {
    await context.close();
  }
});

test("manual editor surfaces recent invoice note suggestions alongside saved client notes", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-manual-recent-note-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Repeat Note Client",
          details: "Repeat Note Client",
          defaultNotes: "Payment due on receipt.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });

  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/recent-context?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matches: [
            {
              invoiceId: "prior-204",
              invoiceNumber: "INV-204",
              notes: "Please reference the April site walkthrough when sending payment."
            }
          ]
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Repeat Note Client");

    await page.getByTestId("manual-note-suggestions-card").waitFor({ state: "visible" });
    await page.getByText("Saved in client memory").waitFor({ state: "visible" });
    await page.getByText("Recent invoice INV-204").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use note from INV-204" }).click();

    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Please reference the April site walkthrough when sending payment."
    );
    await expectAttributeEquals(
      page.getByTestId("manual-notes-section"),
      "data-billie-highlight",
      "true"
    );
  } finally {
    await context.close();
  }
});

test("manual editor can append a suggested note into existing notes", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-manual-append-note-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Append Note Client",
          details: "Append Note Client",
          defaultNotes: "Payment due on receipt.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });

  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/recent-context?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matches: [
            {
              invoiceId: "prior-206",
              invoiceNumber: "INV-206",
              notes: "Please include the gate code on arrival."
            }
          ]
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Append Note Client");
    const notesInput = page.getByPlaceholder("Thank you for your business");
    await notesInput.fill("Customer prefers text updates.");

    await page
      .getByTestId("manual-append-note-suggestion-recent-note-prior-206")
      .click();
    await expectValueEquals(
      notesInput,
      "Customer prefers text updates.\n\nPlease include the gate code on arrival."
    );
  } finally {
    await context.close();
  }
});

test("manual editor append upgrades structured payment-term notes instead of duplicating them", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-manual-structured-append-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
  });

  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/recent-context?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matches: [
            {
              invoiceId: "prior-208",
              invoiceNumber: "INV-208",
              notes: "Payment due on receipt."
            }
          ]
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Structured Append Client");
    const notesInput = page.getByPlaceholder("Thank you for your business");
    await notesInput.fill("Payment due within 14 days.\nCustomer prefers text updates.");

    await page
      .getByTestId("manual-append-note-suggestion-recent-note-prior-208")
      .click();
    await expectValueEquals(
      notesInput,
      "Customer prefers text updates.\nPayment due on receipt."
    );
  } finally {
    await context.close();
  }
});

test("manual editor applies quick payment terms without duplicating old terms", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const notesInput = page.getByPlaceholder("Thank you for your business");
    await page.locator('input[type="date"]').nth(0).fill("2026-04-01");
    await notesInput.fill("Warranty covers workmanship for 30 days.");

    await page.getByRole("button", { name: "Net 14" }).click();
    await expectValueEquals(
      notesInput,
      "Payment due within 14 days.\nWarranty covers workmanship for 30 days."
    );
    await expectValueEquals(page.getByLabel("Due date"), "2026-04-15");

    await page.getByRole("button", { name: "Net 30" }).click();
    await expectValueEquals(
      notesInput,
      "Payment due within 30 days.\nWarranty covers workmanship for 30 days."
    );
    await expectValueEquals(page.getByLabel("Due date"), "2026-05-01");
    await page.getByText("Net 30 terms applied").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor transcribes a voice note into invoice notes", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/transcribe-audio", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceType: "audio",
          extractedText: "Installed replacement filter and checked pressure."
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add voice note" }).click();
    await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({
      name: "voice-note.webm",
      mimeType: "audio/webm",
      buffer: Buffer.from("fake-audio")
    });

    await page
      .getByText("Added transcript from voice-note.webm. Review it, then save the invoice.")
      .waitFor({ state: "visible" });
    await expectValueContains(
      page.getByPlaceholder("Thank you for your business"),
      "Installed replacement filter and checked pressure."
    );
  } finally {
    await context.close();
  }
});

test("manual editor captures a receipt photo into invoice notes", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/extract-notes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceType: "image",
          extractedText: "Staples receipt total $42.18 for printer paper."
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add receipt" }).click();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fake-image")
    });

    await page
      .getByText("Added receipt from receipt.jpg. Review it, then save the invoice.")
      .waitFor({ state: "visible" });
    await expectValueContains(
      page.getByPlaceholder("Thank you for your business"),
      "Staples receipt total $42.18 for printer paper."
    );
  } finally {
    await context.close();
  }
});

test("manual editor applies deposit and milestone note templates without duplicating old schedule text", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const notesInput = page.getByPlaceholder("Thank you for your business");
    await notesInput.fill("Project kickoff scheduled.");

    await page.getByRole("button", { name: "50% deposit" }).click();
    await expectValueEquals(
      notesInput,
      "Deposit: 50% due before work begins.\nBalance due on completion.\nProject kickoff scheduled."
    );
    await page.getByText("50% deposit applied").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Milestone plan" }).click();
    await expectValueEquals(
      notesInput,
      "Payment schedule:\n- Milestone 1 due to begin\n- Milestone 2 due at midpoint\n- Balance due on completion.\nProject kickoff scheduled."
    );
    await page.getByText("Milestone plan applied").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor applies retainer note templates without duplicating old schedule text", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const notesInput = page.getByPlaceholder("Thank you for your business");
    await notesInput.fill("Callouts billed separately.");

    await page.getByRole("button", { name: "Monthly retainer" }).click();
    await expectValueEquals(
      notesInput,
      "Retainer: Monthly service plan billed on the first business day of each month.\nCallouts billed separately."
    );
    await page.getByText("Monthly retainer applied").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "On-call support" }).click();
    await expectValueEquals(
      notesInput,
      "Retainer: On-call support plan billed as a recurring monthly service.\nCallouts billed separately."
    );
    await page.getByText("On-call support applied").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor applies trade templates without duplicating old template text", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const notesInput = page.getByPlaceholder("Thank you for your business");
    await notesInput.fill("Customer supplied materials excluded.");

    await page.getByRole("button", { name: "Plumbing" }).click();
    await expectValueEquals(
      notesInput,
      "Trade template: Plumbing\nPlumbing scope: inspection, repair, fixture replacement, cleanup.\nCustomer supplied materials excluded."
    );
    await expectValueEquals(
      page.locator('input[placeholder="Description"]:visible').first(),
      "Plumbing service"
    );
    await page.getByText("Plumbing template applied").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Cleaning" }).click();
    await expectValueEquals(
      notesInput,
      "Trade template: Cleaning\nCleaning scope: rooms, surfaces, supplies, and final cleanup.\nCustomer supplied materials excluded."
    );
    await expectValueEquals(
      page.locator('input[placeholder="Description"]:visible').first(),
      "Plumbing service"
    );
    await page.getByText("Cleaning template applied").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor inserts saved client details from known-client memory", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-known-client-memory-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Known Client",
          details: "Known Client\n42 Service Road",
          recipientEmail: "ap@known-client.example",
          defaultNotes: "Payment due on receipt.",
          recurringIntervalDays: 14,
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByText("Repeat client matches").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use saved client Known Client" }).waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Use saved client Known Client" }).click();
    await expectValueEquals(page.getByPlaceholder("Client Name"), "Known Client\n42 Service Road");
  } finally {
    await context.close();
  }
});

test("manual editor ranks exact repeat-client matches ahead of looser suggestions", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-ranked-client-memory-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Known Client West",
          details: "Known Client West\n72 Harbor Road",
          recipientEmail: "west@example.com",
          defaultNotes: "Thanks for your continued business.",
          updatedAt: "2026-04-21T12:00:00.000Z"
        },
        {
          name: "Known Client",
          details: "Known Client\n42 Service Road",
          recipientEmail: "ap@known-client.example",
          defaultNotes: "Payment due on receipt.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Known Client");

    await page.getByText("Repeat client matches").waitFor({ state: "visible" });
    const suggestionButtons = page.locator(
      'button[aria-label="Use saved client Known Client"], button[aria-label="Use saved client Known Client West"]'
    );
    await assert.equal(await suggestionButtons.count(), 2);
    await assert.equal(await suggestionButtons.first().getAttribute("aria-label"), "Use saved client Known Client");
    await assert.equal(
      await suggestionButtons.nth(1).getAttribute("aria-label"),
      "Use saved client Known Client West"
    );
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
    await page.getByRole("button", { name: "Tone" }).last().click();
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("100");
    await page.getByRole("button", { name: "Edit with Billie" }).last().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Apply a $25 discount.");
    await page.getByRole("button", { name: "Draft edit" }).click();

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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("fixed sink");
    await page.getByPlaceholder("Thank you for your business").fill("Leave check at the front desk.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    await page.getByRole("button", { name: "Formal descriptions" }).click();

    await page
      .getByText("Descriptions updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Kitchen faucet repair service");
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page.getByText("Undid last Billie change.").first().waitFor({ state: "visible" });
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Sink repair");
    await page.getByRole("button", { name: "Stronger wording" }).click();
    await page
      .getByText("Descriptions updated. Numbers unchanged.")
      .first()
      .waitFor({ state: "visible" });
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Kitchen faucet repair service");
    assert.equal(rewordDescriptionsRequestCount, 2);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie workspace quick actions can refine descriptions without opening a separate chat flow", async () => {
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
    await page.route("**/api/invoices/reword-descriptions", async (route) => {
      rewordDescriptionsRequestCount += 1;
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            ...body.invoice,
            lineItems: body.invoice.lineItems.map((lineItem: Record<string, unknown>, index: number) =>
              index === 0
                ? {
                    ...lineItem,
                    description: "Kitchen faucet repair service"
                  }
                : lineItem
            )
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("fixed sink");

    const workspace = page.locator('[data-testid="manual-billie-workspace"]');
    await workspace.waitFor({ state: "visible" });
    await workspace.getByRole("button", { name: "Formal descriptions" }).click();

    await workspace.getByText("Descriptions updated. Numbers unchanged.").waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="manual-line-item-line-1"]:not([hidden])')
          ?.getAttribute("data-billie-highlight") === "true"
    );
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Kitchen faucet repair service");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="manual-line-item-line-1"]:not([hidden])')
          ?.getAttribute("data-billie-highlight") === "false"
    );
    assert.equal(rewordDescriptionsRequestCount, 1);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie workspace freeform composer submits safe instructions and clears after apply", async () => {
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
    await page.route("**/api/invoices/reword-descriptions", async (route) => {
      rewordDescriptionsRequestCount += 1;
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoice: {
            ...body.invoice,
            lineItems: body.invoice.lineItems.map((lineItem: Record<string, unknown>, index: number) =>
              index === 0
                ? {
                    ...lineItem,
                    description: "Roof leak repair service"
                  }
                : lineItem
            )
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("fixed roof leak");

    const workspace = page.locator('[data-testid="manual-billie-workspace"]');
    const composer = workspace.getByPlaceholder(/Ask Billie to refine wording/i);
    await composer.fill("Make the descriptions more formal.");
    await workspace.getByRole("button", { name: "Ask Billie" }).click();

    await workspace.getByText("Descriptions updated. Numbers unchanged.").waitFor({ state: "visible" });
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Roof leak repair service");
    await expectValueEquals(composer, "");
    assert.equal(rewordDescriptionsRequestCount, 1);
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual billie workspace keeps composer text after a refresh", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("fixed roof leak");

    const workspace = page.locator('[data-testid="manual-billie-workspace"]');
    const composer = workspace.getByPlaceholder(/Ask Billie to refine wording/i);
    await composer.fill("Make the descriptions more formal.");

    await page.reload({ waitUntil: "networkidle" });

    const refreshedWorkspace = page.locator('[data-testid="manual-billie-workspace"]');
    const refreshedComposer = refreshedWorkspace.getByPlaceholder(/Ask Billie to refine wording/i);
    await expectValueEquals(refreshedComposer, "Make the descriptions more formal.");
  } finally {
    await context.close();
  }
});

test("manual billie next moves guide the draft from save into payment setup", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Billie Next Client");
    await page.locator('input[placeholder="Description"]:visible').first().fill("Fence repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("120");

    const nextMoves = page.getByTestId("manual-billie-next-moves");
    await nextMoves.waitFor({ state: "visible" });
    await nextMoves.getByText("Save this draft").waitFor({ state: "visible" });
    await nextMoves.getByText("Save this service to memory").waitFor({ state: "visible" });
    await nextMoves.getByRole("button", { name: "Save draft" }).click();

    await page.getByText("Saved").waitFor({ state: "visible" });
    await nextMoves.getByText("Add a payment link").waitFor({ state: "visible" });
    await nextMoves.getByText("Create the client portal").waitFor({ state: "visible" });
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("fixed sink");
    await page.getByPlaceholder("Thank you for your business").fill("Thanks.");
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    await page.getByRole("button", { name: "Refine line 1" }).click();
    await page.getByText("Line 1 updated. Numbers unchanged.").waitFor({ state: "visible" });
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Kitchen faucet repair service");

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
    await page.locator('input[placeholder="Description"]:visible').first().fill("fixed sink");
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
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Kitchen faucet repair service");
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
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
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="manual-notes-section"]')
          ?.getAttribute("data-billie-highlight") === "true"
    );
    await page.getByTestId("manual-workspace-change-summary").getByText("Latest: notes updated").waitFor({
      state: "visible"
    });
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Payment due within 14 days of receipt."
    );
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Faucet repair");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="manual-notes-section"]')
          ?.getAttribute("data-billie-highlight") === "false"
    );
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("fixed sink");
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
    await expectValueEquals(page.locator('input[placeholder="Description"]:visible').first(), "Kitchen faucet repair service");
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
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

test("manual layout studio recipes apply grouped style controls quickly", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByText("Layout Studio Lite").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Premium handoff" }).click();

    await page.locator("[data-header-layout='centered']").first().waitFor({ state: "visible" });
    await page.locator("[data-spacing-density='airy']").first().waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Bold template") &&
        document.body.innerText.includes("Centered header") &&
        document.body.innerText.includes("Airy spacing"),
      undefined,
      { timeout: 10000 }
    );
  } finally {
    await context.close();
  }
});

test("manual layout studio can reset back to classic send-ready", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Premium handoff" }).click();
    await page.locator("[data-header-layout='centered']").first().waitFor({ state: "visible" });
    await page.locator("[data-spacing-density='airy']").first().waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Reset to classic" }).click();

    await page.locator("[data-header-layout='split']").first().waitFor({ state: "visible" });
    await page.locator("[data-spacing-density='balanced']").first().waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Classic template") &&
        document.body.innerText.includes("Split header") &&
        document.body.innerText.includes("Standard spacing"),
      undefined,
      { timeout: 10000 }
    );
  } finally {
    await context.close();
  }
});

test("manual layout studio can save and reapply a favorite look", async () => {
  const ownerId = "ui-layout-studio-favorite-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Premium handoff" }).click();
    await page.getByRole("button", { name: "Save current look" }).click();
    await page.getByText("Saved this invoice look as your favorite layout.").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Classic send-ready" }).click();
    await page.locator("[data-header-layout='split']").first().waitFor({ state: "visible" });
    await page.locator("[data-spacing-density='balanced']").first().waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Apply favorite" }).click();
    await page.locator("[data-header-layout='centered']").first().waitFor({ state: "visible" });
    await page.locator("[data-spacing-density='airy']").first().waitFor({ state: "visible" });
    await page.getByText("Applied your saved favorite invoice look.").waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Bold template") &&
        document.body.innerText.includes("Centered header") &&
        document.body.innerText.includes("Airy spacing"),
      undefined,
      { timeout: 10000 }
    );
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
    await page.getByPlaceholder("Thank you for your business").fill("Payment due in 14 days.");
    await page.locator("[data-notes-visible='true']").first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit with Billie" }).first().click();

    const composer = page
      .getByPlaceholder("Example: Use the bold template with a navy accent.")
      .first();
    await composer.fill("Hide the notes on the invoice.");
    await page.getByRole("button", { name: "Draft edit" }).click();

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
    await page.locator("[data-notes-visible='true']").first().waitFor({ state: "visible" });
    assert.equal(editRequestCount, 0);
  } finally {
    await context.close();
  }
});

test("manual invoice can show and hide saved business registrations", async () => {
  const ownerId = "ui-business-registrations-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceBusinessProfile::owner:${initOwnerId}`,
      JSON.stringify({
        fromDetails: "Acme Plumbing\n123 Main St",
        businessRegistrations: [
          {
            id: "reg-1",
            label: "Business number",
            value: "123456789BC0001",
            visible: true,
            countryCode: "CA",
            regionCode: "BC",
            kind: "business",
            system: "ca_bn"
          },
          {
            id: "reg-2",
            label: "GST / HST number",
            value: "123456789RT0001",
            visible: true,
            countryCode: "CA",
            kind: "tax",
            system: "ca_gst_hst"
          }
        ],
        registrationBlockVisible: true
      })
    );
  }, ownerId);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    const section = page.getByTestId("manual-business-registrations-section");
    await section.waitFor({ state: "visible" });
    await section.getByText("Business number: 123456789BC0001").waitFor({ state: "visible" });
    await section.getByText("GST / HST number: 123456789RT0001").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Hide registration block on invoice" }).click();
    await section.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Show registration block on invoice" }).click();
    await section.waitFor({ state: "visible" });
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
    await page.getByRole("button", { name: "Branding" }).click();
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
    await page.getByRole("button", { name: "Branding" }).click();
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
    await getPrimaryIntakeBuildButton(page).click();
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

test("client memory settings lets users inspect and clear remembered clients", async () => {
  const ownerId = "ui-memory-settings-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Trust Client",
          details: "Trust Client\n7 Trust Lane",
          recipientEmail: "billing@trust-client.example",
          defaultNotes: "Payment due on receipt.",
          recurringIntervalDays: 14,
          updatedAt: "2026-04-20T12:00:00.000Z"
        },
        {
          name: "Keep Client",
          details: "Keep Client",
          updatedAt: "2026-04-19T12:00:00.000Z"
        }
      ])
    );
  }, ownerId);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/settings/memory`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/settings\/memory$/, { timeout: 10000 });
    await page.getByRole("heading", { name: "Review and clear repeat-client memory" }).waitFor({ state: "visible" });
    const readiness = page.getByTestId("client-memory-repeat-readiness");
    await readiness.getByText("Repeat readiness").waitFor({ state: "visible" });
    await readiness.getByText("Ready for faster repeat invoices.").waitFor({ state: "visible" });
    await readiness.getByText("Send once from the library to remember the recipient.").waitFor({ state: "visible" });
    await page.getByText("Trust Client", { exact: true }).first().waitFor({ state: "visible" });
    await page.getByText("Show saved details").first().click();
    await page.getByText("billing@trust-client.example").waitFor({ state: "visible" });
    await page.getByText("Payment due on receipt.").waitFor({ state: "visible" });
    await page.getByText("Biweekly", { exact: true }).first().waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Delete remembered client Trust Client" }).click();
    await page.getByText("Trust Client removed from memory.").waitFor({ state: "visible" });

    const afterDelete = await page.evaluate((storageOwnerId) => {
      const raw = window.localStorage.getItem(`invoiceClientMemory::owner:${storageOwnerId}`);
      return raw ? JSON.parse(raw) : [];
    }, ownerId);
    assert.equal(afterDelete.some((entry: { name?: string }) => entry.name === "Trust Client"), false);
    assert.equal(afterDelete.some((entry: { name?: string }) => entry.name === "Keep Client"), true);

    await page.getByRole("button", { name: "Clear all remembered clients" }).click();
    await page.getByRole("button", { name: "Confirm clear all" }).click();
    await page.getByText("No remembered clients yet.").waitFor({ state: "visible" });

    const afterClear = await page.evaluate((storageOwnerId) => {
      const raw = window.localStorage.getItem(`invoiceClientMemory::owner:${storageOwnerId}`);
      return raw ? JSON.parse(raw) : [];
    }, ownerId);
    assert.deepEqual(afterClear, []);
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
    await getPrimaryIntakeBuildButton(page).click();

    const resolveButton = page.getByRole("button", { name: "Resolve decisions" });
    await page.getByText("Free plan limit reached").waitFor({ state: "visible" });
    for (let attempts = 0; attempts < 6; attempts += 1) {
      if (await resolveButton.isVisible().catch(() => false)) {
        const skipButton = page.getByRole("button", { name: "Skip" }).first();
        if (await skipButton.isVisible().catch(() => false)) {
          await skipButton.click();
          continue;
        }
      }
      break;
    }
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

test("launcher plan usage meter keeps remaining text inside on narrow phones", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "25";

  const context = await browser.newContext({
    viewport: { width: 320, height: 640 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-plan-visual-owner");
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByText("25 saves remaining").waitFor({ state: "visible" });

    const usageBounds = await page.locator(".nb-usage-meter").first().evaluate((meter) => {
      const remaining = meter.querySelector(".nb-usage-meter__remaining");
      const label = meter.querySelector(".nb-usage-meter__label");
      if (!remaining || !label) {
        return null;
      }
      const meterRect = meter.getBoundingClientRect();
      const remainingRect = remaining.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        meterLeft: meterRect.left,
        meterRight: meterRect.right,
        meterWidth: meterRect.width,
        meterBottom: meterRect.bottom,
        labelRight: labelRect.right,
        remainingLeft: remainingRect.left,
        remainingRight: remainingRect.right,
        remainingBottom: remainingRect.bottom
      };
    });

    assert.ok(usageBounds, "Expected launcher usage meter to render.");
    assert.ok(
      usageBounds.meterWidth >= 220,
      `Usage meter is too cramped on narrow phones: ${JSON.stringify(usageBounds)}`
    );
    assert.ok(
      usageBounds.remainingRight <= usageBounds.meterRight + 0.5,
      `Remaining label overflows meter horizontally: ${JSON.stringify(usageBounds)}`
    );
    assert.ok(
      usageBounds.remainingBottom <= usageBounds.meterBottom + 0.5,
      `Remaining label overflows meter vertically: ${JSON.stringify(usageBounds)}`
    );
    assert.ok(
      usageBounds.labelRight <= usageBounds.meterRight + 0.5,
      `Progress label overflows meter horizontally: ${JSON.stringify(usageBounds)}`
    );
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

test("ai intake shows billing completion notice and clears billing query param", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/ai-intake?billing=success`, { waitUntil: "networkidle" });
    await page
      .getByText("Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription.")
      .waitFor({ state: "visible" });
    await waitForCondition(() => !new URL(page.url()).searchParams.has("billing"), {
      timeoutMs: 2000,
      message: "Billing query param should be removed after intake notice renders."
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

test("launcher shows invoice command center for drafts and follow-ups", async () => {
  const ownerId = "ui-operations-queue-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveInvoice = async (invoiceNumber: string, total: number) =>
    context.request.post(`${baseUrl}/api/invoices/save`, {
      headers: {
        "x-invoice-user-id": ownerId
      },
      data: {
        confirmSave: true,
        sourceType: "text_input",
        invoiceData: {
          structuredInvoice: {
            customerName: "Operations Client",
            workSessions: [],
            materials: []
          },
          finishedInvoice: {
            invoiceNumber,
            issueDate: "2026-03-12",
            customerName: "Operations Client",
            currency: "USD",
            lineItems: [
              {
                id: `${invoiceNumber}-line`,
                type: "labor",
                description: "Operations queue work",
                quantity: 1,
                unitPrice: total,
                amount: total
              }
            ],
            subtotal: total,
            total,
            balanceDue: total
          }
        }
      }
    });

  const draftResponse = await saveInvoice("INV-OPS-DRAFT", 125);
  assert.equal(draftResponse.status(), 200);
  const draftPayload = await draftResponse.json();
  await mutateStoredInvoice(draftPayload?.invoice?.invoiceId, {
    updatedAt: "2026-04-18T12:00:00.000Z"
  });

  const sentResponse = await saveInvoice("INV-OPS-SENT", 210);
  assert.equal(sentResponse.status(), 200);
  const sentPayload = await sentResponse.json();
  const sendResponse = await context.request.post(
    `${baseUrl}/api/invoices/${sentPayload?.invoice?.invoiceId}/send`,
    {
      headers: {
        "x-invoice-user-id": ownerId
      },
      data: {
        recipientEmail: "ops-reminder@example.com"
      }
    }
  );
  assert.equal(sendResponse.status(), 200);
  await mutateStoredInvoice(sentPayload?.invoice?.invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T12:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await queue.getByText("Today's queue").waitFor({ state: "visible" });
    await queue.getByText("1 invoice needs follow-up.").waitFor({ state: "visible" });
    await queue.getByText("Next up").waitFor({ state: "visible" });
    await queue.getByText("Resume latest draft").waitFor({ state: "visible" });
    await queue.getByText("Follow up on sent invoice").waitFor({ state: "visible" });
    await queue.getByText("Open balance: $210.00.").waitFor({ state: "visible" });
    await queue.getByText("Last sent to ops-reminder@example.com.").waitFor({ state: "visible" });
    await queue.getByRole("button", { name: "Mark INV-OPS-SENT paid" }).waitFor({ state: "visible" });
    await queue.getByRole("button", { name: "Send reminder for INV-OPS-SENT" }).click();
    await page
      .getByText(
        "Reminder recorded for ops-reminder@example.com. delivery is tracked without sending Next: add a hosted payment link so the follow-up points to an easier payment path."
      )
      .waitFor({ state: "visible" });
    await queue.getByText("$210.00", { exact: true }).waitFor({ state: "visible" });
    await queue.getByRole("button", { name: "Open INV-OPS-DRAFT with Billie" }).waitFor({ state: "visible" });

    await queue.getByRole("button", { name: "Resume INV-OPS-DRAFT" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    assert.equal(await page.getByLabel("Invoice #").inputValue(), "INV-OPS-DRAFT");
  } finally {
    await context.close();
  }
});

test("launcher starts a fresh repeat invoice from paid work", async () => {
  const ownerId = "ui-repeat-launcher-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Repeat Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-OPS-PAID",
          issueDate: "2026-03-12",
          customerName: "Repeat Client",
          currency: "USD",
          lineItems: [
            {
              id: "repeat-line-1",
              type: "labor",
              description: "Monthly maintenance visit",
              quantity: 2,
              unitPrice: 85,
              amount: 170
            }
          ],
          notes: "Use the north service gate.",
          subtotal: 170,
          total: 170,
          balanceDue: 170
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  await mutateStoredInvoice(savePayload?.invoice?.invoiceId, {
    status: "paid",
    updatedAt: "2026-04-18T12:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await queue.getByText("Invoice a repeat client").waitFor({ state: "visible" });
    await queue.getByText("Start a fresh editable draft from INV-OPS-PAID for Repeat Client.").waitFor({
      state: "visible"
    });
    await queue.getByRole("button", { name: "Invoice again from INV-OPS-PAID" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Repeat Client");
    await expectValueContains(
      page.locator('input[placeholder="Description"]:visible').first(),
      "Monthly maintenance visit"
    );
    await expectValueContains(page.getByPlaceholder("Thank you for your business"), "Use the north service gate.");
    assert.notEqual(await page.getByLabel("Invoice #").inputValue(), "INV-OPS-PAID");
  } finally {
    await context.close();
  }
});

test("launcher command center surfaces due recurring invoices", async () => {
  const ownerId = "ui-launcher-recurring-owner";
  const context = await browser.newContext();
  await context.addInitScript(
    ({ initOwnerId, recurringNextDueAt, recurringInvoiceId }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceRecurringSchedules::owner:${initOwnerId}`,
      JSON.stringify({
        entries: {
          [recurringInvoiceId]: {
            intervalDays: 30,
            nextDueAt: recurringNextDueAt,
            autoSendEnabled: true,
            lastAutoSendAt: "2026-05-07T17:00:00.000Z",
            lastAutoSendRecipient: "billing@dashboard-client.example"
          }
        }
      })
    );
    },
    {
      initOwnerId: ownerId,
      recurringNextDueAt: "2026-03-20T00:00:00.000Z",
      recurringInvoiceId: "placeholder"
    }
  );

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Launcher Recurring Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LAUNCHER-RECUR",
          issueDate: "2026-03-01",
          customerName: "Launcher Recurring Client",
          currency: "USD",
          lineItems: [
            {
              id: "launcher-recurring-line-1",
              type: "labor",
              description: "Recurring launcher baseline",
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
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const recurringInvoiceId = savePayload?.invoice?.invoiceId as string;
  await mutateStoredInvoice(recurringInvoiceId, {
    status: "paid",
    updatedAt: "2026-03-18T12:00:00.000Z"
  });

  await context.addInitScript(
    ({ initOwnerId, nextDueAt, invoiceId }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
      window.localStorage.setItem(
        `invoiceRecurringSchedules::owner:${initOwnerId}`,
        JSON.stringify({
          entries: {
            [invoiceId]: {
              intervalDays: 30,
              nextDueAt
            }
          }
        })
      );
    },
    {
      initOwnerId: ownerId,
      nextDueAt: "2026-03-20T00:00:00.000Z",
      invoiceId: recurringInvoiceId
    }
  );

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await queue.getByText("1 recurring invoice is due now.").waitFor({ state: "visible" });
    await queue.getByText("Recurring invoice due now").waitFor({ state: "visible" });
    await queue
      .getByText("INV-LAUNCHER-RECUR for Launcher Recurring Client is due Mar 20, 2026. Reopen it now so the repeat job keeps moving.")
      .waitFor({ state: "visible" });
    await queue.getByRole("button", { name: "Open repeat invoice from INV-LAUNCHER-RECUR" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Launcher Recurring Client");
    await expectValueContains(
      page.locator('input[placeholder="Description"]:visible').first(),
      "Recurring launcher baseline"
    );
  } finally {
    await context.close();
  }
});

test("launcher command center distinguishes recurring work due soon", async () => {
  const ownerId = "ui-launcher-recurring-soon-owner";
  const nextDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Launcher Recurring Soon Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LAUNCHER-RECUR-SOON",
          issueDate: "2026-03-01",
          customerName: "Launcher Recurring Soon Client",
          currency: "USD",
          lineItems: [
            {
              id: "launcher-recurring-soon-line-1",
              type: "labor",
              description: "Upcoming repeat visit",
              quantity: 1,
              unitPrice: 145,
              amount: 145
            }
          ],
          subtotal: 145,
          total: 145,
          balanceDue: 145
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const recurringInvoiceId = savePayload?.invoice?.invoiceId as string;
  await mutateStoredInvoice(recurringInvoiceId, {
    status: "paid",
    updatedAt: "2026-03-18T12:00:00.000Z"
  });

  await context.addInitScript(
    ({ initOwnerId, nextDueAt, invoiceId }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
      window.localStorage.setItem(
        `invoiceRecurringSchedules::owner:${initOwnerId}`,
        JSON.stringify({
          entries: {
            [invoiceId]: {
              intervalDays: 30,
              nextDueAt
            }
          }
        })
      );
    },
    {
      initOwnerId: ownerId,
      nextDueAt,
      invoiceId: recurringInvoiceId
    }
  );

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await page.waitForFunction(() => document.body.innerText.includes("1 recurring invoice is due soon"), undefined, {
      timeout: 10000
    });
    await queue.getByText("Recurring invoice due soon").waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("INV-LAUNCHER-RECUR-SOON for Launcher Recurring Soon Client is next due") &&
        document.body.innerText.includes("Start it early so the repeat job is ready before it lands on you."),
      undefined,
      { timeout: 10000 }
    );
    await queue.getByRole("button", { name: "Open repeat invoice from INV-LAUNCHER-RECUR-SOON" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Launcher Recurring Soon Client");
    await expectValueContains(
      page.locator('input[placeholder="Description"]:visible').first(),
      "Upcoming repeat visit"
    );
  } finally {
    await context.close();
  }
});

test("launcher due-soon recurring work can start from saved memory", async () => {
  const ownerId = "ui-launcher-recurring-soon-memory-owner";
  const nextDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(`guestEntryDismissed::owner:${initOwnerId}`, "true");
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Recurring Soon Memory Client",
          details: "Recurring Soon Memory Client\n55 Repeat Ave",
          defaultNotes: "Use the saved recurring checklist before sending.",
          updatedAt: "2026-05-02T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${initOwnerId}`,
      JSON.stringify([
        {
          description: "Quarterly filter replacement",
          qty: "1",
          rate: "210",
          clientName: "Recurring Soon Memory Client",
          usageCount: 5,
          updatedAt: "2026-05-03T12:00:00.000Z"
        }
      ])
    );
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recurring Soon Memory Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LAUNCHER-RECUR-SOON-MEM",
          issueDate: "2026-03-01",
          customerName: "Recurring Soon Memory Client",
          currency: "USD",
          lineItems: [
            {
              id: "launcher-recurring-soon-memory-line-1",
              type: "labor",
              description: "Previous recurring visit",
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
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const recurringInvoiceId = savePayload?.invoice?.invoiceId as string;
  await mutateStoredInvoice(recurringInvoiceId, {
    status: "paid",
    updatedAt: "2026-03-18T12:00:00.000Z"
  });

  await context.addInitScript(
    ({ initOwnerId, nextDueAtValue, invoiceId }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
      window.localStorage.setItem(
        `invoiceRecurringSchedules::owner:${initOwnerId}`,
        JSON.stringify({
          entries: {
            [invoiceId]: {
              intervalDays: 30,
              nextDueAt: nextDueAtValue
            }
          }
        })
      );
    },
    {
      initOwnerId: ownerId,
      nextDueAtValue: nextDueAt,
      invoiceId: recurringInvoiceId
    }
  );

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await queue.getByText("Saved Quarterly filter replacement memory is ready too.").waitFor({ state: "visible" });
    await queue
      .getByRole("button", { name: "Start upcoming repeat invoice from saved memory for Recurring Soon Memory Client" })
      .click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Recurring Soon Memory Client");
    await expectValueContains(page.getByPlaceholder("Client Name"), "55 Repeat Ave");
    await expectValueEquals(
      page.locator("tbody tr").first().getByPlaceholder("Description", { exact: true }),
      "Quarterly filter replacement"
    );
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("0", { exact: true }), "1");
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("$0", { exact: true }), "210");
    const advancedSchedule = await page.evaluate((storageOwnerId) => {
      const raw = window.localStorage.getItem(`invoiceRecurringSchedules::owner:${storageOwnerId}`);
      if (!raw) {
        return "";
      }
      const parsed: RecurringScheduleStore = JSON.parse(raw);
      const entries = parsed.entries ? Object.values(parsed.entries) : [];
      const firstEntry: RecurringScheduleEntry | undefined = entries[0];
      return firstEntry?.nextDueAt ?? "";
    }, ownerId);
    assert.notEqual(advancedSchedule, nextDueAt);
  } finally {
    await context.close();
  }
});

test("launcher draft recovery can reopen a saved draft in Billie workspace", async () => {
  const ownerId = "ui-launcher-billie-draft-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Launcher Billie Draft Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LAUNCHER-BILLIE-DRAFT",
          issueDate: "2026-03-12",
          customerName: "Launcher Billie Draft Client",
          currency: "USD",
          lineItems: [
            {
              id: "launcher-billie-draft-line-1",
              type: "labor",
              description: "Needs cleaner wording",
              quantity: 1,
              unitPrice: 95,
              amount: 95
            }
          ],
          notes: "Need stronger client-facing notes.",
          subtotal: 95,
          total: 95,
          balanceDue: 95
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open with Billie" }).first().click();

    await page.waitForURL(/\/manual\?tab=assistant&source=library$/, { timeout: 10000 });
    await page.getByText("Saved invoice reopened in Billie workspace.").waitFor({ state: "visible" });
    await page.getByText("Continue from saved work").waitFor({ state: "visible" });
    await page
      .locator('[data-testid="manual-billie-workspace"]')
      .getByRole("button", { name: "Polish reopened draft" })
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("launcher repeat command center can start from saved memory for paid clients", async () => {
  const ownerId = "ui-repeat-launcher-memory-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Repeat Client",
          details: "Repeat Client\nNorth service gate",
          defaultNotes: "Monthly maintenance visit. Payment due on receipt.",
          recurringIntervalDays: 30,
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${initOwnerId}`,
      JSON.stringify([
        {
          description: "Quarterly drain maintenance",
          qty: "2",
          rate: "120",
          clientName: "Repeat Client",
          usageCount: 4,
          updatedAt: "2026-04-21T12:00:00.000Z"
        }
      ])
    );
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Repeat Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-OPS-PAID-MEM",
          issueDate: "2026-03-12",
          customerName: "Repeat Client",
          currency: "USD",
          lineItems: [
            {
              id: "repeat-line-1",
              type: "labor",
              description: "Monthly maintenance visit",
              quantity: 2,
              unitPrice: 85,
              amount: 170
            }
          ],
          notes: "Use the north service gate.",
          subtotal: 170,
          total: 170,
          balanceDue: 170
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  await mutateStoredInvoice(savePayload?.invoice?.invoiceId, {
    status: "paid",
    updatedAt: "2026-04-18T12:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await queue
      .getByText("Saved monthly cadence and Quarterly drain maintenance memory are ready.")
      .waitFor({ state: "visible" });
    await queue.getByRole("button", { name: "Start from saved memory for Repeat Client" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Repeat Client");
    await expectValueEquals(
      page.locator("tbody tr").first().getByPlaceholder("Description", { exact: true }),
      "Quarterly drain maintenance"
    );
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("0", { exact: true }), "2");
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("$0", { exact: true }), "120");
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Monthly maintenance visit. Payment due on receipt."
    );
  } finally {
    await context.close();
  }
});

test("launcher follow-up card prefers delivery review for overdue unopened invoices", async () => {
  const ownerId = "ui-launcher-overdue-unopened-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Overdue Unopened Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LAUNCHER-OVERDUE-UNOPENED",
          issueDate: "2026-03-12",
          dueDate: "2026-03-20",
          customerName: "Overdue Unopened Client",
          currency: "USD",
          lineItems: [
            {
              id: "launcher-overdue-line-1",
              type: "labor",
              description: "Drain inspection",
              quantity: 1,
              unitPrice: 170,
              amount: 170
            }
          ],
          subtotal: 170,
          total: 170,
          balanceDue: 170
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const sendResponse = await context.request.post(
    `${baseUrl}/api/invoices/${savePayload?.invoice?.invoiceId}/send`,
    {
      headers: {
        "x-invoice-user-id": ownerId
      },
      data: {
        recipientEmail: "overdue-unopened-launcher@example.com"
      }
    }
  );
  assert.equal(sendResponse.status(), 200);
  await mutateStoredInvoice(savePayload?.invoice?.invoiceId, {
    status: "sent",
    updatedAt: "2026-04-01T12:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await queue.getByText("Re-send or confirm delivery").waitFor({ state: "visible" });
    await queue
      .getByText(
        "The client still has not opened it. Re-send it or confirm delivery before escalating into a payment reminder."
      )
      .waitFor({ state: "visible" });
    await queue.getByRole("button", { name: "Review delivery" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("launcher follow-up card prefers focused reminder for overdue opened invoices", async () => {
  const ownerId = "ui-launcher-overdue-opened-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(`guestEntryDismissed::owner:${initOwnerId}`, "true");
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Overdue Opened Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LAUNCHER-OVERDUE-OPENED",
          issueDate: "2026-03-12",
          dueDate: "2026-03-20",
          customerName: "Overdue Opened Client",
          currency: "USD",
          lineItems: [
            {
              id: "launcher-opened-line-1",
              type: "labor",
              description: "Maintenance visit",
              quantity: 1,
              unitPrice: 245,
              amount: 245
            }
          ],
          subtotal: 245,
          total: 245,
          balanceDue: 245
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const sendResponse = await context.request.post(
    `${baseUrl}/api/invoices/${savePayload?.invoice?.invoiceId}/send`,
    {
      headers: {
        "x-invoice-user-id": ownerId
      },
      data: {
        recipientEmail: "overdue-opened-launcher@example.com"
      }
    }
  );
  assert.equal(sendResponse.status(), 200);
  const openedInvoiceId = String(savePayload?.invoice?.invoiceId ?? "");
  assert.ok(openedInvoiceId);
  const openedResponse = await context.request.post(
    `${baseUrl}/api/invoices/${openedInvoiceId}/delivery/opened`,
    {
      headers: {
        "x-invoice-user-id": ownerId
      }
    }
  );
  assert.equal(openedResponse.status(), 200);
  await mutateStoredInvoice(openedInvoiceId, {
    status: "sent",
    updatedAt: "2026-04-01T12:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const queue = page.locator("section").filter({ hasText: "Invoice command center" });
    await queue.getByRole("paragraph").filter({ hasText: /^Send focused reminder$/ }).waitFor({ state: "visible" });
    await queue
      .getByText("The client already opened it, so a focused reminder is the best next step.")
      .waitFor({ state: "visible" });
    await queue.getByRole("button", { name: "Send reminder for INV-LAUNCHER-OVERDUE-OPENED" }).waitFor({
      state: "visible"
    });
    await queue.getByRole("button", { name: "Send reminder for INV-LAUNCHER-OVERDUE-OPENED" }).click();
    await page
      .getByText(/Reminder recorded for overdue-opened-launcher@example\.com/i)
      .waitFor({ state: "visible" });
    await page
      .getByText(/delivery is tracked without sending/i)
      .waitFor({ state: "visible" });
    await page
      .getByText(/Next: add a hosted payment link so the follow-up points to an easier payment path\./i)
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("launcher can start a fresh draft from repeat client memory", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-launcher-repeat-memory-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Casey Client",
          details: "Casey Client\n123 Main St",
          defaultNotes: "Monthly maintenance visit. Payment due on receipt.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Quarterly drain maintenance",
          qty: "2",
          rate: "120",
          clientName: "Casey Client",
          usageCount: 4,
          updatedAt: "2026-04-21T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await openLauncher(page);
    await page.getByRole("button", { name: "Need a different start?" }).click();
    await page.getByText("Repeat client: Casey Client").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Repeat client: Casey Client" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 10000 });

    await expectValueContains(page.getByPlaceholder("Client Name"), "Casey Client");
    await expectValueEquals(
      page.locator("tbody tr").first().getByPlaceholder("Description", { exact: true }),
      "Quarterly drain maintenance"
    );
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("0", { exact: true }), "2");
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("$0", { exact: true }), "120");
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Monthly maintenance visit. Payment due on receipt."
    );
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

test("launcher shows a pro value pitch when one free save remains", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "2";

  const ownerId = "ui-plan-pitch-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(`guestEntryDismissed::owner:${initOwnerId}`, "true");
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
          customerName: "Plan Pitch Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PLAN-PITCH-1",
          issueDate: "2026-03-10",
          customerName: "Plan Pitch Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Plan pitch baseline",
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
  const seededInvoiceId = String((await seedResponse.json()).invoice?.invoiceId ?? "");
  assert.ok(seededInvoiceId);
  const sentResponse = await context.request.post(`${baseUrl}/api/invoices/${seededInvoiceId}/status`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      status: "sent"
    }
  });
  assert.equal(sentResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page
      .getByText("Pro keeps sends, reminders, hosted payment links, and saved client memory in one place.")
      .waitFor({ state: "visible" });
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

test("invoice library shows billing completion notice and clears billing query param", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices?billing=success`, { waitUntil: "networkidle" });
    await page
      .getByText("Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription.")
      .waitFor({ state: "visible" });
    await waitForCondition(() => !new URL(page.url()).searchParams.has("billing"), {
      timeoutMs: 2000,
      message: "Billing query param should be removed after library notice renders."
    });
  } finally {
    await context.close();
  }
});

test("invoice library empty state offers sample notes", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("No invoices saved yet").waitFor({ state: "visible" });
    await page.getByText("Saved drafts, sent invoices, and paid work will show up here.").waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Try sample job" }).click();
    await page
      .getByText("Sample notes loaded. Review them, then build the invoice.")
      .waitFor({ state: "visible" });
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
    await page
      .getByText("Open launcher sign-in to send yourself an email link, then come right back here.")
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Go to launcher sign-in" }).click();
    await page.getByText("After sign-in, you'll return to the invoice library.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Email sign-in link" }).waitFor({ state: "visible" });
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
    await page.getByText("Follow-up queue").waitFor({ state: "visible" });
    await page.getByText("1 sent invoice is waiting on follow-up.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open repeat invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Show sent invoices" }).click();
    await page.getByText("INV-SENT-1", { exact: true }).waitFor({ state: "visible" });
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
    await page.getByText("Follow-up queue").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Snooze for 7 days" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Dismiss" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Snooze for 7 days" }).click();
    await page.getByText("Follow-up queue").waitFor({ state: "hidden" });

    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByText("Follow-up queue").count(), 0);
  } finally {
    await context.close();
  }
});

test("invoice library follow-up reminder can copy a suggested reminder note", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-reminder-copy-owner");
  });

  const sentSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-copy-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Copy Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-COPY-1",
          issueDate: "2026-02-01",
          customerName: "Reminder Copy Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-copy-1",
              type: "labor",
              description: "Copy reminder baseline",
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
  assert.equal(sentSeedResponse.status(), 200);
  const sentSeedPayload = await sentSeedResponse.json();
  const invoiceId = sentSeedPayload?.invoice?.invoiceId as string;
  await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-copy-owner"
    },
    data: {
      recipientEmail: "reminder.copy@example.com"
    }
  });
  await mutateStoredInvoice(invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T00:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Follow-up queue").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Copy reminder note" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Copy reminder note" }).click();
    await page
      .locator("p.rounded-xl.border.border-blue-100")
      .getByText("A quick follow-up on INV-COPY-1", { exact: false })
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library follow-up plan can mark the oldest reminder paid", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-reminder-mark-paid-owner");
  });

  const sentSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-mark-paid-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Paid Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-REM-PAID-1",
          issueDate: "2026-02-01",
          dueDate: "2026-02-15",
          customerName: "Reminder Paid Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-rem-paid-1",
              type: "labor",
              description: "Reminder paid baseline",
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
  assert.equal(sentSeedResponse.status(), 200);
  const sentSeedPayload = await sentSeedResponse.json();
  const invoiceId = sentSeedPayload?.invoice?.invoiceId as string;
  await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-mark-paid-owner"
    },
    data: {
      recipientEmail: "reminder.paid@example.com"
    }
  });
  await mutateStoredInvoice(invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T00:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const plan = page.getByTestId("library-follow-up-plan");
    await plan.waitFor({ state: "visible" });
    await plan.getByText("Past due since").waitFor({ state: "visible" });
    await plan.getByText("Sent to reminder.paid@example.com").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Mark paid" }).first().click();
    await page
      .getByText("Marked INV-REMINDER-PAID as paid. Next: use Invoice again when similar work comes back.")
      .waitFor({ state: "visible" });
    await page.getByText("Follow-up queue").waitFor({ state: "hidden" });
  } finally {
    await context.close();
  }
});

test("invoice library can enable and test browser reminder notifications", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const notifications: Array<{ title: string; options?: NotificationOptions }> = [];
    function NotificationMock(this: unknown, title: string, options?: NotificationOptions) {
      notifications.push({ title, options });
    }
    const notificationApi = NotificationMock as unknown as typeof Notification & {
      permission: NotificationPermission;
      requestPermission: () => Promise<NotificationPermission>;
    };
    notificationApi.permission = "default";
    notificationApi.requestPermission = async () => {
      notificationApi.permission = "granted";
      return "granted";
    };
    Object.defineProperty(window, "Notification", {
      value: notificationApi,
      configurable: true,
      writable: true
    });
    (window as Window & { __notebillNotifications?: Array<{ title: string; options?: NotificationOptions }> }).__notebillNotifications =
      notifications;
    window.localStorage.setItem("invoiceOwnerId", "ui-reminder-notify-owner");
  });

  const sentSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-reminder-notify-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Notify Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-NOTIFY-1",
          issueDate: "2026-02-01",
          customerName: "Reminder Notify Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-rem-notify-1",
              type: "labor",
              description: "Reminder notify baseline",
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
  assert.equal(sentSeedResponse.status(), 200);
  const sentSeedPayload = await sentSeedResponse.json();
  await mutateStoredInvoice(sentSeedPayload?.invoice?.invoiceId, {
    status: "sent",
    updatedAt: "2026-01-15T00:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Enable browser reminders" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Enable browser reminders" }).click();
    await page.getByText("Reminder alerts enabled.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Test reminder alert" }).click();
    await page
      .getByText("Sending reminder test...")
      .waitFor({ state: "visible" });
    const notificationEnabled = await page.evaluate(
      () => window.localStorage.getItem("invoiceReminderNotificationSettings")
    );
    assert.equal(notificationEnabled, JSON.stringify({ enabled: true }));
  } finally {
    await context.close();
  }
});

test("invoice library reminder presets update automation timing", async () => {
  const ownerId = "ui-reminder-preset-owner";
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-reminder-preset-owner");
  });

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Preset Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-REM-PRESET-1",
          issueDate: "2026-02-01",
          dueDate: "2026-02-15",
          customerName: "Reminder Preset Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-rem-preset-1",
              type: "labor",
              description: "Reminder preset baseline",
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
  assert.equal(seedResponse.status(), 200);
  const seedPayload = await seedResponse.json();
  const seedId = seedPayload?.invoice?.invoiceId;
  assert.equal(typeof seedId, "string");
  await context.request.post(`${baseUrl}/api/invoices/${seedId}/status`, {
    headers: {
      "x-invoice-user-id": ownerId,
      "Content-Type": "application/json"
    },
    data: { status: "sent" }
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "domcontentloaded" });
    await page.getByText("Reminder automation", { exact: true }).waitFor({ state: "visible" });
    await page.locator('button[title="Follow sooner with more volume."]').click();

    const settings = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((entry) =>
        entry.startsWith("invoiceReminderAutomationSettings::")
      );
      return key ? JSON.parse(window.localStorage.getItem(key) ?? "null") : null;
    });
    assert.equal(settings?.dueAfterDays, 7);
    assert.equal(settings?.cooldownDays, 3);
    assert.equal(settings?.maxPerRun, 20);
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

    await page.getByText("Repeat work").waitFor({ state: "visible" });
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
    await page.getByText("Repeat work").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Set monthly recurring for INV-RECUR-1" })
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library can arm recurring auto-send when a client recipient is remembered", async () => {
  const ownerId = "ui-recurring-auto-send-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Recurring Auto Client",
          details: "Recurring Auto Client\n77 Queue St",
          recipientEmail: "auto-send@example.com",
          updatedAt: "2026-05-09T18:00:00.000Z"
        }
      ])
    );
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
          customerName: "Recurring Auto Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECUR-AUTO-1",
          issueDate: "2026-05-09",
          customerName: "Recurring Auto Client",
          currency: "USD",
          lineItems: [
            {
              id: "recur-auto-line-1",
              type: "labor",
              description: "Monthly maintenance",
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
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("INV-RECUR-AUTO-1", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Set monthly recurring for INV-RECUR-AUTO-1" }).click();
    await page.getByRole("button", { name: "Arm auto-send for INV-RECUR-AUTO-1" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Arm auto-send for INV-RECUR-AUTO-1" }).click();
    await page.getByText("Auto-send armed for auto-send@example.com.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Pause auto-send for INV-RECUR-AUTO-1" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library can run recurring auto-send immediately", async () => {
  const ownerId = "ui-recurring-auto-send-run-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Recurring Run Client",
          details: "Recurring Run Client\n88 Queue St",
          recipientEmail: "run-auto@example.com",
          updatedAt: "2026-05-09T18:00:00.000Z"
        }
      ])
    );
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
          customerName: "Recurring Run Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECUR-AUTO-RUN-1",
          issueDate: "2026-05-09",
          dueDate: "2026-05-16",
          customerName: "Recurring Run Client",
          currency: "USD",
          lineItems: [
            {
              id: "recur-auto-run-line-1",
              type: "labor",
              description: "Monthly maintenance",
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
  const seedPayload = (await seedResponse.json()) as { invoice?: { invoiceId?: string } };
  const invoiceId = String(seedPayload.invoice?.invoiceId ?? "");
  assert.ok(invoiceId);

  const page = await context.newPage();
  let sendAttempts = 0;
  let sendStatus = 0;
  try {
    await page.route("**/api/invoices/*/send", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      sendAttempts += 1;
      const response = await route.fetch();
      sendStatus = response.status();
      await route.fulfill({ response });
    });

    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("INV-RECUR-AUTO-RUN-1", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Set monthly recurring for INV-RECUR-AUTO-RUN-1" }).click();
    await page.getByRole("button", { name: "Arm auto-send for INV-RECUR-AUTO-RUN-1" }).click();
    await page.getByRole("button", { name: "Run recurring auto-send for INV-RECUR-AUTO-RUN-1" }).waitFor({
      state: "visible"
    });

    const beforeEntry = await page.evaluate(
      ({ storageOwnerId, targetInvoiceId }) => {
        const raw = window.localStorage.getItem(`invoiceRecurringSchedules::owner:${storageOwnerId}`);
        if (!raw) {
          return null;
        }
        const parsed: RecurringScheduleStore = JSON.parse(raw);
        return parsed.entries?.[targetInvoiceId] ?? null;
      },
      { storageOwnerId: ownerId, targetInvoiceId: invoiceId }
    );
    assert.ok(beforeEntry);
    assert.equal(beforeEntry.autoSendEnabled, true);
    assert.equal(beforeEntry.intervalDays, 30);
    assert.ok(beforeEntry.nextDueAt);

    await page.getByRole("button", { name: "Run recurring auto-send for INV-RECUR-AUTO-RUN-1" }).click();
    await page.waitForFunction(
      ({ storageOwnerId, targetInvoiceId, previousNextDueAt }) => {
        const raw = window.localStorage.getItem(`invoiceRecurringSchedules::owner:${storageOwnerId}`);
        if (!raw) {
          return false;
        }
        try {
          const parsed: RecurringScheduleStore = JSON.parse(raw);
          const entry = parsed.entries?.[targetInvoiceId];
          return Boolean(
            entry &&
              entry.nextDueAt &&
              entry.nextDueAt !== previousNextDueAt &&
              entry.lastAutoSendAt &&
              entry.lastAutoSendRecipient === "run-auto@example.com" &&
              Number(entry.autoSendRunCount ?? 0) === 1 &&
              String(entry.lastAutoSendMode ?? "")
          );
        } catch (_error) {
          return false;
        }
      },
      {
        storageOwnerId: ownerId,
        targetInvoiceId: invoiceId,
        previousNextDueAt: beforeEntry.nextDueAt
      },
      { timeout: 30000 }
    );

    const afterEntry = await page.evaluate(
      ({ storageOwnerId, targetInvoiceId }) => {
        const raw = window.localStorage.getItem(`invoiceRecurringSchedules::owner:${storageOwnerId}`);
        if (!raw) {
          return null;
        }
        const parsed: RecurringScheduleStore = JSON.parse(raw);
        return parsed.entries?.[targetInvoiceId] ?? null;
      },
      { storageOwnerId: ownerId, targetInvoiceId: invoiceId }
    );
    assert.ok(afterEntry);
    assert.notEqual(afterEntry.nextDueAt, beforeEntry.nextDueAt);
    assert.equal(afterEntry.autoSendRunCount, 1);
    assert.ok(afterEntry.lastAutoSendAt);
    assert.equal(afterEntry.lastAutoSendRecipient, "run-auto@example.com");
    assert.ok(String(afterEntry.lastAutoSendMode ?? ""));
    assert.equal(sendAttempts, 1);
    assert.ok(sendStatus >= 200 && sendStatus < 300);

    const invoiceCard = page.locator("div.nb-surface--elevated").filter({
      has: page.getByText("INV-RECUR-AUTO-RUN-1", { exact: true })
    });
    await invoiceCard.getByText("Sent invoice", { exact: true }).waitFor({ state: "visible" });
    await invoiceCard.locator("span.nb-chip--info", { hasText: "Sent" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library keeps recurring schedule unchanged when auto-send fails", async () => {
  const ownerId = "ui-recurring-auto-send-fail-owner";
  const invoiceNumber = "INV-RECUR-AUTO-FAIL-1";
  const recipientEmail = "fail-auto@example.com";
  const context = await browser.newContext();
  await context.addInitScript(
    ({ initOwnerId, rememberedEmail }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
      window.localStorage.setItem(
        `invoiceClientMemory::owner:${initOwnerId}`,
        JSON.stringify([
          {
            name: "Recurring Fail Client",
            details: "Recurring Fail Client\n99 Fail St",
            recipientEmail: rememberedEmail,
            updatedAt: "2026-05-09T18:00:00.000Z"
          }
        ])
      );
    },
    { initOwnerId: ownerId, rememberedEmail: recipientEmail }
  );

  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recurring Fail Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber,
          issueDate: "2026-05-09",
          dueDate: "2026-05-16",
          customerName: "Recurring Fail Client",
          currency: "USD",
          lineItems: [
            {
              id: "recur-auto-fail-line-1",
              type: "labor",
              description: "Monthly maintenance",
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
  const seedPayload = (await seedResponse.json()) as { invoice?: { invoiceId?: string } };
  const invoiceId = String(seedPayload.invoice?.invoiceId ?? "");
  assert.ok(invoiceId);

  const page = await context.newPage();
  let sendAttempts = 0;
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText(invoiceNumber, { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: `Set monthly recurring for ${invoiceNumber}` }).click();
    await page.getByRole("button", { name: `Arm auto-send for ${invoiceNumber}` }).click();
    await page.getByRole("button", { name: `Run recurring auto-send for ${invoiceNumber}` }).waitFor({
      state: "visible"
    });

    const beforeSnapshot = await page.evaluate(
      ({ storageOwnerId, targetInvoiceId }) => {
        const key = `invoiceRecurringSchedules::owner:${storageOwnerId}`;
        const raw = window.localStorage.getItem(key);
        if (!raw) {
          return null;
        }
        const parsed: RecurringScheduleStore = JSON.parse(raw);
        return {
          raw,
          entry: parsed.entries?.[targetInvoiceId] ?? null
        };
      },
      { storageOwnerId: ownerId, targetInvoiceId: invoiceId }
    );
    assert.ok(beforeSnapshot?.raw);
    assert.ok(beforeSnapshot.entry);
    assert.equal(beforeSnapshot.entry.autoSendEnabled, true);
    assert.equal(beforeSnapshot.entry.intervalDays, 30);
    assert.ok(beforeSnapshot.entry.nextDueAt);
    assert.equal(beforeSnapshot.entry.autoSendRunCount ?? 0, 0);
    assert.equal(beforeSnapshot.entry.lastAutoSendAt, undefined);
    assert.equal(beforeSnapshot.entry.lastAutoSendRecipient, undefined);
    assert.equal(beforeSnapshot.entry.lastAutoSendMode, undefined);

    await page.route("**/api/invoices/*/send", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      sendAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated recurring send failure." })
      });
    });

    await page.getByRole("button", { name: `Run recurring auto-send for ${invoiceNumber}` }).click();
    await page.getByText("Simulated recurring send failure.", { exact: true }).waitFor({ state: "visible" });
    await page.getByText(`Recurring send run for ${recipientEmail}`, { exact: false }).waitFor({
      state: "hidden"
    });

    const afterSnapshot = await page.evaluate(
      ({ storageOwnerId, targetInvoiceId }) => {
        const key = `invoiceRecurringSchedules::owner:${storageOwnerId}`;
        const raw = window.localStorage.getItem(key);
        if (!raw) {
          return null;
        }
        const parsed: RecurringScheduleStore = JSON.parse(raw);
        return {
          raw,
          entry: parsed.entries?.[targetInvoiceId] ?? null
        };
      },
      { storageOwnerId: ownerId, targetInvoiceId: invoiceId }
    );
    assert.ok(afterSnapshot?.raw);
    assert.ok(afterSnapshot.entry);
    assert.equal(afterSnapshot.raw, beforeSnapshot.raw);
    assert.deepEqual(afterSnapshot.entry, beforeSnapshot.entry);
    assert.equal(afterSnapshot.entry.nextDueAt, beforeSnapshot.entry.nextDueAt);
    assert.equal(afterSnapshot.entry.autoSendRunCount ?? 0, beforeSnapshot.entry.autoSendRunCount ?? 0);
    assert.equal(afterSnapshot.entry.lastAutoSendAt, beforeSnapshot.entry.lastAutoSendAt);
    assert.equal(afterSnapshot.entry.lastAutoSendRecipient, beforeSnapshot.entry.lastAutoSendRecipient);
    assert.equal(afterSnapshot.entry.lastAutoSendMode, beforeSnapshot.entry.lastAutoSendMode);
    assert.equal(sendAttempts, 1);

    const invoiceCard = page.locator("div.nb-surface--elevated").filter({
      has: page.getByText(invoiceNumber, { exact: true })
    });
    await invoiceCard.getByText("Draft invoice", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await invoiceCard.getByText("Sent invoice", { exact: true }).count(), 0);
    assert.equal(await invoiceCard.locator("span.nb-chip--info", { hasText: "Sent" }).count(), 0);
  } finally {
    await context.close();
  }
});

test("invoice library suggests remembered recurring cadence for repeat clients", async () => {
  const ownerId = "ui-recurring-memory-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveInvoice = async (invoiceNumber: string) =>
    context.request.post(`${baseUrl}/api/invoices/save`, {
      headers: {
        "x-invoice-user-id": ownerId
      },
      data: {
        confirmSave: true,
        sourceType: "text_input",
        invoiceData: {
          structuredInvoice: {
            customerName: "Recurring Memory Client",
            workSessions: [],
            materials: []
          },
          finishedInvoice: {
            invoiceNumber,
            issueDate: "2026-03-01",
            customerName: "Recurring Memory Client",
            currency: "USD",
            lineItems: [
              {
                id: `${invoiceNumber}-line`,
                type: "labor",
                description: "Recurring memory baseline",
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

  const firstResponse = await saveInvoice("INV-RECUR-MEMORY-A");
  assert.equal(firstResponse.status(), 200);
  const secondResponse = await saveInvoice("INV-RECUR-MEMORY-B");
  assert.equal(secondResponse.status(), 200);
  const secondPayload = await secondResponse.json();
  const secondInvoiceId = secondPayload?.invoice?.invoiceId as string;

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Set monthly recurring for INV-RECUR-MEMORY-A" })
      .click();
    await page.locator('select[aria-label="Recurring cadence for INV-RECUR-MEMORY-A"]').selectOption("7");
    const secondRepeatWorkflow = page.getByTestId(`library-repeat-workflow-${secondInvoiceId}`);
    await secondRepeatWorkflow.waitFor({ state: "visible" });
    await secondRepeatWorkflow.getByText("Saved weekly").waitFor({ state: "visible" });
    await secondRepeatWorkflow.getByText("Reuse saved cadence").waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "Use weekly cadence for INV-RECUR-MEMORY-B" })
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use weekly cadence for INV-RECUR-MEMORY-B" }).click();

    const storedInterval = await page.evaluate(
      ({ storageOwnerId, invoiceId }) => {
        const raw = window.localStorage.getItem(`invoiceRecurringSchedules::owner:${storageOwnerId}`);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed?.entries?.[invoiceId]?.intervalDays ?? null;
      },
      { storageOwnerId: ownerId, invoiceId: secondInvoiceId }
    );
    assert.equal(storedInterval, 7);
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
    await page.getByText("Repeat work").waitFor({ state: "visible" });
    await page.getByText("1 recurring invoice is ready.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open repeat invoice" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Recurring Open Client");
  } finally {
    await context.close();
  }
});

test("invoice library can open a specific invoice from the query string", async () => {
  const ownerId = "ui-library-open-query-owner";
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
          customerName: "Query Open Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-QUERY-OPEN-1",
          issueDate: "2026-05-03",
          customerName: "Query Open Client",
          currency: "USD",
          lineItems: [
            {
              id: "query-open-line-1",
              type: "labor",
              description: "Recurring query baseline",
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
  const seedPayload = await seedResponse.json();
  const invoiceId = seedPayload?.invoice?.invoiceId as string;
  assert.equal(typeof invoiceId, "string");

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices?open=${encodeURIComponent(invoiceId)}`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Query Open Client");
  } finally {
    await context.close();
  }
});

test("invoice library distinguishes recurring work due soon", async () => {
  const ownerId = "ui-library-recurring-soon-owner";
  const nextDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recurring Soon Library Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECUR-SOON-LIB",
          issueDate: "2026-03-01",
          customerName: "Recurring Soon Library Client",
          currency: "USD",
          lineItems: [
            {
              id: "recur-soon-lib-line-1",
              type: "labor",
              description: "Upcoming recurring library visit",
              quantity: 1,
              unitPrice: 132,
              amount: 132
            }
          ],
          subtotal: 132,
          total: 132,
          balanceDue: 132
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const invoiceId = savePayload?.invoice?.invoiceId as string;
  await mutateStoredInvoice(invoiceId, {
    status: "paid",
    updatedAt: "2026-03-18T12:00:00.000Z"
  });

  await context.addInitScript(
    ({ initOwnerId, initInvoiceId, initNextDueAt }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
      window.localStorage.setItem(
        `invoiceRecurringSchedules::owner:${initOwnerId}`,
        JSON.stringify({
          entries: {
            [initInvoiceId]: {
              intervalDays: 30,
              nextDueAt: initNextDueAt
            }
          }
        })
      );
    },
    { initOwnerId: ownerId, initInvoiceId: invoiceId, initNextDueAt: nextDueAt }
  );

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Repeat work", { exact: true }).waitFor({ state: "visible" });
    await page.waitForFunction(() => document.body.innerText.includes("1 recurring invoice is due soon"), undefined, {
      timeout: 10000
    });
    await page.getByText("Prep the next repeat invoice").waitFor({ state: "visible" });
    await page.getByText("A repeat job is due soon. Open it early so the next visit is already lined up.").waitFor({
      state: "visible"
    });
    await page.getByTestId("library-billie-next-up").getByRole("button", { name: "Open repeat invoice" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Recurring Soon Library Client");
  } finally {
    await context.close();
  }
});

test("invoice library due-soon recurring work can start from saved memory", async () => {
  const ownerId = "ui-library-recurring-soon-memory-owner";
  const nextDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Recurring Soon Library Memory Client",
          details: "Recurring Soon Library Memory Client\n700 Service Loop",
          defaultNotes: "Bring the same recurring parts bundle.",
          updatedAt: "2026-05-01T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${initOwnerId}`,
      JSON.stringify([
        {
          description: "Semiannual rooftop inspection",
          qty: "2",
          rate: "165",
          clientName: "Recurring Soon Library Memory Client",
          usageCount: 4,
          updatedAt: "2026-05-03T12:00:00.000Z"
        }
      ])
    );
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recurring Soon Library Memory Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECUR-SOON-LIB-MEM",
          issueDate: "2026-03-01",
          customerName: "Recurring Soon Library Memory Client",
          currency: "USD",
          lineItems: [
            {
              id: "recur-soon-lib-memory-line-1",
              type: "labor",
              description: "Previous roof visit",
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
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const invoiceId = savePayload?.invoice?.invoiceId as string;
  await mutateStoredInvoice(invoiceId, {
    status: "paid",
    updatedAt: "2026-03-18T12:00:00.000Z"
  });

  await context.addInitScript(
    ({ initOwnerId, initInvoiceId, initNextDueAt }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
      window.localStorage.setItem(
        `invoiceRecurringSchedules::owner:${initOwnerId}`,
        JSON.stringify({
          entries: {
            [initInvoiceId]: {
              intervalDays: 30,
              nextDueAt: initNextDueAt
            }
          }
        })
      );
    },
    { initOwnerId: ownerId, initInvoiceId: invoiceId, initNextDueAt: nextDueAt }
  );

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByTestId("library-billie-next-up").getByRole("button", { name: "Start from saved memory" }).click();
    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Recurring Soon Library Memory Client");
    await expectValueContains(page.getByPlaceholder("Client Name"), "700 Service Loop");
    await expectValueEquals(
      page.locator("tbody tr").first().getByPlaceholder("Description", { exact: true }),
      "Semiannual rooftop inspection"
    );
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("0", { exact: true }), "2");
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("$0", { exact: true }), "165");
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Bring the same recurring parts bundle."
    );
  } finally {
    await context.close();
  }
});

test("invoice library repeat-work banner can start recurring work from saved memory", async () => {
  const ownerId = "ui-library-recurring-banner-memory-owner";
  const nextDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Recurring Banner Memory Client",
          details: "Recurring Banner Memory Client\n108 Banner Way",
          defaultNotes: "Use the repeat checklist from the banner flow.",
          updatedAt: "2026-05-01T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${initOwnerId}`,
      JSON.stringify([
        {
          description: "Seasonal maintenance visit",
          qty: "1",
          rate: "175",
          clientName: "Recurring Banner Memory Client",
          usageCount: 3,
          updatedAt: "2026-05-03T12:00:00.000Z"
        }
      ])
    );
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Recurring Banner Memory Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RECUR-BANNER-MEM",
          issueDate: "2026-03-01",
          customerName: "Recurring Banner Memory Client",
          currency: "USD",
          lineItems: [
            {
              id: "recur-banner-line-1",
              type: "labor",
              description: "Last recurring banner visit",
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
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const invoiceId = savePayload?.invoice?.invoiceId as string;
  await mutateStoredInvoice(invoiceId, {
    status: "paid",
    updatedAt: "2026-03-18T12:00:00.000Z"
  });

  await context.addInitScript(
    ({ initOwnerId, initInvoiceId, initNextDueAt }) => {
      window.localStorage.setItem("invoiceOwnerId", initOwnerId);
      window.localStorage.setItem(
        `invoiceRecurringSchedules::owner:${initOwnerId}`,
        JSON.stringify({
          entries: {
            [initInvoiceId]: {
              intervalDays: 30,
              nextDueAt: initNextDueAt
            }
          }
        })
      );
    },
    { initOwnerId: ownerId, initInvoiceId: invoiceId, initNextDueAt: nextDueAt }
  );

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const repeatBanner = page.locator("div").filter({ hasText: "Repeat work" }).first();
    await repeatBanner
      .getByText("Saved Seasonal maintenance visit memory is ready for Recurring Banner Memory Client.")
      .waitFor({ state: "visible" });
    await repeatBanner
      .getByRole("button", { name: "Start recurring invoice from saved memory for Recurring Banner Memory Client" })
      .click();

    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Recurring Banner Memory Client");
    await expectValueContains(page.getByPlaceholder("Client Name"), "108 Banner Way");
    await expectValueEquals(
      page.locator("tbody tr").first().getByPlaceholder("Description", { exact: true }),
      "Seasonal maintenance visit"
    );
  } finally {
    await context.close();
  }
});

test("invoice library shows draft recovery inbox for stale draft invoices", async () => {
  const ownerId = `ui-library-draft-recovery-owner-${Date.now()}`;
  const dayMs = 24 * 60 * 60 * 1000;
  const staleUpdatedAt = new Date(Date.now() - 8 * dayMs).toISOString();
  const freshUpdatedAt = new Date(Date.now() - 2 * dayMs).toISOString();
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
    updatedAt: staleUpdatedAt
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
    updatedAt: freshUpdatedAt
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
    await page.getByText("Send/payment workflow").waitFor({ state: "visible" });
    await page.getByText("Add link before send").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Send invoice INV-SEND-1" }).click();
    await page.getByPlaceholder("client@example.com").fill("client@example.com");
    await page.getByRole("button", { name: "Send now" }).click();
    await page.getByText(/(Sent to|Prepared for) client@example.com/i).waitFor({ state: "visible" });
    await page.getByText(/Tracking (active|recorded)/).waitFor({ state: "visible" });
    const rememberedEmail = await page.evaluate((storageOwnerId) => {
      const raw = window.localStorage.getItem(`invoiceClientMemory::owner:${storageOwnerId}`);
      const entries = raw ? JSON.parse(raw) : [];
      return entries.find((entry: { name?: string }) => entry.name === "Send Client")?.recipientEmail ?? "";
    }, ownerId);
    assert.equal(rememberedEmail, "client@example.com");
    await page.getByRole("button", { name: "Mark opened INV-SEND-1" }).click();
    await page.getByText("Marked as opened. Next: watch for payment before following up again.").waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("invoice library card distinguishes tracked but unopened delivery", async () => {
  const ownerId = "ui-send-unopened-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Tracked Unopened Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-UNOPENED-1",
          issueDate: "2026-05-01",
          dueDate: "2026-05-20",
          customerName: "Tracked Unopened Client",
          currency: "USD",
          paymentLinkUrl: "https://pay.example.com/invoice/INV-UNOPENED-1",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Appliance repair",
              quantity: 1,
              unitPrice: 175,
              amount: 175
            }
          ],
          subtotal: 175,
          total: 175,
          balanceDue: 175
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const invoiceId = String((await saveResponse.json()).invoice?.invoiceId ?? "");
  assert.ok(invoiceId);

  const sendResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      recipientEmail: "tracked-unopened@example.com"
    }
  });
  assert.equal(sendResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const card = page.locator("div").filter({ hasText: "INV-UNOPENED-1" }).first();
    await card.getByText("Best next action").waitFor({ state: "visible" });
    await card.getByText("Check delivery first").waitFor({ state: "visible" });
    await card
      .getByText("This invoice is tracked but still unopened. Confirm the client saw it before you escalate into a reminder.")
      .waitFor({ state: "visible" });
    await card.getByText("Awaiting open").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library overdue unopened invoices prefer resend over reminder", async () => {
  const ownerId = "ui-overdue-unopened-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Overdue Unopened Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-OVERDUE-UNOPENED-1",
          issueDate: "2026-04-15",
          dueDate: "2026-04-20",
          customerName: "Overdue Unopened Client",
          currency: "USD",
          paymentLinkUrl: "https://pay.example.com/invoice/INV-OVERDUE-UNOPENED-1",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Roof patch",
              quantity: 1,
              unitPrice: 240,
              amount: 240
            }
          ],
          subtotal: 240,
          total: 240,
          balanceDue: 240
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const invoiceId = String((await saveResponse.json()).invoice?.invoiceId ?? "");
  assert.ok(invoiceId);

  const sendResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      recipientEmail: "overdue-unopened@example.com"
    }
  });
  assert.equal(sendResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const card = page.locator("div").filter({ hasText: "INV-OVERDUE-UNOPENED-1" }).first();
    await card.getByText("Best next action").waitFor({ state: "visible" });
    await card.getByText("Re-send or confirm delivery").waitFor({ state: "visible" });
    await card
      .getByText("This invoice is overdue, but it still has not been opened. Re-send it or confirm delivery before escalating into a payment reminder.")
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library Billie next-up guide prioritizes follow-up work", async () => {
  const ownerId = "ui-library-next-up-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Guide Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-GUIDE-1",
          issueDate: "2026-03-05",
          dueDate: "2026-03-20",
          customerName: "Guide Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-guide-1",
              type: "labor",
              description: "Guide baseline",
              quantity: 1,
              unitPrice: 190,
              amount: 190
            }
          ],
          subtotal: 190,
          total: 190,
          balanceDue: 190
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const invoiceId = savePayload?.invoice?.invoiceId as string;

  const sendResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      recipientEmail: "guide-follow-up@example.com"
    }
  });
  assert.equal(sendResponse.status(), 200);
  await mutateStoredInvoice(invoiceId, {
    status: "sent",
    updatedAt: "2026-03-01T12:00:00.000Z"
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const nextUp = page.getByTestId("library-billie-next-up");
    await nextUp.waitFor({ state: "visible" });
    await nextUp.getByText("Billie next up").waitFor({ state: "visible" });
    await nextUp.getByText("Follow up on INV-GUIDE-1").waitFor({ state: "visible" });
    await nextUp.getByText("Open balance $190.00").waitFor({ state: "visible" });
    await nextUp.getByRole("button", { name: "Send reminder" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library Billie next-up guide highlights missing tracked delivery for sent invoices", async () => {
  const ownerId = "ui-library-delivery-guide-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Delivery Gap Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-GUIDE-DELIVERY-1",
          issueDate: "2026-05-01",
          dueDate: "2026-05-14",
          customerName: "Delivery Gap Client",
          currency: "USD",
          paymentLinkUrl: "https://pay.example.com/invoice/INV-GUIDE-DELIVERY-1",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Drywall patch",
              quantity: 1,
              unitPrice: 160,
              amount: 160
            }
          ],
          subtotal: 160,
          total: 160,
          balanceDue: 160
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const invoiceId = String((await saveResponse.json()).invoice?.invoiceId ?? "");
  assert.ok(invoiceId);

  const sentResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/status`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      status: "sent"
    }
  });
  assert.equal(sentResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const nextUp = page.getByTestId("library-billie-next-up");
    await nextUp.waitFor({ state: "visible" });
    await nextUp.getByText("Track delivery for INV-GUIDE-DELIVERY-1").waitFor({ state: "visible" });
    await nextUp
      .getByText(
        "This invoice is already marked sent, but delivery is not being tracked yet. Run it through the send flow so reminders and payment follow-up have stronger context."
      )
      .waitFor({ state: "visible" });
    await nextUp.getByRole("button", { name: "Open send flow" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library send composer explains the next handoff step after tracking delivery", async () => {
  const ownerId = "ui-send-next-step-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Send Next Step Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-SEND-NEXT-1",
          issueDate: "2026-05-01",
          dueDate: "2026-05-14",
          customerName: "Send Next Step Client",
          currency: "USD",
          paymentLinkUrl: "https://pay.example.com/invoice/INV-SEND-NEXT-1",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Cabinet repair",
              quantity: 1,
              unitPrice: 190,
              amount: 190
            }
          ],
          subtotal: 190,
          total: 190,
          balanceDue: 190
        }
      }
    }
  });
  assert.equal(saveResponse.status(), 200);
  const invoiceId = String((await saveResponse.json()).invoice?.invoiceId ?? "");
  assert.ok(invoiceId);

  const sentResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/status`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      status: "sent"
    }
  });
  assert.equal(sentResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Send invoice INV-SEND-NEXT-1" }).click();
    await page
      .getByText(
        "After tracking the send, create the client portal so the customer gets the full review-and-pay handoff."
      )
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library prefills send recipient from client memory", async () => {
  const ownerId = "ui-send-memory-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Memory Send Client",
          details: "Memory Send Client",
          recipientEmail: "billing@memory-client.example",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
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
          customerName: "Memory Send Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-SEND-MEMORY",
          issueDate: "2026-04-20",
          customerName: "Memory Send Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-send-memory",
              type: "labor",
              description: "Memory send baseline",
              quantity: 1,
              unitPrice: 145,
              amount: 145
            }
          ],
          subtotal: 145,
          total: 145,
          balanceDue: 145
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Send invoice INV-SEND-MEMORY" }).click();
    await page.getByText("Filled from client memory.").waitFor({ state: "visible" });
    await expectValueEquals(page.getByPlaceholder("client@example.com"), "billing@memory-client.example");
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
    await page.locator('input[placeholder="Description"]:visible').first().waitFor({ state: "visible" });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Mike Johnson");
    assert.equal(await page.getByLabel("Date", { exact: true }).inputValue(), today);
    assert.notEqual(await page.getByLabel("Invoice #").inputValue(), "INV-1001");
    await expectValueContains(page.locator('input[placeholder="Description"]:visible').first(), "Faucet repair");
  } finally {
    await context.close();
  }
});

test("invoice library can start a fresh draft from saved client memory", async () => {
  const ownerId = "ui-library-repeat-memory-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Memory Library Client",
          details: "Memory Library Client\n88 Service Rd",
          defaultNotes: "Preferred gate code: 2468. Payment due on receipt.",
          updatedAt: "2026-05-01T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${initOwnerId}`,
      JSON.stringify([
        {
          description: "Seasonal maintenance visit",
          qty: "3",
          rate: "150",
          clientName: "Memory Library Client",
          usageCount: 6,
          updatedAt: "2026-05-02T12:00:00.000Z"
        }
      ])
    );
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
          customerName: "Memory Library Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LIB-MEMORY-1",
          issueDate: "2026-04-15",
          customerName: "Memory Library Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-lib-memory-1",
              type: "labor",
              description: "One-off visit",
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
  const seedPayload = await seedResponse.json();
  const invoiceId = seedPayload?.invoice?.invoiceId as string;
  await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/status`, {
    headers: {
      "x-invoice-user-id": ownerId,
      "Content-Type": "application/json"
    },
    data: { status: "sent" }
  });

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Saved memory is ready for Memory Library Client.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Start from saved memory for INV-LIB-MEMORY-1" }).click();

    await page.waitForURL(/\/manual$/, { timeout: 10000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Memory Library Client");
    await expectValueContains(page.getByPlaceholder("Client Name"), "88 Service Rd");
    await expectValueEquals(
      page.locator("tbody tr").first().getByPlaceholder("Description", { exact: true }),
      "Seasonal maintenance visit"
    );
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("0", { exact: true }), "3");
    await expectValueEquals(page.locator("tbody tr").first().getByPlaceholder("$0", { exact: true }), "150");
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Preferred gate code: 2468. Payment due on receipt."
    );
    assert.notEqual(await page.getByLabel("Invoice #").inputValue(), "INV-LIB-MEMORY-1");
  } finally {
    await context.close();
  }
});

test("client workspace shows saved services and can start from memory", async () => {
  const ownerId = "ui-client-workspace-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Workspace Client",
          details: "Workspace Client\n123 Front St",
          recipientEmail: "billing@workspace-client.example",
          defaultNotes: "Monthly service visit",
          recurringIntervalDays: 30,
          updatedAt: "2026-05-08T18:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${initOwnerId}`,
      JSON.stringify([
        {
          description: "Quarterly HVAC tune-up",
          qty: "1",
          rate: "225",
          clientName: "Workspace Client",
          usageCount: 3,
          updatedAt: "2026-05-08T18:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceRecurringSchedules::owner:${initOwnerId}`,
      JSON.stringify({
        entries: {
          "workspace-invoice-id": {
            intervalDays: 90,
            nextDueAt: "2026-05-15T00:00:00.000Z",
            autoSendEnabled: true,
            lastAutoSendAt: "2026-05-01T18:00:00.000Z",
            lastAutoSendRecipient: "billing@workspace-client.example",
            autoSendRunCount: 2,
            lastAutoSendMode: "provider"
          }
        }
      })
    );
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
          customerName: "Workspace Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-WORKSPACE-1",
          issueDate: "2026-05-08",
          dueDate: "2026-05-15",
          customerName: "Workspace Client",
          currency: "USD",
          lineItems: [
            {
              id: "workspace-line-1",
              type: "labor",
              description: "Quarterly HVAC tune-up",
              quantity: 1,
              unitPrice: 225,
              amount: 225
            }
          ],
          subtotal: 225,
          total: 225,
          balanceDue: 225
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const partialSeedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Workspace Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-WORKSPACE-PARTIAL-1",
          issueDate: "2026-05-01",
          dueDate: "2026-05-10",
          customerName: "Workspace Client",
          currency: "USD",
          lineItems: [
            {
              id: "workspace-partial-line-1",
              type: "labor",
              description: "Emergency follow-up visit",
              quantity: 1,
              unitPrice: 150,
              amount: 150
            }
          ],
          subtotal: 150,
          total: 150,
          balanceDue: 75,
          paymentRecords: [{ id: "payment-1", amount: 75, paidAt: "2026-05-07", note: "Deposit" }]
        }
      }
    }
  });
  assert.equal(partialSeedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/clients?client=${encodeURIComponent("Workspace Client")}`, {
      waitUntil: "networkidle"
    });
    await page.getByTestId("client-workspace-page").waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Workspace Client" }).waitFor({ state: "visible" });
    await page.getByTestId("client-workspace-services").getByText("Quarterly HVAC tune-up").waitFor({
      state: "visible"
    });
    await page.getByText("Recurring activity").waitFor({ state: "visible" });
    await page.getByText("Recurring schedule ready").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open recurring invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Arm auto-send" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Arm auto-send" }).click();
    await page.getByText("Recurring auto-send armed for billing@workspace-client.example.", {
      exact: false
    }).waitFor({ state: "visible" });
    await page.getByText("2 recurring runs recorded").waitFor({ state: "visible" });
    await page.getByText("Payment progress").waitFor({ state: "visible" });
    await page.getByText("50% complete").waitFor({ state: "visible" });
    await page.getByText("Payment timeline").waitFor({ state: "visible" });
    await page.getByText("Deposit").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open latest with Billie" }).waitFor({ state: "visible" });
    await page.getByTestId("client-workspace-history").getByText("INV-WORKSPACE-1").waitFor({
      state: "visible"
    });

    await page.getByTestId("client-workspace-primary-action").click();
    await page.waitForURL(/\/manual$/, { timeout: 15000 });
    await expectValueContains(page.getByPlaceholder("Client Name"), "Workspace Client");
    await expectValueContains(
      page.locator('input[placeholder="Description"]:visible').first(),
      "Quarterly HVAC tune-up"
    );
  } finally {
    await context.close();
  }
});

test("client workspace gives estimates a safer next action", async () => {
  const ownerId = "ui-client-workspace-estimate-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Estimate Workspace Client",
          details: "Estimate Workspace Client\n55 Quote Rd",
          recipientEmail: "billing@estimate-workspace.example",
          updatedAt: "2026-05-09T18:00:00.000Z"
        }
      ])
    );
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
          customerName: "Estimate Workspace Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          documentType: "estimate",
          invoiceNumber: "EST-WORKSPACE-1",
          issueDate: "2026-05-09",
          dueDate: "2026-05-16",
          customerName: "Estimate Workspace Client",
          currency: "USD",
          lineItems: [
            {
              id: "estimate-workspace-line-1",
              type: "labor",
              description: "Planning visit",
              quantity: 1,
              unitPrice: 180,
              amount: 180
            }
          ],
          subtotal: 180,
          total: 180,
          balanceDue: 180
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/clients?client=${encodeURIComponent("Estimate Workspace Client")}`, {
      waitUntil: "networkidle"
    });
    await page.getByTestId("client-workspace-page").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Convert to invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Convert to invoice" }).click();
    await page.getByText("Converted EST-WORKSPACE-1 into a draft invoice.", { exact: false }).waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("operator dashboard surfaces open balance, recurring work, and repeat-ready clients", async () => {
  const ownerId = "ui-operator-dashboard-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Dashboard Client",
          details: "Dashboard Client\n88 Summary Rd",
          recipientEmail: "billing@dashboard-client.example",
          defaultNotes: "Monthly service plan",
          recurringIntervalDays: 30,
          updatedAt: "2026-05-08T18:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${initOwnerId}`,
      JSON.stringify([
        {
          description: "Monthly service plan",
          qty: "1",
          rate: "140",
          clientName: "Dashboard Client",
          usageCount: 2,
          updatedAt: "2026-05-08T18:00:00.000Z"
        }
      ])
    );
  }, ownerId);

  const saveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Dashboard Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-DASH-1",
          issueDate: "2026-05-08",
          dueDate: "2026-05-15",
          customerName: "Dashboard Client",
          currency: "USD",
          lineItems: [
            {
              id: "dashboard-line-1",
              type: "labor",
              description: "Monthly service plan",
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
  assert.equal(saveResponse.status(), 200);
  const savePayload = await saveResponse.json();
  const invoiceId = savePayload?.invoice?.invoiceId;
  assert.equal(typeof invoiceId, "string");

  const statusResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/status`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      status: "sent"
    }
  });
  assert.equal(statusResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.addInitScript(
      ({ initOwnerId, recurringInvoiceId }) => {
        window.localStorage.setItem(
          `invoiceRecurringSchedules::owner:${initOwnerId}`,
          JSON.stringify({
            entries: {
              [recurringInvoiceId]: {
                intervalDays: 30,
                nextDueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                autoSendRunCount: 3,
                lastAutoSendAt: "2026-05-09T19:00:00.000Z",
                lastAutoSendRecipient: "billing@dashboard-client.example",
                lastAutoSendMode: "provider"
              }
            }
          })
        );
      },
      { initOwnerId: ownerId, recurringInvoiceId: invoiceId }
    );
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    await page.getByTestId("operator-dashboard-page").waitFor({ state: "visible" });
    await page.getByTestId("operator-dashboard-momentum").getByText("Momentum snapshot").waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-momentum").getByText("last week").waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-followups").getByText("INV-DASH-1").waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-recurring").getByText("Dashboard Client").waitFor({
      state: "visible"
    });
    await page.getByRole("button", { name: "Arm auto-send" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Arm auto-send" }).click();
    await page.getByText("Recurring auto-send armed for billing@dashboard-client.example.", {
      exact: false
    }).waitFor({ state: "visible" });
    await page.getByText("3 recurring runs recorded").waitFor({ state: "visible" });
    await page.getByTestId("operator-dashboard-recurring-history").getByText("Dashboard Client").waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-recent-activity").getByText("Dashboard Client").waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-repeat-ready").getByText("Dashboard Client").waitFor({
      state: "visible"
    });
    await page.getByText("$140.00").first().waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("operator dashboard surfaces estimate and action lanes", async () => {
  const ownerId = "ui-operator-dashboard-lanes-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${initOwnerId}`,
      JSON.stringify([
        {
          name: "Estimate Dashboard Client",
          details: "Estimate Dashboard Client\n11 Quote Rd",
          recipientEmail: "billing@estimate-dashboard.example",
          updatedAt: "2026-05-09T18:00:00.000Z"
        }
      ])
    );
  }, ownerId);

  const estimateResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: { "x-invoice-user-id": ownerId },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: { customerName: "Estimate Dashboard Client", workSessions: [], materials: [] },
        finishedInvoice: {
          documentType: "estimate",
          invoiceNumber: "EST-DASH-1",
          issueDate: "2026-05-09",
          customerName: "Estimate Dashboard Client",
          currency: "USD",
          lineItems: [{ id: "est-dash-1", type: "labor", description: "Planning visit", quantity: 1, unitPrice: 200, amount: 200 }],
          subtotal: 200,
          total: 200,
          balanceDue: 200
        }
      }
    }
  });
  assert.equal(estimateResponse.status(), 200);

  const partialResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: { "x-invoice-user-id": ownerId },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: { customerName: "Estimate Dashboard Client", workSessions: [], materials: [] },
        finishedInvoice: {
          invoiceNumber: "INV-DASH-PARTIAL-1",
          issueDate: "2026-05-09",
          dueDate: "2026-05-16",
          customerName: "Estimate Dashboard Client",
          currency: "USD",
          lineItems: [{ id: "inv-dash-1", type: "labor", description: "Repair visit", quantity: 1, unitPrice: 300, amount: 300 }],
          subtotal: 300,
          total: 300,
          balanceDue: 120,
          paymentRecords: [{ id: "payment-1", amount: 180, recordedAt: "2026-05-09", note: "Deposit" }]
        }
      }
    }
  });
  assert.equal(partialResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    await page.getByTestId("operator-dashboard-best-lane").waitFor({ state: "visible" });
    await page.getByTestId("operator-dashboard-momentum").getByText("Estimate conversions").waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-recent-activity").getByText("Estimate Dashboard Client").waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-estimates").getByText("EST-DASH-1").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Convert to invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Convert to invoice" }).click();
    await page.getByText("Converted EST-DASH-1 into a draft invoice.", { exact: false }).waitFor({
      state: "visible"
    });
    await page.getByTestId("operator-dashboard-partials").waitFor({ state: "visible" });
    await page.getByText("Partial payments", { exact: false }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor can save an estimate and show it as an estimate in the library", async () => {
  const ownerId = "ui-estimate-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Set document type to Estimate", exact: true }).click();
    await page.getByRole("heading", { name: "ESTIMATE", exact: true }).waitFor({ state: "visible" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("Kitchen remodel estimate");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("8500");

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save estimate" }).click();
    await page.getByRole("button", { name: "Update saved estimate" }).waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("Estimate").first().waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor can record a partial payment and update the remaining balance", async () => {
  const ownerId = "ui-partial-payment-owner";
  const context = await browser.newContext();
  await context.addInitScript((initOwnerId) => {
    window.localStorage.setItem("invoiceOwnerId", initOwnerId);
  }, ownerId);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("Progress invoice");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("100");

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.getByLabel("Amount", { exact: true }).fill("25");
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByText("Partially paid: $75.00 remaining").waitFor({ state: "visible" });
    await page.getByText("$25.00 received").waitFor({ state: "visible" });
    await page.getByText("Payment progress", { exact: false }).waitFor({ state: "visible" });
    await page.getByText("25% complete", { exact: false }).waitFor({ state: "visible" });
    await page.getByText("$25.00 recorded").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library can convert a saved estimate into a draft invoice", async () => {
  const ownerId = "ui-convert-estimate-owner";
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
          invoiceNumber: "EST-CONVERT-1",
          customerName: "Estimate Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          documentType: "estimate",
          invoiceNumber: "EST-CONVERT-1",
          issueDate: "2026-05-09",
          customerName: "Estimate Client",
          currency: "USD",
          lineItems: [
            {
              id: "estimate-line-1",
              type: "labor",
              description: "Planning and scope",
              quantity: 1,
              unitPrice: 400,
              amount: 400
            }
          ],
          subtotal: 400,
          total: 400,
          balanceDue: 400
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page
      .getByTestId("library-billie-next-up")
      .getByText("Turn EST-CONVERT-1 into billable work")
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Mark approved" }).click();
    await page.getByText("Marked EST-CONVERT-1 as approved.", { exact: false }).waitFor({
      state: "visible"
    });
    await page
      .getByTestId("library-billie-next-up")
      .getByRole("button", { name: "Convert to invoice" })
      .click();
    await page.getByRole("button", { name: "Send invoice EST-CONVERT-1" }).waitFor({ state: "visible" });
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
    await page.getByText("INV-STATUS-1").waitFor({ state: "visible" });
    const card = page.locator("div").filter({ hasText: "INV-STATUS-1" }).first();
    await card.getByText("Draft invoice", { exact: true }).waitFor({ state: "visible" });
    await card.getByText("Draft total: $220.00", { exact: true }).waitFor({ state: "visible" });
    await card.getByText("Next: Open the draft, finish the details, then send or export.").waitFor({ state: "visible" });

    await card.getByRole("button", { name: "Mark sent" }).click();
    await card.locator("span.rounded-full", { hasText: "sent" }).waitFor({ state: "visible" });
    await card.getByText("Sent invoice", { exact: true }).waitFor({ state: "visible" });
    await card.getByText("Open balance: $220.00", { exact: true }).waitFor({ state: "visible" });
    await card
      .getByText("Next: Sent. Add a recipient to track delivery or reminders.")
      .waitFor({ state: "visible" });

    await card.getByRole("button", { name: "Mark paid" }).click();
    await card.locator("span.rounded-full", { hasText: "paid" }).waitFor({ state: "visible" });
    await card.getByText("Paid invoice", { exact: true }).waitFor({ state: "visible" });
    await card.getByText("Paid and closed").waitFor({ state: "visible" });
    await card.getByText("Next: Paid and closed. Reuse it for the next similar job or set a cadence.").waitFor({ state: "visible" });

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
    assert.equal(savedInvoice.balanceDue, 0);
  } finally {
    await context.close();
  }
});

test("invoice library card surfaces a best next action for sent invoices", async () => {
  const ownerId = "ui-library-card-next-action-owner";
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
          customerName: "Card Next Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-CARD-NEXT-1",
          issueDate: "2026-04-15",
          customerName: "Card Next Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-card-next-1",
              type: "labor",
              description: "Card next baseline",
              quantity: 1,
              unitPrice: 160,
              amount: 160
            }
          ],
          subtotal: 160,
          total: 160,
          balanceDue: 160
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);
  const seedPayload = await seedResponse.json();
  const invoiceId = seedPayload?.invoice?.invoiceId as string;

  const sendResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      recipientEmail: "card-next@example.com"
    }
  });
  assert.equal(sendResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const card = page.locator("div").filter({ hasText: "INV-CARD-NEXT-1" }).first();
    await card.getByText("Best next action").waitFor({ state: "visible" });
    await card.getByText("Open and add payment link").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library card highlights a missing client portal after the payment link is ready", async () => {
  const ownerId = "ui-library-card-portal-owner";
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
          customerName: "Portal Gap Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-CARD-PORTAL-1",
          issueDate: "2026-05-02",
          dueDate: "2026-05-22",
          customerName: "Portal Gap Client",
          currency: "USD",
          paymentLinkUrl: "https://pay.example.com/invoice/INV-CARD-PORTAL-1",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Deck repair",
              quantity: 1,
              unitPrice: 180,
              amount: 180
            }
          ],
          subtotal: 180,
          total: 180,
          balanceDue: 180,
          status: "sent"
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const card = page.locator("div").filter({ hasText: "INV-CARD-PORTAL-1" }).first();
    await card.getByText("Best next action").waitFor({ state: "visible" });
    await card.getByText("Create client portal").waitFor({ state: "visible" });
    await card
      .getByText("The payment link is ready. Add the portal so the customer also gets a clear review surface before paying.")
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library resend flow reports a re-send notice for tracked delivery invoices", async () => {
  const ownerId = "ui-library-resend-owner";
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
          customerName: "Re-send Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-RESEND-1",
          issueDate: "2026-05-05",
          dueDate: "2026-05-20",
          customerName: "Re-send Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Follow-up service call",
              quantity: 1,
              unitPrice: 180,
              amount: 180
            }
          ],
          subtotal: 180,
          total: 180,
          balanceDue: 180
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);
  const seedPayload = await seedResponse.json();
  const invoiceId = seedPayload?.invoice?.invoiceId as string;

  const firstSendResponse = await context.request.post(`${baseUrl}/api/invoices/${invoiceId}/send`, {
    headers: {
      "x-invoice-user-id": ownerId
    },
    data: {
      recipientEmail: "resend@example.com"
    }
  });
  assert.equal(firstSendResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const card = page.locator("div").filter({ hasText: "INV-RESEND-1" }).first();
    await card.getByRole("button", { name: /Resend invoice|Re-send invoice/ }).click();
    await page
      .getByText(/Invoice re-sent to resend@example\.com|Re-send recorded for resend@example\.com/)
      .waitFor({ state: "visible" });
    await page.getByText("Next: add the hosted payment link so the resent invoice is easier to pay.").waitFor({
      state: "visible"
    });
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
    await page.getByText("INV-PAY-LINK-1").waitFor({ state: "visible" });
    await page.getByText("Send/payment workflow").waitFor({ state: "visible" });
    await page.getByText("Hosted link ready").waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Open hosted payment link" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("invoice library can create a client portal and copy a saved invoice share pack", async () => {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-library-handoff-owner");
    window.__copiedSharePack = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.__copiedSharePack = text;
        }
      }
    });
  });
  const seedResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
    headers: {
      "x-invoice-user-id": "ui-library-handoff-owner"
    },
    data: {
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Portal Handoff Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-LIB-HANDOFF-1",
          issueDate: "2026-05-07",
          dueDate: "2026-05-14",
          customerName: "Portal Handoff Client",
          currency: "USD",
          paymentLinkUrl: "https://pay.example.com/invoice/INV-LIB-HANDOFF-1",
          notes: "Please include the gate code on arrival.",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Fence repair visit",
              quantity: 1,
              unitPrice: 220,
              amount: 220
            }
          ],
          subtotal: 220,
          total: 220,
          balanceDue: 220,
          status: "sent"
        }
      }
    }
  });
  assert.equal(seedResponse.status(), 200);

  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    await page.getByText("INV-LIB-HANDOFF-1", { exact: true }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Create client portal" }).click();
    await page.getByText("Client portal is ready. Open it or include it in the share pack.").waitFor({
      state: "visible"
    });

    const portalLink = page.getByRole("link", { name: "Open client portal" });
    await portalLink.waitFor({ state: "visible" });
    const portalHref = await portalLink.getAttribute("href");
    assert.match(portalHref ?? "", /^https?:\/\/[^/]+\/portal\/[0-9a-f-]{36}\/.+$/);

    await page.getByRole("button", { name: "Copy share pack" }).click();
    await page.getByText("Share pack copied. Paste it into email or chat.").waitFor({ state: "visible" });

    const copiedSharePack = await page.evaluate(async () => {
      if (window.__copiedSharePack) {
        return window.__copiedSharePack;
      }
      try {
        return (await navigator.clipboard.readText()) || "";
      } catch {
        return window.__copiedSharePack ?? "";
      }
    });
    assert.match(String(copiedSharePack), /INV-LIB-HANDOFF-1/);
    assert.match(String(copiedSharePack), /Payment link: https:\/\/pay\.example\.com\/invoice\/INV-LIB-HANDOFF-1/);
    assert.match(String(copiedSharePack), /Client portal: https?:\/\/[^/]+\/portal\/[0-9a-f-]{36}\/.+/);
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("faucet repair");
    await page.getByPlaceholder("Client Name").fill("Mike Johnson\n1423 Pine St");
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await getPrimaryIntakeBuildButton(page).click();
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
    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    await page.getByText("Recent for Mike Johnson").waitFor({ state: "visible" });
    await page.getByText("INV-RECENT-1", { exact: true }).first().waitFor({ state: "visible" });
    await page.getByText("Collect a 50% deposit before ordering cedar shingles.", { exact: true }).first().waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("review details surfaces repeat-work memory without changing parsed draft amounts", async () => {
  useMockResponses([
    {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Fixed sink", hours: 1, rate: 90, amount: 90 }]
        }
      ],
      materials: []
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-review-repeat-work-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Kitchen faucet repair service",
          qty: "2",
          rate: "145",
          clientName: "Mike Johnson",
          usageCount: 3,
          updatedAt: "2026-04-18T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 2h at $80/hr for Mike Johnson.");
    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    const repeatWorkCard = page.getByTestId("review-repeat-work-card");
    await repeatWorkCard.waitFor({ state: "visible" });
    await repeatWorkCard.getByText("Repeat work cues").waitFor({ state: "visible" });
    await repeatWorkCard.getByText("Matched draft lines").waitFor({ state: "visible" });
    await repeatWorkCard.getByText("Saved services").waitFor({ state: "visible" });
    await repeatWorkCard.getByText("Current draft rate: $90.00/hr · Qty 1").waitFor({
      state: "visible"
    });
    await repeatWorkCard
      .getByText(
        "Last time you billed Mike Johnson for Kitchen faucet repair service, the rate was $145.00/hr, qty 2."
      )
      .waitFor({ state: "visible" });
    await repeatWorkCard
      .getByTestId("review-rate-memory-line_1")
      .getByText("Replace wording only. Current rate and quantity stay locked.")
      .waitFor({ state: "visible" });
    await repeatWorkCard.getByText("Saved client match").waitFor({ state: "visible" });
    await repeatWorkCard.getByTestId("review-apply-saved-wording-line_1").click();
    await page.locator("form.fixed").getByText("✓ Numbers unchanged").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-sm.font-semibold.text-slate-800")).some(
        (node) => node.textContent?.trim() === "Kitchen faucet repair service"
      )
    );
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("p.text-xs.text-slate-500")).some((node) =>
        (node.textContent ?? "").includes("1h × $90.00/hr • $90.00")
      )
    );
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page.locator("form.fixed").getByText("Undid last Billie change").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();
    await repeatWorkCard.getByTestId("review-apply-saved-wording-line_1").waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("review details can apply a prior client note without changing numbers", { timeout: 90000 }, async () => {
  useMockResponses([
    {
      customerName: "Note Memory Client",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Faucet repair", hours: 1, rate: 90, amount: 90 }]
        }
      ],
      materials: [],
      notes: "Thanks."
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-review-client-note-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Note Memory Client",
          details: "Note Memory Client",
          defaultNotes: "Payment due on receipt. Thanks for trusting us with the work.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/recent-context?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ matches: [] })
      });
    });
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 1h at $90/hr for Note Memory Client.");
    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    await page.getByText("Saved in client memory").waitFor({ state: "visible" });
    await page.getByText("Suggested notes").waitFor({ state: "visible" });
    await page.getByTestId("review-apply-saved-note-client-memory-note").waitFor({ state: "visible" });
    await page
      .getByText("Payment due on receipt. Thanks for trusting us with the work.")
      .waitFor({ state: "visible" });
    await page.getByTestId("review-apply-saved-note-client-memory-note").click();
    await page.locator("form.fixed").getByText("✓ Numbers unchanged").waitFor({ state: "visible" });

    await page.getByRole("button", { name: /show review details/i }).click();
    await page
      .getByText("Payment due on receipt. Thanks for trusting us with the work.")
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo last Billie change" }).click();
    await page.locator("form.fixed").getByText("Undid last Billie change").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();
    await page.getByTestId("review-apply-saved-note-client-memory-note").waitFor({
      state: "visible"
    });
  } finally {
    await context.close();
  }
});

test("review details labels client-memory and recent invoice notes separately", async () => {
  useMockResponses([
    {
      customerName: "Repeat Note Client",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Faucet repair", hours: 1, rate: 90, amount: 90 }]
        }
      ],
      materials: [],
      notes: "Thanks."
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-review-note-labels-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Repeat Note Client",
          details: "Repeat Note Client",
          defaultNotes: "Payment due on receipt.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/recent-context?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matches: [
            {
              invoiceId: "prior-205",
              invoiceNumber: "INV-205",
              notes: "Please reference the signed scope from April 12."
            }
          ]
        })
      });
    });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 1h at $90/hr for Repeat Note Client.");
    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    await page.getByText("Saved in client memory").waitFor({ state: "visible" });
    await page.getByText("Recent invoice INV-205").waitFor({ state: "visible" });
    await page.getByTestId("review-apply-saved-note-client-memory-note").waitFor({ state: "visible" });
    await page.getByTestId("review-apply-saved-note-recent-note-prior-205").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("review details can append a saved note without changing numbers", async () => {
  useMockResponses([
    {
      customerName: "Append Note Client",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Faucet repair", hours: 1, rate: 90, amount: 90 }]
        }
      ],
      materials: [],
      notes: ""
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
    await context.addInitScript(() => {
      const ownerId = "ui-review-append-note-owner";
      window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Append Note Client",
          details: "Append Note Client",
          defaultNotes: "Customer prefers text updates.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/recent-context?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matches: [
            {
              invoiceId: "prior-207",
              invoiceNumber: "INV-207",
              notes: "Payment due on receipt."
            }
          ]
        })
      });
    });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 1h at $90/hr for Append Note Client.");
    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    await page
      .getByTestId("review-apply-saved-note-client-memory-note")
      .click();
    await page.locator("form.fixed").getByText("Numbers unchanged").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();
    await page
      .getByTestId("review-append-saved-note-recent-note-prior-207")
      .click();
    await page.locator("form.fixed").getByText("Numbers unchanged").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Generate Invoice" }).click();
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Customer prefers text updates.\nPayment due on receipt."
    );
  } finally {
    await context.close();
  }
});

test("review details append upgrades structured note wording instead of stacking it", async () => {
  useMockResponses([
    {
      customerName: "Structured Append Client",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Faucet repair", hours: 1, rate: 90, amount: 90 }]
        }
      ],
      materials: [],
      notes: ""
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-review-structured-append-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceClientMemory::owner:${ownerId}`,
      JSON.stringify([
        {
          name: "Structured Append Client",
          details: "Structured Append Client",
          defaultNotes: "Customer prefers text updates.",
          updatedAt: "2026-04-20T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/recent-context?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matches: [
            {
              invoiceId: "prior-209",
              invoiceNumber: "INV-209",
              notes: "Payment due on receipt."
            }
          ]
        })
      });
    });

    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet 1h at $90/hr for Structured Append Client.");
    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    await page
      .getByTestId("review-apply-saved-note-client-memory-note")
      .click();
    await page.locator("form.fixed").getByText("Numbers unchanged").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();
    await page
      .getByTestId("review-append-saved-note-recent-note-prior-209")
      .click();
    await page.locator("form.fixed").getByText("Numbers unchanged").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Generate Invoice" }).click();
    await expectValueEquals(
      page.getByPlaceholder("Thank you for your business"),
      "Customer prefers text updates.\nPayment due on receipt."
    );
  } finally {
    await context.close();
  }
});

test("review details shows saved wording actions for multiple matched lines", { timeout: 90000 }, async () => {
  useMockResponses([
    {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [
            { description: "Fixed sink", hours: 1, rate: 90, amount: 90 },
            { description: "Drain cleaning", hours: 2, rate: 110, amount: 220 }
          ]
        }
      ],
      materials: []
    },
    emptyAudit()
  ]);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-review-multi-repeat-work-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Kitchen faucet repair service",
          qty: "2",
          rate: "145",
          clientName: "Mike Johnson",
          usageCount: 3,
          updatedAt: "2026-04-18T12:00:00.000Z"
        },
        {
          description: "Main line drain cleaning service",
          qty: "2",
          rate: "175",
          clientName: "Mike Johnson",
          usageCount: 2,
          updatedAt: "2026-04-19T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await openIntake(page);
    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill("Jan 30 fixed faucet and cleaned drain for Mike Johnson.");
    await getPrimaryIntakeBuildButton(page).click();
    await page.getByRole("button", { name: "Generate Invoice" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /show review details/i }).click();

    const repeatWorkCard = page.getByTestId("review-repeat-work-card");
    await repeatWorkCard.waitFor({ state: "visible" });
    await repeatWorkCard
      .getByText(
        "Last time you billed Mike Johnson for Kitchen faucet repair service, the rate was $145.00/hr, qty 2."
      )
      .waitFor({ state: "visible" });
    await repeatWorkCard
      .getByText(
        "Last time you billed Mike Johnson for Main line drain cleaning service, the rate was $175.00/hr, qty 2."
      )
      .waitFor({ state: "visible" });
    await repeatWorkCard
      .getByTestId("review-rate-memory-line_1")
      .getByText("Replace wording only. Current rate and quantity stay locked.")
      .waitFor({ state: "visible" });
    await repeatWorkCard.getByTestId("review-apply-saved-wording-line_1").waitFor({
      state: "visible"
    });
    await repeatWorkCard.getByTestId("review-apply-saved-wording-line_2").waitFor({
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("90");
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.evaluate(() => {
      window.localStorage.removeItem("invoiceDraft::owner:ui-line-item-library-owner");
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Saved items (1)" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Saved items (1)" }).click();
    await page.getByRole("button", { name: "Insert saved item Faucet repair" }).click();

    await expectValueContains(page.locator('input[placeholder="Description"]:visible').first(), "Faucet repair");
    assert.equal(await page.locator('input[placeholder="0"]:visible').first().inputValue(), "1");
    assert.equal(await page.locator('input[placeholder="$0"]:visible').first().inputValue(), "90");
  } finally {
    await context.close();
  }
});

test("manual line items can be saved directly into service memory", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-direct-service-memory-owner");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("Boiler tune-up");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("145");
    const saveServiceButton = page.getByRole("button", { name: "Save current service" });
    await saveServiceButton.waitFor({ state: "visible" });
    await saveServiceButton.click();
    await page.getByRole("button", { name: "Saved items (1)" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Saved items (1)" }).click();
    await page.getByRole("button", { name: "Insert saved item Boiler tune-up" }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("service catalog settings shows saved services and supports deletion", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const ownerId = "ui-service-catalog-owner";
    window.localStorage.setItem("invoiceOwnerId", ownerId);
    window.localStorage.setItem(
      `invoiceLineItemLibrary::owner:${ownerId}`,
      JSON.stringify([
        {
          description: "Boiler tune-up",
          qty: "1",
          rate: "145",
          clientName: "River House",
          usageCount: 2,
          updatedAt: "2026-04-18T12:00:00.000Z"
        }
      ])
    );
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/settings/services`, { waitUntil: "networkidle" });
    await page.getByText("Review and reuse your service catalog").waitFor({ state: "visible" });
    await page.getByText("Boiler tune-up").waitFor({ state: "visible" });
    await page.getByText("River House").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Delete saved service Boiler tune-up" }).click();
    await page.getByText("No saved services yet.").waitFor({ state: "visible" });
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Leak inspection");
    await page.getByTestId("manual-recommended-saved-items").waitFor({ state: "visible" });
    const recommendedSavedItem = page
      .getByTestId("manual-recommended-saved-items")
      .locator('button[aria-label="Insert recommended saved item Leak inspection service"]')
      .filter({ hasText: "Mike Johnson" })
      .first();
    await recommendedSavedItem.waitFor({ state: "visible" });
    await recommendedSavedItem.getByText("Mike Johnson").waitFor({ state: "visible" });
    await recommendedSavedItem.getByText("Client match").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Saved items (2)" }).waitFor({ state: "visible" });
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Leak inspection of roof flashing");

    await page
      .locator('[data-testid="manual-rate-memory-line-1"]:visible')
      .getByText(
        "Last time you billed Mike Johnson for Leak inspection service, the rate was $155.00/hr, qty 1."
      )
      .waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: /Apply suggested rate \$155\.00 to line 1/i })
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: /Apply suggested rate \$155\.00 to line 1/i }).click();

    assert.equal(await page.locator('input[placeholder="$0"]:visible').first().inputValue(), "155");
  } finally {
    await context.close();
  }
});

test("manual editor export summarizes send readiness", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Riley Homeowner");
    await page.locator('input[placeholder="Description"]:visible').first().fill("Faucet repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("90");
    await page.getByRole("button", { name: "Export" }).last().click();

    await page.getByText("Send-ready check").waitFor({ state: "visible" });
    await page.getByText("Ready to send").waitFor({ state: "visible" });
    await page.getByText("Client added").waitFor({ state: "visible" });
    await page.getByText("Billable item added").waitFor({ state: "visible" });
    await page.getByText("$90.00 total").waitFor({ state: "visible" });
    await page.getByText("Optional but helpful").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual editor send and payment handoff updates after save", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Client Name").fill("Handoff Client");
    await page.locator('input[placeholder="Description"]:visible').first().fill("Deck repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("210");

    const handoff = page.getByTestId("manual-send-payment-handoff");
    await handoff.waitFor({ state: "visible" });
    await handoff.getByText("Ready").waitFor({ state: "visible" });
    await handoff.getByText("Save before links").waitFor({ state: "visible" });
    await handoff.getByRole("button", { name: "Save draft" }).click();

    await handoff.getByText("Saved to library").waitFor({ state: "visible" });
    await handoff.getByText("Create link").waitFor({ state: "visible" });
    await handoff.getByText("Create portal").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Open library" }).first().waitFor({ state: "visible" });
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("sink repair");
    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();

    await page.getByText("Sign in required to save invoices.").waitFor({ state: "visible" });
    await page
      .getByText("Use launcher sign-in to send yourself an email link, then retry save here.")
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Go to launcher sign-in" }).click();
    await page.getByText("After sign-in, you'll return to the invoice editor.").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Email sign-in link" }).waitFor({ state: "visible" });
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Second invoice");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("120");
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

test("manual editor shows billing completion notice and clears billing query param", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/manual?billing=success`, { waitUntil: "networkidle" });
    await page
      .getByText("Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription.")
      .waitFor({ state: "visible" });
    await waitForCondition(() => !new URL(page.url()).searchParams.has("billing"), {
      timeoutMs: 2000,
      message: "Billing query param should be removed after manual notice renders."
    });
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
    await page.locator('input[placeholder="Description"]:visible').first().fill("Roof leak repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("180");

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Mark sent" }).click();
    await page.getByText("Status: sent").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Mark paid" }).click();
    await page.getByText("Status: paid").waitFor({ state: "visible" });

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

test("manual export panel can create a hosted payment link for a saved invoice", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-manual-payment-link-owner");
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/*/payment-link", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          paymentLinkUrl: "https://pay.stripe.test/plink_manual_123"
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("Skylight repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("260");

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Create hosted payment link" }).click();
    await expectValueEquals(
      page.locator("#payment-link-url"),
      "https://pay.stripe.test/plink_manual_123"
    );
    await page.getByRole("link", { name: "Open hosted payment link" }).first().waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual payment link fallback explains when hosted billing is not configured", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-manual-payment-link-fallback-owner");
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/*/payment-link", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Stripe invoice payments are not configured yet."
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("Skylight repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("260");

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Create hosted payment link" }).click();
    await page
      .getByText(
        "Hosted payment links are not configured on this build yet. You can still share the client portal, copy the share pack, or send the invoice manually."
      )
      .waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("manual export panel can create a client portal link for a saved invoice", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("invoiceOwnerId", "ui-manual-client-portal-owner");
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/invoices/*/client-portal-link", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          clientPortalUrl: "https://app.notebill.app/portal/123e4567-e89b-12d3-a456-426614174000/token123",
          invoice: {
            invoiceData: {
              finishedInvoice: {
                portalAccessToken: "token123"
              }
            }
          }
        })
      });
    });

    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.locator('input[placeholder="Description"]:visible').first().fill("Window repair");
    await page.locator('input[placeholder="0"]:visible').nth(1).fill("1");
    await page.locator('input[placeholder="$0"]:visible').first().fill("175");

    await page.getByRole("button", { name: "Export" }).last().click();
    await page.getByText("Save to library").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Save invoice" }).click();
    await page.getByRole("button", { name: "Update saved invoice" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Create client portal" }).click();
    await page.getByRole("link", { name: "Open client portal" }).first().waitFor({ state: "visible" });
    const portalHref = await page.getByRole("link", { name: "Open client portal" }).first().getAttribute("href");
    assert.match(
      portalHref ?? "",
      /^https?:\/\/[^/]+\/portal\/[0-9a-f-]{36}\/token123$/
    );
  } finally {
    await context.close();
  }
});

test("client portal highlights payment status, notes, and customer history", async () => {
  const context = await browser.newContext();
  const ownerId = "ui-client-portal-owner";
  try {
    const firstSaveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
      headers: { "x-invoice-user-id": ownerId },
      data: {
        confirmSave: true,
        sourceType: "text_input",
        invoiceData: {
          structuredInvoice: {
            customerName: "V2 Portal Client",
            workSessions: [],
            materials: []
          },
          finishedInvoice: {
            invoiceNumber: "INV-V2-PORTAL-1",
            issueDate: "2026-05-01",
            customerName: "V2 Portal Client",
            currency: "USD",
            lineItems: [
              {
                id: "portal-ui-line-1",
                type: "labor",
                description: "Earlier site visit",
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
    assert.equal(firstSaveResponse.status(), 200);

    const secondSaveResponse = await context.request.post(`${baseUrl}/api/invoices/save`, {
      headers: { "x-invoice-user-id": ownerId },
      data: {
        confirmSave: true,
        sourceType: "text_input",
        invoiceData: {
          structuredInvoice: {
            customerName: "V2 Portal Client",
            workSessions: [],
            materials: []
          },
          finishedInvoice: {
            invoiceNumber: "INV-V2-PORTAL-2",
            issueDate: "2026-05-05",
            dueDate: "2026-05-12",
            customerName: "V2 Portal Client",
            currency: "USD",
            lineItems: [
              {
                id: "portal-ui-line-2",
                type: "labor",
                description: "Finish trim and cleanup",
                quantity: 2,
                unitPrice: 125,
                amount: 250
              }
            ],
            subtotal: 250,
            total: 250,
            balanceDue: 250,
            paymentLinkUrl: "https://pay.stripe.test/plink_portal_ui",
            notes: "Payment due on receipt. Thank you for the quick turnaround."
          }
        }
      }
    });
    assert.equal(secondSaveResponse.status(), 200);
    const secondInvoiceId = String((await secondSaveResponse.json()).invoice?.invoiceId ?? "");
    assert.ok(secondInvoiceId);

    const portalResponse = await context.request.post(`${baseUrl}/api/invoices/${secondInvoiceId}/client-portal-link`, {
      headers: { "x-invoice-user-id": ownerId },
      data: {}
    });
    assert.equal(portalResponse.status(), 200);
    const portalUrl = String((await portalResponse.json()).clientPortalUrl ?? "");
    assert.ok(portalUrl);

    const page = await context.newPage();
    await page.goto(portalUrl, { waitUntil: "networkidle" });

    await page.getByText("Payment status", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Ready for payment" }).waitFor({ state: "visible" });
    await page
      .getByText("Pay securely online now, or review the line items and notes before paying.")
      .waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Pay online" }).first().waitFor({ state: "visible" });
    await page.getByText("Notes and terms", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Payment due on receipt. Thank you for the quick turnaround.").waitFor({ state: "visible" });
    await page.getByText("INV-V2-PORTAL-1", { exact: true }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

test("diagnostics route shows launch, billing, delivery, and telemetry panels", async () => {
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
    await page.getByRole("heading", { name: "Revenue signals" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Feature adoption" }).waitFor({ state: "visible" });
    await page.getByText("Paid-plan readiness").waitFor({ state: "visible" });
    await page.getByText("Service savers", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Scratchpad owners", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "OCR confidence" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Trend baseline" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Flow friction checks" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Launch readiness" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Persistence migration" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Billing diagnostics" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "Delivery diagnostics" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Send launch test email" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Preview due reminders" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Run reminders now" }).waitFor({ state: "visible" });
    await page.getByText("No legacy file-store invoices detected.").waitFor({ state: "visible" });
    await page.getByText("single primary action on paste").waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
});

async function openIntake(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
  // Ready when the primary job-notes textarea is available for user input.
  await page.getByPlaceholder(/Example: Jan 10 fixed sink/i).waitFor({ state: "visible" });
}

/** Primary paste-panel Build invoice control (excludes intake-billie-next-up chips). */
function getPrimaryIntakeBuildButton(page: Page): Locator {
  const intakeRegion = page.locator("div.nb-surface").filter({
    has: page.getByPlaceholder(/Example: Jan 10 fixed sink/i)
  });
  return intakeRegion.getByRole("button", {
    name: "Build invoice",
    exact: true
  });
}

/** Sticky review/decision column CTA (excludes intake-billie-next-up chips). */
function getPrimaryIntakeStickyButton(page: Page, name: string): Locator {
  return page.locator("div.nb-sticky-panel").getByRole("button", {
    name,
    exact: true
  });
}

/** Intake action button outside the Billie next-up suggestion chrome. */
function getIntakeButtonOutsideNextUp(page: Page, name: string): Locator {
  return page.locator(
    `xpath=//button[normalize-space()=${JSON.stringify(name)} and not(ancestor::*[@data-testid="intake-billie-next-up"])]`
  );
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
  updates: Partial<Pick<SavedInvoice, "status" | "updatedAt">>
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

async function openDailyScratchpad(page: Page) {
  await page.goto(`${baseUrl}/scratchpad`, { waitUntil: "domcontentloaded" });
  const heading = page.getByRole("heading", { name: "Capture work fast. Invoice later." });
  try {
    await heading.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await heading.waitFor({ state: "visible", timeout: 10000 });
  }
  await scratchpadNoteEditor(page).waitFor({ state: "visible" });
}

async function openLauncher(page: Page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const scratchpadButton = page.getByRole("button", { name: "Open scratchpad" });
  try {
    await scratchpadButton.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await scratchpadButton.waitFor({ state: "visible", timeout: 10000 });
  }
}

function scratchpadNoteEditor(page: Page) {
  return page.locator("#scratchpad-note");
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

async function expectAttributeEquals(
  locator: Locator,
  attributeName: string,
  expectedValue: string,
  timeoutMs = 5000
) {
  await locator.waitFor({ state: "visible" });
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentValue = await locator.getAttribute(attributeName);
    if (currentValue === expectedValue) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const finalValue = await locator.getAttribute(attributeName);
  throw new Error(
    `Expected attribute "${attributeName}" to equal "${expectedValue}" but got "${finalValue}".`
  );
}
