import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";

process.env.NODE_ENV = "test";

const [{ app }, { setImageOcrRunnerForTests, setJsonTaskRunnerForTests }] = await Promise.all([
  import("./server.js"),
  import("./ai/openaiClient.js")
]);

let server: Server;
let browser: Browser;
let baseUrl = "";

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
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

async function openIntake(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/ai-intake`, { waitUntil: "networkidle" });
  await page.getByText("AI Invoice Assistant").waitFor({ state: "visible" });
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

function emptyAudit() {
  return {
    assumptions: [],
    decisions: [],
    unparsedLines: []
  };
}
