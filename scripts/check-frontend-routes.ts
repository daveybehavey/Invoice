import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";

process.env.NODE_ENV = "test";

const { app } = await import("../src/server.ts");

const checks: Array<{ route: string; expectedText: string }> = [
  { route: "/", expectedText: "New invoice" },
  { route: "/privacy", expectedText: "NoteBill Privacy Policy" },
  { route: "/invoices", expectedText: "Invoice Library" },
  { route: "/scratchpad", expectedText: "DAILY SCRATCHPAD" },
  { route: "/manual", expectedText: "WORK WITH BILLIE" },
  { route: "/dashboard", expectedText: "OPERATOR DASHBOARD" },
  { route: "/settings/business", expectedText: "BUSINESS IDENTITY" }
];

const server = app.listen(0);
await once(server, "listening");

const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  for (const check of checks) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}${check.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (expected) => document.body?.innerText?.includes(expected),
      check.expectedText,
      { timeout: 60000 }
    );
    await context.close();
  }
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedRoutes: checks.map((check) => check.route)
      },
      null,
      2
    )
  );
} finally {
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
}
