import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PLAY_ASSET_BASE_URL ?? process.env.APP_BASE_URL ?? "https://app.notebill.app";
const outputDir = path.resolve("marketing", "apple-app-store");
const screenshotWidth = 430;
const screenshotHeight = 932;
const screenshotScale = 3;
const rawScreenshotPrefix = "__raw__";

const demoSessionToken = "app-store-demo-token";
const demoAuthSession = {
  userId: "app-store-owner",
  email: "hello@notebill.app",
  expiresAt: "2026-12-31T00:00:00.000Z"
};

const accountPlanPayload = {
  tier: "pro",
  billing: {
    provider: "stripe",
    checkoutAvailable: true,
    portalAvailable: true
  },
  limits: {
    invoicesPerMonth: null
  },
  usage: {
    invoicesCreated: 24,
    invoicesRemaining: null
  }
};

const libraryInvoicesPayload = {
  invoices: [
    {
      invoiceId: "inv-store-001",
      ownerId: "app-store-owner",
      sourceType: "text_input",
      status: "sent",
      updatedAt: "2026-04-12T18:22:00.000Z",
      createdAt: "2026-04-12T17:59:00.000Z",
      invoiceNumber: "INV-2048",
      customerName: "North Shore Fitness",
      total: 240,
      balanceDue: 240,
      paymentLinkUrl: "https://pay.notebill.app/i/INV-2048",
      delivery: {
        mode: "provider",
        recipientEmail: "billing@northshorefitness.example",
        sentAt: "2026-04-12T18:31:00.000Z",
        status: "opened",
        openedAt: "2026-04-12T19:08:00.000Z"
      },
      invoiceData: {
        finishedInvoice: {
          invoiceNumber: "INV-2048",
          issueDate: "2026-04-12",
          dueDate: "2026-04-20",
          customerName: "North Shore Fitness",
          currency: "USD",
          paymentLinkUrl: "https://pay.notebill.app/i/INV-2048",
          lineItems: [
            {
              id: "line-1",
              type: "labor",
              description: "Equipment maintenance and calibration",
              quantity: 2,
              unitPrice: 120,
              amount: 240
            }
          ],
          subtotal: 240,
          total: 240,
          balanceDue: 240
        }
      }
    },
    {
      invoiceId: "inv-store-002",
      ownerId: "app-store-owner",
      sourceType: "text_input",
      status: "paid",
      updatedAt: "2026-04-10T15:14:00.000Z",
      createdAt: "2026-04-10T14:50:00.000Z",
      invoiceNumber: "INV-2044",
      customerName: "Harbor Electrical",
      total: 185,
      balanceDue: 0,
      invoiceData: {
        finishedInvoice: {
          invoiceNumber: "INV-2044",
          issueDate: "2026-04-10",
          customerName: "Harbor Electrical",
          currency: "USD",
          lineItems: [
            {
              id: "line-2",
              type: "labor",
              description: "Panel labeling and safety check",
              quantity: 1,
              unitPrice: 185,
              amount: 185
            }
          ],
          subtotal: 185,
          total: 185,
          balanceDue: 0
        }
      }
    }
  ]
};

const manualDraft = {
  invoiceNumber: "INV-2052",
  invoiceDate: "2026-04-17",
  fromDetails: "NoteBill Demo Co.\n(555) 014-2211\ninvoices@notebill.app",
  billToDetails: "Oak & Pine Renovations\nAttn: Megan Torres\nmegan@oakpine.example",
  dueDate: "2026-04-24",
  notes: "Payment due within 7 days.\nThank you for the opportunity to support your spring service call.",
  taxRate: "5",
  discountAmount: "0",
  paymentLinkUrl: "https://pay.notebill.app/i/INV-2052",
  portalAccessToken: "portal-demo-2052",
  lineItems: [
    { id: "line-1", description: "Site visit and scope review", qty: "1", rate: "95" },
    { id: "line-2", description: "Fixture replacement labor", qty: "3", rate: "120" },
    { id: "line-3", description: "Materials and fittings", qty: "1", rate: "86" }
  ],
  stylePreset: "default",
  spacingDensity: "balanced",
  headerLayout: "split",
  logoVisible: true,
  notesVisible: true,
  accentColor: "#093064",
  savedInvoiceId: "inv-store-2052",
  savedInvoiceStatus: "draft"
};

function buildContextOptions() {
  return {
    viewport: { width: screenshotWidth, height: screenshotHeight },
    deviceScaleFactor: screenshotScale,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light"
  };
}

function seedDemoIdentity() {
  window.localStorage.setItem("invoiceOwnerId", "app-store-owner");
  window.localStorage.setItem("invoiceSessionToken", "app-store-demo-token");
  window.localStorage.setItem(
    "invoiceAuthSession",
    JSON.stringify({
      userId: "app-store-owner",
      email: "hello@notebill.app",
      expiresAt: "2026-12-31T00:00:00.000Z"
    })
  );
}

async function routeCommon(page, options = {}) {
  const invoicesPayload = options.invoicesPayload ?? { invoices: [] };
  await page.route("**/api/auth/session*", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: demoAuthSession })
      });
      return;
    }
    if (method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: demoSessionToken, session: demoAuthSession })
      });
      return;
    }
    if (method === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/system/persistence*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authRequired: true })
    });
  });
  await page.route("**/api/account/plan*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(accountPlanPayload)
    });
  });
  await page.route("**/api/invoices/recent-context*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ invoices: [] })
    });
  });
  await page.route("**/api/invoices/reminders/run*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dueCount: 0,
        scannedCount: invoicesPayload.invoices?.length ?? 0,
        reminders: []
      })
    });
  });
  await page.route("**/api/invoices*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(invoicesPayload)
    });
  });
}

async function ensureOutputDir() {
  await fs.mkdir(outputDir, { recursive: true });
}

function buildRawScreenshotPath(filename) {
  return path.join(outputDir, `${rawScreenshotPrefix}${filename}`);
}

async function captureLauncher(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(seedDemoIdentity);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByText("Billie drafts fast. You approve the money.").waitFor({ state: "visible" });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.getByText("Internal diagnostics").evaluate((element) => {
      element.style.display = "none";
    }).catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: buildRawScreenshotPath("ios-01-launcher.png"), fullPage: false });
  } finally {
    await context.close();
  }
}

async function captureQuickIntake(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(seedDemoIdentity);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/ai-intake?mode=quick`, { waitUntil: "networkidle" });
    const notesInput = page.locator("textarea").first();
    await notesInput.waitFor({ state: "visible" });
    await notesInput.fill(
      [
        "April 17 service visit for North Shore Fitness.",
        "Replace lobby lighting ballast and re-secure ceiling trim.",
        "3 hours labor at 120/hour.",
        "Materials 86 dollars.",
        "Need invoice sent to megan@oakpine.example."
      ].join("\n")
    );
    await notesInput.blur();
    await page.locator('[data-testid="intake-billie-next-up"]').evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: Math.max(top, 0), behavior: "instant" });
      const mobileComposer = document.querySelector(".nb-billie-composer");
      if (mobileComposer instanceof HTMLElement) {
        mobileComposer.style.display = "none";
      }
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: buildRawScreenshotPath("ios-02-quick-intake.png"), fullPage: false });
  } finally {
    await context.close();
  }
}

async function captureManual(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript((draft) => {
    window.localStorage.setItem("invoiceOwnerId", "app-store-owner");
    window.localStorage.setItem("invoiceSessionToken", "app-store-demo-token");
    window.localStorage.setItem(
      "invoiceAuthSession",
      JSON.stringify({
        userId: "app-store-owner",
        email: "hello@notebill.app",
        expiresAt: "2026-12-31T00:00:00.000Z"
      })
    );
    window.localStorage.setItem("invoiceDraft::owner:app-store-owner", JSON.stringify(draft));
    window.localStorage.setItem("invoiceDraft", JSON.stringify(draft));
  }, manualDraft);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.getByText("Send & payment handoff").waitFor({ state: "visible" });
    await page.locator('[data-testid="manual-send-payment-handoff"]').evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: Math.max(top, 0), behavior: "instant" });
      const mobileToolbar = document.querySelector(".fixed.bottom-0.left-0.right-0.z-40");
      if (mobileToolbar instanceof HTMLElement) {
        mobileToolbar.style.display = "none";
      }
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: buildRawScreenshotPath("ios-03-manual-review.png"), fullPage: false });
  } finally {
    await context.close();
  }
}

async function captureLibrary(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(seedDemoIdentity);
  const page = await context.newPage();
  try {
    await routeCommon(page, { invoicesPayload: libraryInvoicesPayload });
    await page.goto(`${baseUrl}/invoices`, { waitUntil: "networkidle" });
    const anchorSelectors = [
      '[data-testid="library-billie-next-up"]',
      '[data-testid="library-follow-up-plan"]',
      'text=Collections command center',
      'text=Repeat-ready clients',
      'text=Needs attention'
    ];
    let anchorLocator = null;
    for (const selector of anchorSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        anchorLocator = locator;
        break;
      }
    }
    if (!anchorLocator) {
      throw new Error("Unable to find a stable library screenshot anchor.");
    }
    await anchorLocator.waitFor({ state: "visible" });
    await anchorLocator.evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: Math.max(top, 0), behavior: "instant" });
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: buildRawScreenshotPath("ios-04-library.png"), fullPage: false });
  } finally {
    await context.close();
  }
}

async function captureImport(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(seedDemoIdentity);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: /Bring old files forward without rebuilding them from scratch/i })
      .waitFor({ state: "visible" });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: buildRawScreenshotPath("ios-05-import.png"), fullPage: false });
  } finally {
    await context.close();
  }
}

async function captureHelp(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(seedDemoIdentity);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/help`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="help-center-quick-starts"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy({ top: -120, behavior: "instant" }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: buildRawScreenshotPath("ios-06-help-center.png"), fullPage: false });
  } finally {
    await context.close();
  }
}

async function writeReadme() {
  const lines = [
    "# Apple App Store Assets",
    "",
    "Generated from the current mobile web flow for future iOS/App Store prep.",
    "",
    "Recommended screenshot set:",
    "- ios-01-launcher.png",
    "- ios-02-quick-intake.png",
    "- ios-03-manual-review.png",
    "- ios-04-library.png",
    "- ios-05-import.png",
    "- ios-06-help-center.png",
    "",
    "Recommended App Store size target:",
    "- 1290 x 2796 portrait (6.9-inch)",
    "",
    "Suggested order:",
    "1. Launcher / entry",
    "2. Quick AI invoice",
    "3. Draft review",
    "4. Manual review",
    "5. Client workspace / statements",
    "6. Invoice library",
    "",
    "Story:",
    "Paste rough notes, Billie drafts fast, you approve the money, then keep statements and repeat work organized."
  ];
  await fs.writeFile(path.join(outputDir, "README.txt"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  await ensureOutputDir();
  const browser = await chromium.launch({ headless: true });
  try {
    await captureLauncher(browser);
    await captureQuickIntake(browser);
    await captureManual(browser);
    await captureImport(browser);
    await captureLibrary(browser);
    await captureHelp(browser);
    await writeReadme();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
