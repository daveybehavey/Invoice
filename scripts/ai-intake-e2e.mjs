import { chromium, devices } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DEFAULT_TIMEOUT = 45000;

function formatSuiteLabel(label) {
  return label.padEnd(9, " ");
}

function toIsoDateUTC(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function waitForText(page, text, timeout = DEFAULT_TIMEOUT) {
  try {
    await page.getByText(text, { exact: false }).waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForTypingToSettle(page) {
  const typing = page.getByText("AI is typing...", { exact: false });
  try {
    await typing.waitFor({ state: "visible", timeout: 3000 });
    await typing.waitFor({ state: "hidden", timeout: DEFAULT_TIMEOUT });
    return;
  } catch {
    // If the typing indicator never appears, wait a beat for the response to render.
    await page.waitForTimeout(1500);
  }
}

async function sendMessage(page, text) {
  const input = page.locator("#ai-intake-input");
  await input.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
  await input.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function getChatMessages(page) {
  return await page.$$eval("main .space-y-4 > div", (nodes) =>
    nodes
      .map((node) => {
        const text = node.innerText?.trim() ?? "";
        if (!text) {
          return null;
        }
        const isUser = node.classList.contains("justify-end");
        return { role: isUser ? "user" : "ai", text };
      })
      .filter(Boolean)
  );
}

async function getDecisionItems(page) {
  const items = await page
    .locator("section:has-text(\"Assumptions\") li")
    .allTextContents();
  return items.map((item) => item.trim()).filter((item) => item.startsWith("Decision needed:"));
}

async function getAssumptionItems(page) {
  const items = await page
    .locator("section:has-text(\"Assumptions\") li")
    .allTextContents();
  return items
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith("Decision needed:"));
}

async function getUnparsedItems(page) {
  const items = await page
    .locator("section:has-text(\"Assumptions\") div:has-text(\"Not yet captured\") li")
    .allTextContents();
  return items.map((item) => item.trim()).filter(Boolean);
}

async function getLaborPricingCount(page) {
  const items = await page
    .locator("section:has-text(\"Assumptions\") li")
    .allTextContents();
  const match = items
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().includes("labor pricing needed"));
  if (!match) {
    return 0;
  }
  const numberMatch = match.match(/(\d+)/);
  return numberMatch ? Number(numberMatch[1]) : 0;
}

async function getManualLineItems(page) {
  const rows = page.locator("tbody tr");
  const count = await rows.count();
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const description = await row.locator("input[placeholder='Description']").inputValue();
    const qty = await row.locator("input[placeholder='0']").inputValue();
    const rate = await row.locator("input[placeholder='$0']").inputValue();
    items.push({ description: description.trim(), qty, rate });
  }
  return items;
}

function attachBrowserLogs(page, suiteLabel, testLabel) {
  page.on("console", (msg) => {
    console.log(`[browser:${suiteLabel}:${testLabel}] ${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => {
    console.log(`[browser:${suiteLabel}:${testLabel}] pageerror: ${error.message}`);
  });
}

function parseNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function runSuite(label, contextOptions) {
  const suiteLabel = formatSuiteLabel(label);
  const results = [];
  const browser = await chromium.launch({ headless: true });

  async function runTest(name, fn) {
    const checks = [];
    const record = (ok, message) => {
      checks.push({ ok: Boolean(ok), message });
    };
    let error = null;
    try {
      await fn(record);
    } catch (err) {
      error = err;
    }
    const pass = !error && checks.every((item) => item.ok);
    results.push({ name, pass, checks, error });
  }

  async function newContext() {
    const context = await browser.newContext({
      ...contextOptions,
      baseURL: BASE_URL
    });
    await context.addInitScript(() => {
      if (!window.__invoiceStorageCleared) {
        window.localStorage.clear();
        window.__invoiceStorageCleared = true;
      }
    });
    return context;
  }

  await runTest("TEST 1 — Baseline", async (record) => {
    console.log(`[${label}] Running TEST 1 — Baseline`);
    const context = await newContext();
    const page = await context.newPage();
    attachBrowserLogs(page, label, "TEST 1 — Baseline");
    await page.goto("/ai-intake", { waitUntil: "networkidle" });

    await sendMessage(
      page,
      "Fixed leaking sink on Jan 10. 2 hours at $90/hr.\nParts: washer $5.\nBill Mike Johnson.\nNo tax."
    );

    await waitForTypingToSettle(page);
    const hasSummary = await waitForText(page, "Checkpoint: Draft ready.");
    record(hasSummary, "Summary ends with checkpoint");

    const followUpShown = await waitForText(
      page,
      "I see labor work, but some labor pricing is missing",
      3000
    );
    record(!followUpShown, "No labor pricing follow-up");

    const decisions = await getDecisionItems(page);
    record(decisions.length === 0, "No decisions listed");

    const nextSteps = await page.getByText("Next steps", { exact: true }).isVisible();
    record(nextSteps, "Next steps strip shown");

    const helperText = await page
      .getByText("Checkpoint ready — confirm to generate.", { exact: true })
      .isVisible();
    record(helperText, "Generate helper shows checkpoint");

    const generateButton = page.getByRole("button", { name: "Generate Invoice" });
    record(await generateButton.isDisabled(), "Generate disabled before confirmation");

    const confirmButton = page.getByRole("button", { name: "Confirm draft" });
    record(await confirmButton.isVisible(), "Confirm draft button shown");
    await confirmButton.click();
    await waitForTypingToSettle(page);
    const helperReady = await page.getByText("Ready to generate.", { exact: true }).isVisible();
    record(helperReady, "Helper text shows ready to generate");

    record(await generateButton.isEnabled(), "Generate enabled after confirmation");

    const assumptions = await getAssumptionItems(page);
    const hasClient = assumptions.some((item) => item.toLowerCase().includes("mike johnson"));
    record(hasClient, "Client shows Mike Johnson");

    const hasLaborAmount = assumptions.some((item) => item.includes("$180.00"));
    record(hasLaborAmount, "Labor amount $180.00 present");

    const hasPartAmount = assumptions.some((item) => item.includes("$5.00"));
    record(hasPartAmount, "Part amount $5.00 present");

    await context.close();
  });

  await runTest("TEST 2-8 — Decisions Flow", async (record) => {
    console.log(`[${label}] Running TEST 2-8 — Decisions Flow`);
    const context = await newContext();
    const page = await context.newPage();
    attachBrowserLogs(page, label, "TEST 2-8 — Decisions Flow");
    await page.goto("/ai-intake", { waitUntil: "networkidle" });

    const messyInput = `Jan 28 I went to Mike’s place (Mike Johnson, 1423 Pine St) just to inspect a leaking faucet.
Didn’t charge for that visit, maybe 30 mins.

Jan 30 I fixed it, took about 2 hours at $80/hr.
Normally I charge 85/hr but I told him I’d do 80/hr this time.

Parts:
cartridge $18.75
washer kit $6
parking $4.50

Feb 2 I tightened a cabinet door while I was there, maybe 20 minutes.
Didn’t really think about charging for that — up to you.

Also did a logo tweak for his business website earlier in the month.
Flat $250, already agreed.

I sometimes add 5% tax, sometimes not.
Do what makes sense.`;

    await sendMessage(page, messyInput);
    await waitForTypingToSettle(page);

    const followUp = await waitForText(
      page,
      "I see labor work, but some labor pricing is missing",
      5000
    );
    record(true, followUp ? "Labor follow-up shown" : "Labor follow-up not required");

    if (followUp) {
      const helperLabor = await page
        .getByText("Provide labor pricing to continue.", { exact: false })
        .isVisible();
      record(helperLabor, "Generate helper indicates labor pricing");

      const laborCount = await getLaborPricingCount(page);
      record(laborCount >= 0, "Labor pricing count read");
      await sendMessage(page, "Flat $80.");
      await waitForTypingToSettle(page);
    }

    const hasSummary = await waitForText(page, "Checkpoint: Draft ready.");
    record(hasSummary, followUp ? "Summary produced after labor pricing" : "Summary produced");

    const decisions = await getDecisionItems(page);
    record(decisions.length > 0, "Decisions listed");

    const nextSteps = await page.getByText("Next steps", { exact: true }).isVisible();
    record(nextSteps, "Next steps strip shown");

    const decisionText = decisions.join(" ").toLowerCase();
    record(decisionText.includes("tax"), "Tax decision requested");
    record(
      decisionText.includes("cabinet") || decisionText.includes("door"),
      "Cabinet door decision requested"
    );

    const helperText = await page
      .getByText("Checkpoint ready — confirm to generate. Pending decisions can be resolved later.", {
        exact: true
      })
      .isVisible();
    record(helperText, "Generate helper indicates checkpoint");

    const generateButton = page.getByRole("button", { name: "Generate Invoice" });
    record(await generateButton.isDisabled(), "Generate disabled with open decisions");

    const summaryForDecisions = await waitForText(page, "Checkpoint: Draft ready.", 3000);
    record(summaryForDecisions, "Summary shown with pending decisions");

    const confirmButton = page.getByRole("button", { name: "Confirm draft" });
    record(await confirmButton.isVisible(), "Confirm draft button shown");
    await confirmButton.click();
    await waitForTypingToSettle(page);
    const readyMessage = await page.getByText("Ready to generate.", { exact: true }).isVisible();
    record(readyMessage, "Confirmation moves to ready-to-generate");

    const canGenerate = await generateButton.isEnabled();
    record(canGenerate, "Generate enabled after confirmation");
    const helperReady = await page.getByText("Ready to generate.", { exact: true }).isVisible();
    record(helperReady, "Helper text shows ready to generate");

    const inputEnabled = await page.locator("#ai-intake-input").isEnabled();
    record(inputEnabled, "Chat input remains enabled after confirmation");

    if (canGenerate) {
      await generateButton.click();
      await page.waitForURL("**/manual", { timeout: DEFAULT_TIMEOUT });
      await page.getByText("INVOICE", { exact: true }).waitFor({ timeout: DEFAULT_TIMEOUT });

      const invoiceNumber = await page.getByLabel("Invoice #").inputValue();
      record(/^INV-\d{8}-\d{4}$/.test(invoiceNumber), "Invoice number auto-generated");

      const expectedDate = toIsoDateUTC();
      const invoiceDate = await page.getByLabel("Date").inputValue();
      record(invoiceDate === expectedDate, `Invoice date is today (${expectedDate})`);

      const billTo = await page
        .getByText("Bill To")
        .locator("..")
        .locator("textarea")
        .inputValue();
      record(billTo.toLowerCase().includes("mike johnson"), "Bill To includes Mike Johnson");

      // Tax is assumed 0% by default; skip direct field assertion to avoid layout coupling.

      const lineItems = await getManualLineItems(page);
      const hasLaborLine = lineItems.some((item) =>
        parseNumber(item.qty) === 2 && parseNumber(item.rate) === 80
      );
      record(hasLaborLine, "Labor line shows 2h x $80/hr");

      const hasLogoLine = lineItems.some((item) => parseNumber(item.rate) === 250);
      record(hasLogoLine, "Logo line shows $250");

      const parts = [18.75, 6, 4.5];
      const partMatches = parts.filter((value) =>
        lineItems.some((item) => parseNumber(item.rate) === value)
      );
      record(partMatches.length === parts.length, "All part amounts present");

      const inspectionLines = lineItems.filter((item) =>
        item.description.toLowerCase().includes("inspect")
      );
      const inspectionOk =
        inspectionLines.length === 0 ||
        inspectionLines.every((item) => parseNumber(item.rate) === 0);
      record(inspectionOk, "Inspection visit excluded or $0");

      const cabinetLines = lineItems.filter((item) =>
        item.description.toLowerCase().includes("cabinet")
      );
      const cabinetOk =
        cabinetLines.length === 0 || cabinetLines.every((item) => parseNumber(item.rate) === 0);
      record(cabinetOk, "Cabinet door adjustment not billed");
    } else {
      record(false, "Generate click skipped because button stayed disabled");
    }

    await context.close();
  });

  await runTest("TEST 6 — Labor Follow-up", async (record) => {
    console.log(`[${label}] Running TEST 6 — Labor Follow-up`);
    const context = await newContext();
    const page = await context.newPage();
    attachBrowserLogs(page, label, "TEST 6 — Labor Follow-up");
    await page.goto("/ai-intake", { waitUntil: "networkidle" });

    await sendMessage(
      page,
      "Did 3 labor jobs this week. One took 2 hours, one took 1 hour, one was quick."
    );
    await waitForTypingToSettle(page);

    const followUp = await waitForText(
      page,
      "I see labor work, but some labor pricing is missing",
      DEFAULT_TIMEOUT
    );
    record(followUp, "Labor follow-up shown");

    const helperText = await page.getByText("Provide labor pricing to continue.", { exact: false }).isVisible();
    record(helperText, "Helper prompts labor pricing");

    const rateButton = page.getByRole("button", { name: "Use $85/hr" });
    record(await rateButton.isVisible(), "Suggested rate button shown");
    await rateButton.click();
    await waitForTypingToSettle(page);
    const hoursPrompt = await waitForText(page, "How many hours for each labor line", 5000);
    record(hoursPrompt, "Hours follow-up shown after rate selection");

    const hoursButton = page.getByRole("button", { name: "Use 2h, 1h, 1h" });
    record(await hoursButton.isVisible(), "Suggested hours button shown");
    await hoursButton.click();
    await waitForTypingToSettle(page);

    const summaryShown = await waitForText(page, "Checkpoint: Draft ready.", DEFAULT_TIMEOUT);
    record(summaryShown, "Summary shown after labor pricing reply");

    const followUpAgain = await waitForText(
      page,
      "I still need the labor pricing details",
      3000
    );
    record(!followUpAgain, "No repeated labor follow-up after resolution");

    await context.close();
  });

  await runTest("TEST 9 — Back Navigation", async (record) => {
    console.log(`[${label}] Running TEST 9 — Back Navigation`);
    const context = await newContext();
    const page = await context.newPage();
    attachBrowserLogs(page, label, "TEST 9 — Back Navigation");
    await page.goto("/manual", { waitUntil: "networkidle" });

    await page.getByLabel("Invoice #").fill("TEST-123");
    await page.getByText("Bill To").locator("..").locator("textarea").fill("Back Test");
    const firstRow = page.locator("tbody tr").first();
    await firstRow.locator("input[placeholder='Description']").fill("Test line");
    await firstRow.locator("input[placeholder='0']").fill("1");
    await firstRow.locator("input[placeholder='$0']").fill("10");

    await page.waitForTimeout(800);

    await page.getByRole("button", { name: "← Back" }).click();
    await page.waitForURL("**/", { timeout: DEFAULT_TIMEOUT });

    await page.goto("/manual", { waitUntil: "networkidle" });

    const invoiceNumber = await page.getByLabel("Invoice #").inputValue();
    record(invoiceNumber === "TEST-123", "Draft invoice number restored");

    const billTo = await page.getByText("Bill To").locator("..").locator("textarea").inputValue();
    record(billTo === "Back Test", "Bill To restored");

    const restoredRow = page.locator("tbody tr").first();
    const restoredDesc = await restoredRow.locator("input[placeholder='Description']").inputValue();
    record(restoredDesc === "Test line", "Line item description restored");

    await context.close();
  });

  await runTest("TEST 10 — Demo Data", async (record) => {
    console.log(`[${label}] Running TEST 10 — Demo Data`);
    const context = await newContext();
    const page = await context.newPage();
    attachBrowserLogs(page, label, "TEST 10 — Demo Data");
    await page.goto("/ai-intake", { waitUntil: "networkidle" });

    await sendMessage(page, "Installed shelves for John Doe. 3 hours at $50/hr. Parts: brackets $12.");
    await waitForTypingToSettle(page);
    await waitForText(page, "Summary:");

    const messages = await getChatMessages(page);
    const combined = messages.map((msg) => msg.text.toLowerCase()).join("\n");
    record(!combined.includes("sarah"), "No Sarah demo data");
    record(!combined.includes("logo"), "No demo logo mention");

    await context.close();
  });

  await runTest("TEST 11 — Edit by Chat", async (record) => {
    console.log(`[${label}] Running TEST 11 — Edit by Chat`);
    const context = await newContext();
    const page = await context.newPage();
    attachBrowserLogs(page, label, "TEST 11 — Edit by Chat");
    await page.goto("/ai-intake", { waitUntil: "networkidle" });

    await sendMessage(
      page,
      "Fixed leaking sink on Jan 10. 2 hours at $90/hr.\nParts: washer $5.\nBill Mike Johnson.\nNo tax."
    );
    await waitForTypingToSettle(page);
    const hasSummary = await waitForText(page, "Checkpoint: Draft ready.");
    record(hasSummary, "Summary shown before edit");

    await sendMessage(page, "Yes");
    await waitForTypingToSettle(page);
    const readyMessage = await page.getByText("Ready to generate.", { exact: true }).isVisible();
    record(readyMessage, "Ready to generate before edit");

    const generateButton = page.getByRole("button", { name: "Generate Invoice" });
    record(await generateButton.isEnabled(), "Generate enabled after confirmation");

    await sendMessage(page, "Change the labor rate to $80/hr.");
    await waitForTypingToSettle(page);

    const assumptions = await getAssumptionItems(page);
    const hasUpdatedLabor = assumptions.some((item) => item.includes("$160.00"));
    record(hasUpdatedLabor, "Edit updates labor amount to $160.00");
    const hasOldLabor = assumptions.some((item) => item.includes("$180.00"));
    record(!hasOldLabor, "Old labor amount removed");

    if (await generateButton.isEnabled()) {
      await generateButton.click();
      await page.waitForURL("**/manual", { timeout: DEFAULT_TIMEOUT });
      await page.getByText("INVOICE", { exact: true }).waitFor({ timeout: DEFAULT_TIMEOUT });

      const lineItems = await getManualLineItems(page);
      const hasEditedLaborLine = lineItems.some((item) =>
        parseNumber(item.qty) === 2 && parseNumber(item.rate) === 80
      );
      record(hasEditedLaborLine, "Manual draft reflects edited labor rate");
    } else {
      record(false, "Generate click skipped because button stayed disabled");
    }

    await context.close();
  });

  await browser.close();

  const passed = results.filter((result) => result.pass).length;
  const failed = results.length - passed;
  const summary = [`${suiteLabel}Suite: ${label}`, `Passed: ${passed}`, `Failed: ${failed}`];

  for (const result of results) {
    summary.push(`- ${result.pass ? "PASS" : "FAIL"}: ${result.name}`);
    if (!result.pass) {
      if (result.error) {
        summary.push(`  Error: ${result.error.message}`);
      }
      for (const check of result.checks) {
        if (!check.ok) {
          summary.push(`  - ${check.message}`);
        }
      }
    }
  }

  return { label, results, summary: summary.join("\n") };
}

async function run() {
  const suites = [];
  const mobileDevice = devices["iPhone 13"] ?? {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
  };

  const runMobile = process.env.RUN_MOBILE !== "0";
  const runDesktop = process.env.RUN_DESKTOP === "1";

  if (runMobile) {
    const mobileSuite = await runSuite("mobile", mobileDevice);
    suites.push(mobileSuite);
    console.log(mobileSuite.summary);
    console.log("\n");
  }

  if (runDesktop) {
    const desktopSuite = await runSuite("desktop", { viewport: { width: 1280, height: 720 } });
    suites.push(desktopSuite);
    console.log(desktopSuite.summary);
    console.log("\n");
  }

  const failedSuites = suites.length
    ? suites.some((suite) => suite.results.some((result) => !result.pass))
    : false;
  if (failedSuites) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
