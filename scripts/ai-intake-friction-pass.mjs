import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUTPUT_PATH =
  process.env.FRICTION_OUTPUT ?? path.join(process.cwd(), "docs", "flow-friction-latest.json");
const DEFAULT_TIMEOUT = 15000;

const fixtureWithDecision = {
  needsFollowUp: false,
  followUp: null,
  invoice: {
    customerName: "Mike Johnson",
    notes: "Thanks for your business.",
    lineItems: [
      {
        id: "line-faucet",
        type: "labor",
        description: "Faucet repair labor",
        quantity: 2,
        unitPrice: 80,
        amount: 160
      },
      {
        id: "line-cabinet",
        type: "labor",
        description: "Cabinet door adjustment",
        quantity: 0.33,
        unitPrice: 80,
        amount: 26.4
      },
      {
        id: "line-part-1",
        type: "material",
        description: "Faucet cartridge",
        quantity: 1,
        unitPrice: 18.75,
        amount: 18.75
      }
    ],
    taxRate: 0,
    subtotal: 205.15,
    total: 205.15
  },
  structuredInvoice: null,
  openDecisions: [
    {
      id: "decision-cabinet",
      kind: "billing",
      prompt: "Bill cabinet door adjustment?",
      sourceSnippet: "Didn’t really think about charging for that — up to you."
    }
  ],
  assumptions: ["Tax assumed 0%."],
  unparsedLines: [],
  auditStatus: "completed"
};

const fixtureResolved = {
  ...fixtureWithDecision,
  invoice: {
    ...fixtureWithDecision.invoice,
    lineItems: fixtureWithDecision.invoice.lineItems.map((item) =>
      item.id === "line-cabinet"
        ? {
            ...item,
            unitPrice: 0,
            amount: 0
          }
        : item
    ),
    subtotal: 178.75,
    total: 178.75
  },
  openDecisions: [],
  unparsedLines: ["parking receipt had smudged text"]
};

function createRecorder() {
  const issues = [];
  const checks = [];

  const addCheck = (name, pass, details = "") => {
    checks.push({ name, pass: Boolean(pass), details });
  };

  const addIssue = (severity, message, details = "") => {
    issues.push({ severity, message, details });
  };

  return {
    checks,
    issues,
    addCheck,
    addIssue
  };
}

function containsAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

async function getVisiblePrimaryButtons(page) {
  const labels = await page
    .locator("button.bg-emerald-600:visible")
    .allTextContents();
  return labels.map((label) => label.trim()).filter(Boolean);
}

async function stubIntakeApis(page) {
  await page.route("**/api/invoices/from-input", async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const lastUserMessage = String(body.lastUserMessage ?? "").toLowerCase();
    const resolvedIntent = containsAny(lastUserMessage, [
      "skip",
      "dont bill",
      "don't bill",
      "no tax",
      "looks good",
      "yes"
    ]);
    const payload = resolvedIntent ? fixtureResolved : fixtureWithDecision;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });
  });

  await page.route("**/api/invoices/from-input/labor-pricing", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixtureWithDecision)
    });
  });

  await page.route("**/api/invoices/audit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assumptions: ["Tax assumed 0%."],
        decisions: fixtureWithDecision.openDecisions,
        unparsedLines: []
      })
    });
  });
}

async function run() {
  const recorder = createRecorder();
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      ...(devices["iPhone 13"] ?? {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
      }),
      baseURL: BASE_URL
    });
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    const page = await context.newPage();
    await stubIntakeApis(page);

    await page.goto("/ai-intake", { waitUntil: "networkidle" });
    await page.getByText("Paste your notes", { exact: true }).waitFor({ timeout: DEFAULT_TIMEOUT });

    const primaryOnPaste = await getVisiblePrimaryButtons(page);
    recorder.addCheck(
      "single primary action on paste",
      primaryOnPaste.length === 1,
      `visible primary buttons: ${primaryOnPaste.join(", ") || "(none)"}`
    );
    if (primaryOnPaste.length !== 1) {
      recorder.addIssue(
        "major",
        "Paste step shows multiple primary actions.",
        `Buttons: ${primaryOnPaste.join(", ")}`
      );
    }

    await page
      .getByPlaceholder(/Example: Jan 10 fixed sink/i)
      .fill(
        "Jan 28 inspection no charge. Jan 30 fixed faucet about 2 hours at $80/hr. Feb 2 cabinet door maybe bill."
      );
    await page.getByRole("button", { name: "Build invoice" }).click();

    await page.getByText("Draft snapshot").waitFor({ timeout: DEFAULT_TIMEOUT });
    await page.getByText("Needs your call", { exact: false }).waitFor({ timeout: DEFAULT_TIMEOUT });

    const quickActionsVisible = await page.getByText("Quick actions", { exact: true }).isVisible();
    recorder.addCheck(
      "quick actions hidden by default on mobile",
      !quickActionsVisible,
      quickActionsVisible ? "Quick actions block is visible before details are expanded." : ""
    );
    if (quickActionsVisible) {
      recorder.addIssue(
        "major",
        "Secondary review controls are visible by default on mobile.",
        "Quick actions should stay behind Show details."
      );
    }

    const detailButtons = await page
      .getByRole("button", { name: /show details|hide details/i })
      .count();
    recorder.addCheck(
      "at most one details toggle visible in decision state",
      detailButtons <= 1,
      `visible toggles: ${detailButtons}`
    );
    if (detailButtons > 1) {
      recorder.addIssue(
        "minor",
        "Multiple details toggles shown at once.",
        "This can create uncertainty about where extra info lives."
      );
    }

    const primaryWithDecision = await getVisiblePrimaryButtons(page);
    recorder.addCheck(
      "single primary action with open decisions",
      primaryWithDecision.length === 1,
      `visible primary buttons: ${primaryWithDecision.join(", ") || "(none)"}`
    );
    if (primaryWithDecision.length !== 1) {
      recorder.addIssue(
        "major",
        "Decision state shows more than one primary action.",
        `Buttons: ${primaryWithDecision.join(", ")}`
      );
    }

    const resolveButton = page.getByRole("button", { name: "Resolve decisions" }).last();
    await resolveButton.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
    recorder.addCheck(
      "decision-first CTA is active while decisions are open",
      await resolveButton.isEnabled(),
      "Primary CTA should guide user to resolve decisions first."
    );
    const visibleGenerateButtons = await page
      .getByRole("button", { name: "Generate Invoice" })
      .count();
    recorder.addCheck(
      "generate action hidden until decisions are resolved",
      visibleGenerateButtons === 0,
      `Visible Generate buttons: ${visibleGenerateButtons}`
    );

    await page.getByRole("button", { name: "Skip" }).first().click();
    await page.getByText("Ready to generate.", { exact: false }).waitFor({ timeout: DEFAULT_TIMEOUT });

    const generateButton = page.getByRole("button", { name: "Generate Invoice" }).last();
    await generateButton.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });

    recorder.addCheck(
      "generate enabled after resolving decision",
      await generateButton.isEnabled(),
      "Generate should unlock once no open decisions remain."
    );

    const reviewDetailsToggle = page.getByRole("button", { name: /show details|hide details/i }).first();
    if (await reviewDetailsToggle.isVisible().catch(() => false)) {
      await reviewDetailsToggle.click();
    }
    const quickActionButtons = page
      .locator("button:visible")
      .filter({ hasText: /change rate|update hours|remove item|update client|merge duplicates|edit notes/i });
    const quickActionCount = await quickActionButtons.count();
    if (quickActionCount === 0) {
      recorder.addIssue(
        "minor",
        "No review quick action was visible for cursor-position testing.",
        "Expected at least one quick action after decisions resolve."
      );
    } else {
      const quickAction = quickActionButtons.first();
      await quickAction.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
      await quickAction.click();
      await page.waitForTimeout(150);
      const cursorAtEnd = await page.evaluate(() => {
        const input = document.querySelector("textarea#ai-intake-input");
        if (!(input instanceof HTMLTextAreaElement)) {
          return false;
        }
        return input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      });
      recorder.addCheck(
        "quick action focuses visible chat input with cursor at end",
        cursorAtEnd,
        "Typing cursor should be after prefilled quick-action text."
      );
    }

    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      checks: recorder.checks,
      issues: recorder.issues
    };

    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log("Flow friction pass complete.");
    console.log(`Checks: ${report.checks.length}`);
    console.log(`Issues: ${report.issues.length}`);
    if (report.issues.length) {
      report.issues.forEach((issue) => {
        console.log(`- [${issue.severity}] ${issue.message}${issue.details ? ` (${issue.details})` : ""}`);
      });
    }
    console.log(`Saved report: ${OUTPUT_PATH}`);

    const hasMajorIssue = report.issues.some((issue) => issue.severity === "major");
    if (hasMajorIssue) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
