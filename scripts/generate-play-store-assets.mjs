import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PLAY_ASSET_BASE_URL ?? process.env.APP_BASE_URL ?? "https://app.notebill.app";
const outputDir = path.resolve("marketing", "play-store");
const screenshotWidth = 540;
const screenshotHeight = 960;
const screenshotScale = 2;

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

const demoSessionToken = "play-store-demo-token";
const demoAuthSession = {
  userId: "play-store-owner",
  email: "hello@notebill.app",
  expiresAt: "2026-12-31T00:00:00.000Z"
};

const libraryInvoicesPayload = {
  invoices: [
    {
      invoiceId: "inv-store-001",
      ownerId: "play-store-owner",
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
      ownerId: "play-store-owner",
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
    },
    {
      invoiceId: "inv-store-003",
      ownerId: "play-store-owner",
      sourceType: "text_input",
      status: "draft",
      updatedAt: "2026-04-09T11:01:00.000Z",
      createdAt: "2026-04-09T10:41:00.000Z",
      invoiceNumber: "INV-2041",
      customerName: "Maple Street Dental",
      total: 320,
      balanceDue: 320,
      invoiceData: {
        finishedInvoice: {
          invoiceNumber: "INV-2041",
          issueDate: "2026-04-09",
          customerName: "Maple Street Dental",
          currency: "USD",
          lineItems: [
            {
              id: "line-3",
              type: "labor",
              description: "Reception lighting retrofit",
              quantity: 1,
              unitPrice: 320,
              amount: 320
            }
          ],
          subtotal: 320,
          total: 320,
          balanceDue: 320
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
  notes: "Thank you for the opportunity to support your spring service call.",
  taxRate: "5",
  discountAmount: "0",
  paymentLinkUrl: "https://pay.notebill.app/i/INV-2052",
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
  savedInvoiceId: "",
  savedInvoiceStatus: ""
};

const appIconPath = path.resolve("public", "icons", "notebill-512.png");
const brandLockupPath = path.resolve("marketing", "brand", "notebill-logo-trimmed.png");
const brandMark1024Path = path.resolve("marketing", "brand", "notebill-mark-square-1024.png");

async function ensureOutputDir() {
  await fs.mkdir(outputDir, { recursive: true });
}

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
  window.localStorage.setItem("invoiceOwnerId", "play-store-owner");
  window.localStorage.setItem("invoiceSessionToken", "play-store-demo-token");
  window.localStorage.setItem(
    "invoiceAuthSession",
    JSON.stringify({
      userId: "play-store-owner",
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
        body: JSON.stringify({
          token: demoSessionToken,
          session: demoAuthSession
        })
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

async function captureLauncher(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(seedDemoIdentity);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(outputDir, "phone-01-launcher.png"),
      fullPage: false
    });
  } finally {
    await context.close();
  }
}

async function captureAiIntake(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(seedDemoIdentity);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
    const notesInput = page.locator("textarea").first();
    await notesInput.fill(
      [
        "April 17 service visit for North Shore Fitness.",
        "Replace lobby lighting ballast and re-secure ceiling trim.",
        "3 hours labor at 120/hour.",
        "Materials 86 dollars.",
        "Need invoice sent to megan@oakpine.example."
      ].join("\n")
    );
    await page.screenshot({
      path: path.join(outputDir, "phone-02-ai-intake.png"),
      fullPage: false
    });
  } finally {
    await context.close();
  }
}

async function captureManual(browser) {
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript((draft) => {
    window.localStorage.setItem("invoiceOwnerId", "play-store-owner");
    window.localStorage.setItem("invoiceSessionToken", "play-store-demo-token");
    window.localStorage.setItem(
      "invoiceAuthSession",
      JSON.stringify({
        userId: "play-store-owner",
        email: "hello@notebill.app",
        expiresAt: "2026-12-31T00:00:00.000Z"
      })
    );
    window.localStorage.setItem("invoiceDraft::owner:play-store-owner", JSON.stringify(draft));
    window.localStorage.setItem("invoiceDraft", JSON.stringify(draft));
  }, manualDraft);
  const page = await context.newPage();
  try {
    await routeCommon(page);
    await page.goto(`${baseUrl}/manual`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(outputDir, "phone-03-manual-editor.png"),
      fullPage: false
    });
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
    await page.screenshot({
      path: path.join(outputDir, "phone-04-invoice-library.png"),
      fullPage: false
    });
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
    await page.screenshot({
      path: path.join(outputDir, "phone-05-import.png"),
      fullPage: false
    });
  } finally {
    await context.close();
  }
}

async function copyBrandAssets() {
  await fs.copyFile(appIconPath, path.join(outputDir, "app-icon-512.png"));
  await fs.copyFile(brandLockupPath, path.join(outputDir, "logo-notebill-lockup.png"));
  await fs.copyFile(brandMark1024Path, path.join(outputDir, "app-icon-1024.png"));
}

async function createFeatureGraphic(browser) {
  const featureGraphicPath = path.join(outputDir, "feature-graphic-1024x500.png");
  const screenshotOne = await fileToDataUrl(path.join(outputDir, "phone-02-ai-intake.png"), "image/png");
  const screenshotTwo = await fileToDataUrl(path.join(outputDir, "phone-03-manual-editor.png"), "image/png");
  const screenshotThree = await fileToDataUrl(path.join(outputDir, "phone-04-invoice-library.png"), "image/png");
  const iconUrl = await fileToDataUrl(appIconPath, "image/png");

  const context = await browser.newContext({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1,
    colorScheme: "light"
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              width: 1024px;
              height: 500px;
              overflow: hidden;
              font-family: Inter, "Segoe UI", Arial, sans-serif;
              background:
                radial-gradient(circle at top left, rgba(172, 207, 240, 0.55), transparent 30%),
                linear-gradient(135deg, #f8fbff 0%, #eef4fb 45%, #f9fbff 100%);
            }
            .canvas {
              position: relative;
              width: 1024px;
              height: 500px;
              padding: 34px 36px;
              overflow: hidden;
            }
            .glow {
              position: absolute;
              inset: auto auto -90px 260px;
              width: 520px;
              height: 260px;
              background: radial-gradient(circle, rgba(9, 48, 100, 0.14), rgba(9, 48, 100, 0));
              filter: blur(18px);
            }
            .content {
              position: relative;
              z-index: 2;
              display: grid;
              grid-template-columns: 1.06fr 0.94fr;
              gap: 24px;
              height: 100%;
            }
            .left {
              display: flex;
              flex-direction: column;
              justify-content: center;
              padding-right: 12px;
            }
            .brand {
              display: inline-flex;
              align-items: center;
              gap: 14px;
              margin-bottom: 22px;
            }
            .brand img {
              width: 68px;
              height: 68px;
              border-radius: 18px;
              box-shadow: 0 18px 42px rgba(9, 48, 100, 0.14);
            }
            .brand span {
              color: #2f8f3b;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: -0.04em;
            }
            .eyebrow {
              display: inline-flex;
              align-items: center;
              width: fit-content;
              padding: 8px 12px;
              border-radius: 999px;
              background: rgba(9, 48, 100, 0.08);
              color: #0b2d5c;
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              margin-bottom: 16px;
            }
            h1 {
              margin: 0 0 14px;
              color: #10223d;
              font-size: 46px;
              line-height: 0.95;
              letter-spacing: -0.05em;
            }
            p {
              margin: 0;
              color: #42536e;
              font-size: 18px;
              line-height: 1.45;
              max-width: 460px;
            }
            .points {
              display: flex;
              gap: 12px;
              flex-wrap: wrap;
              margin-top: 22px;
            }
            .point {
              padding: 10px 14px;
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.9);
              border: 1px solid rgba(9, 48, 100, 0.08);
              color: #0b2d5c;
              font-size: 13px;
              font-weight: 600;
              box-shadow: 0 12px 26px rgba(9, 48, 100, 0.05);
            }
            .right {
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .shot {
              position: absolute;
              width: 168px;
              border-radius: 28px;
              overflow: hidden;
              background: #ffffff;
              border: 10px solid #ffffff;
              box-shadow: 0 30px 60px rgba(9, 48, 100, 0.18);
            }
            .shot img {
              display: block;
              width: 100%;
              height: auto;
            }
            .shot.one {
              left: 24px;
              top: 70px;
              transform: rotate(-11deg);
            }
            .shot.two {
              left: 168px;
              top: 8px;
              width: 184px;
              transform: rotate(3.5deg);
              z-index: 3;
            }
            .shot.three {
              right: 4px;
              top: 92px;
              transform: rotate(12deg);
            }
          </style>
        </head>
        <body>
          <div class="canvas">
            <div class="glow"></div>
            <div class="content">
              <section class="left">
                <div class="brand">
                  <img src="${iconUrl}" alt="NoteBill icon" />
                  <span>NoteBill</span>
                </div>
                <div class="eyebrow">Business invoicing</div>
                <h1>Turn messy notes into professional invoices.</h1>
                <p>Capture the job, polish the wording, and send a clean invoice without starting from a blank page.</p>
                <div class="points">
                  <span class="point">AI intake</span>
                  <span class="point">Manual editor</span>
                  <span class="point">Invoice library</span>
                </div>
              </section>
              <section class="right">
                <div class="shot one"><img src="${screenshotOne}" alt="AI intake" /></div>
                <div class="shot two"><img src="${screenshotTwo}" alt="Manual editor" /></div>
                <div class="shot three"><img src="${screenshotThree}" alt="Invoice library" /></div>
              </section>
            </div>
          </div>
        </body>
      </html>
      `,
      { waitUntil: "load" }
    );
    await page.screenshot({ path: featureGraphicPath });
  } finally {
    await context.close();
  }
}

async function fileToDataUrl(filePath, mimeType) {
  const file = await fs.readFile(filePath);
  return `data:${mimeType};base64,${file.toString("base64")}`;
}

async function writeManifest() {
  const manifest = [
    "NoteBill Play Store asset pack",
    `Generated from: ${baseUrl}`,
    "",
    "Files:",
    "- app-icon-512.png",
    "- app-icon-1024.png",
    "- logo-notebill-lockup.png",
    "- feature-graphic-1024x500.png",
    "- phone-01-launcher.png",
    "- phone-02-ai-intake.png",
    "- phone-03-manual-editor.png",
    "- phone-04-invoice-library.png",
    "- phone-05-import.png",
    "",
    "Upload guide:",
    "- App icon: app-icon-512.png",
    "- Optional logo file: logo-notebill-lockup.png",
    "- Feature graphic: feature-graphic-1024x500.png",
    "- Phone screenshots: any 2 or more of the phone-*.png files",
    "- Preview video: optional, not included"
  ].join("\n");
  await fs.writeFile(path.join(outputDir, "README.txt"), manifest, "utf8");
}

async function main() {
  await ensureOutputDir();
  const browser = await chromium.launch({ headless: true });
  try {
    await copyBrandAssets();
    await captureLauncher(browser);
    await captureAiIntake(browser);
    await captureManual(browser);
    await captureLibrary(browser);
    await captureImport(browser);
    await createFeatureGraphic(browser);
    await writeManifest();
  } finally {
    await browser.close();
  }
  console.log(`Play Store assets written to ${outputDir}`);
}

main().catch((error) => {
  console.error("Failed to generate Play Store assets.");
  console.error(error);
  process.exitCode = 1;
});
