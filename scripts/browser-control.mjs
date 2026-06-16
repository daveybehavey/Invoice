import express from "express";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const runtimeDir = path.join(rootDir, ".runtime", "browser-control");
const profileDir = path.resolve(
  process.env.BROWSER_CONTROL_PROFILE_DIR || path.join(runtimeDir, "profile")
);
const screenshotDir = path.join(runtimeDir, "screenshots");
const port = Number.parseInt(process.env.BROWSER_CONTROL_PORT || "32123", 10) || 32123;
const host = process.env.BROWSER_CONTROL_HOST || "127.0.0.1";
const headless = parseBoolean(process.env.BROWSER_CONTROL_HEADLESS, false);
const startUrl = process.env.BROWSER_CONTROL_START_URL || "about:blank";
const channel = normalizeChannel(process.env.BROWSER_CONTROL_CHANNEL || "") || "chrome";
const cdpUrl = String(process.env.BROWSER_CONTROL_CDP_URL || "").trim();

ensureDir(runtimeDir);
ensureDir(profileDir);
ensureDir(screenshotDir);

const browserOptions = {
  headless,
  viewport: null,
  args: ["--start-maximized"]
};
if (channel) {
  browserOptions.channel = channel;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

let context;
let launchedBrowser;
let ready = false;

function parseBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "chrome" || normalized === "msedge" || normalized === "chromium") {
    return normalized;
  }
  return "";
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "capture";
}

function locatorFromTarget(page, target = {}) {
  if (typeof target === "string") {
    return page.locator(target);
  }
  if (target.selector) {
    return page.locator(String(target.selector));
  }
  if (target.testId) {
    return page.getByTestId(String(target.testId));
  }
  if (target.role) {
    const roleOptions = {};
    if (target.name != null) {
      roleOptions.name = target.name;
    }
    if (typeof target.exact === "boolean") {
      roleOptions.exact = target.exact;
    }
    if (target.checked != null) {
      roleOptions.checked = target.checked;
    }
    if (target.pressed != null) {
      roleOptions.pressed = target.pressed;
    }
    if (target.selected != null) {
      roleOptions.selected = target.selected;
    }
    if (target.expanded != null) {
      roleOptions.expanded = target.expanded;
    }
    if (target.disabled != null) {
      roleOptions.disabled = target.disabled;
    }
    if (target.includeHidden != null) {
      roleOptions.includeHidden = target.includeHidden;
    }
    return page.getByRole(String(target.role), roleOptions);
  }
  if (target.label) {
    return page.getByLabel(String(target.label), { exact: Boolean(target.exact) });
  }
  if (target.placeholder) {
    return page.getByPlaceholder(String(target.placeholder), { exact: Boolean(target.exact) });
  }
  if (target.text) {
    return page.getByText(String(target.text), { exact: Boolean(target.exact) });
  }
  if (target.alt) {
    return page.getByAltText(String(target.alt), { exact: Boolean(target.exact) });
  }
  if (target.title) {
    return page.getByTitle(String(target.title), { exact: Boolean(target.exact) });
  }
  throw new Error("A locator target is required.");
}

async function getCurrentPage() {
  if (!context) {
    throw new Error("Browser is not ready yet.");
  }
  const pages = context.pages();
  if (pages.length === 0) {
    const page = await context.newPage();
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    return page;
  }
  return pages[pages.length - 1];
}

async function getPageByIndex(index) {
  if (!context) {
    throw new Error("Browser is not ready yet.");
  }
  const pages = context.pages();
  const page = pages[index];
  if (!page) {
    throw new Error(`No page at index ${index}.`);
  }
  return page;
}

async function pageSnapshot(page, index) {
  const title = await page.title().catch(() => "");
  return {
    index,
    url: page.url(),
    title,
    isClosed: page.isClosed()
  };
}

async function snapshot() {
  if (!context) {
    return { ready: false, pages: [] };
  }
  const pages = await Promise.all(context.pages().map((page, index) => pageSnapshot(page, index)));
  return {
    ready,
    headless,
    channel: channel || "default",
    profileDir,
    pageCount: pages.length,
    pages
  };
}

async function readBodyText(page) {
  return await page.evaluate(() => document.body?.innerText || "");
}

async function resolveJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  return {};
}

async function runAction(page, action, payload = {}) {
  switch (action) {
    case "goto":
      await page.goto(String(payload.url), { waitUntil: payload.waitUntil || "domcontentloaded" });
      return { ok: true };
    case "click": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.click({
        force: Boolean(payload.force),
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "fill": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.fill(String(payload.value ?? ""), {
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "type": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.type(String(payload.value ?? ""), {
        delay: payload.delay || 0,
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "press": {
      const locator = payload.target ? locatorFromTarget(page, payload.target) : page;
      await locator.press(String(payload.key), {
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "selectOption": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.selectOption(payload.value ?? payload.values ?? payload.option ?? payload.options, {
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "check": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.check({
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "uncheck": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.uncheck({
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "hover": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.hover({
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "scrollIntoView": {
      const locator = locatorFromTarget(page, payload.target);
      await locator.scrollIntoViewIfNeeded({
        timeout: payload.timeoutMs || 30000
      });
      return { ok: true };
    }
    case "waitFor": {
      if (payload.url) {
        await page.waitForURL(String(payload.url), {
          timeout: payload.timeoutMs || 30000,
          waitUntil: payload.waitUntil || "domcontentloaded"
        });
      } else if (payload.target) {
        const locator = locatorFromTarget(page, payload.target);
        await locator.waitFor({
          state: payload.state || "visible",
          timeout: payload.timeoutMs || 30000
        });
      } else if (payload.ms) {
        await page.waitForTimeout(Number(payload.ms));
      } else {
        throw new Error("waitFor requires url, target, or ms.");
      }
      return { ok: true };
    }
    case "evaluate":
      return {
        ok: true,
        value: await page.evaluate((expression) => {
          // eslint-disable-next-line no-eval
          return eval(expression);
        }, String(payload.expression || "null"))
      };
    case "content":
      return {
        ok: true,
        text: await readBodyText(page),
        html: await page.content()
      };
    case "screenshot": {
      const filename = `${Date.now()}-${safeName(payload.name || "screenshot")}.png`;
      const outputPath = path.join(screenshotDir, filename);
      await page.screenshot({
        path: outputPath,
        fullPage: Boolean(payload.fullPage)
      });
      return { ok: true, path: outputPath };
    }
    case "reload":
      await page.reload({ waitUntil: payload.waitUntil || "domcontentloaded" });
      return { ok: true };
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

async function startBrowser() {
  if (cdpUrl) {
    const connectedBrowser = await chromium.connectOverCDP(cdpUrl);
    launchedBrowser = connectedBrowser;
    context = connectedBrowser.contexts()[0] || (await connectedBrowser.newContext());
    if (context.pages().length === 0) {
      const page = await context.newPage();
      await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    }
    context.on("page", (page) => {
      page.on("dialog", async (dialog) => {
        try {
          await dialog.dismiss();
        } catch {
          // ignore
        }
      });
    });
    ready = true;
    return;
  }

  const launchOptions = { ...browserOptions };
  try {
    context = await chromium.launchPersistentContext(profileDir, launchOptions);
  } catch (error) {
    if (channel) {
      console.warn(`Falling back to bundled Chromium because channel "${channel}" could not launch: ${error.message}`);
      context = await chromium.launchPersistentContext(profileDir, {
        headless,
        viewport: null,
        args: ["--start-maximized"]
      });
    } else {
      throw error;
    }
  }

  launchedBrowser = context.browser();
  if (context.pages().length === 0) {
    const page = await context.newPage();
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  }

  context.on("page", (page) => {
    page.on("dialog", async (dialog) => {
      try {
        await dialog.dismiss();
      } catch {
        // ignore
      }
    });
  });

  ready = true;
}

app.get("/health", async (_req, res) => {
  res.json(await snapshot());
});

app.get("/state", async (_req, res) => {
  res.json(await snapshot());
});

app.get("/pages", async (_req, res) => {
  if (!context) {
    res.status(503).json({ ok: false, error: "Browser is not ready yet." });
    return;
  }
  const pages = await Promise.all(context.pages().map((page, index) => pageSnapshot(page, index)));
  res.json({ ok: true, pages });
});

app.post("/activate", async (req, res) => {
  try {
    const { index } = await resolveJsonBody(req);
    const page = await getPageByIndex(Number(index));
    await page.bringToFront();
    res.json({ ok: true, page: await pageSnapshot(page, Number(index)) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/open", async (req, res) => {
  try {
    const { url, waitUntil } = await resolveJsonBody(req);
    const page = await getCurrentPage();
    await page.goto(String(url), { waitUntil: waitUntil || "domcontentloaded" });
    res.json({ ok: true, page: await pageSnapshot(page, context.pages().indexOf(page)) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/goto", async (req, res) => {
  try {
    const { url, waitUntil } = await resolveJsonBody(req);
    const page = await getCurrentPage();
    await page.goto(String(url), { waitUntil: waitUntil || "domcontentloaded" });
    res.json({ ok: true, page: await pageSnapshot(page, context.pages().indexOf(page)) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/action", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, body.action, body);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/click", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "click", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/fill", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "fill", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/type", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "type", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/press", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "press", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/select", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "selectOption", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/check", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "check", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/hover", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "hover", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/scroll", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "scrollIntoView", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/wait", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "waitFor", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/reload", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "reload", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/content", async (_req, res) => {
  try {
    const page = await getCurrentPage();
    res.json({
      ok: true,
      text: await readBodyText(page),
      html: await page.content()
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/evaluate", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "evaluate", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/screenshot", async (req, res) => {
  try {
    const body = await resolveJsonBody(req);
    const page = await getCurrentPage();
    const result = await runAction(page, "screenshot", body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/close", async (_req, res) => {
  try {
    ready = false;
    if (context) {
      await context.close();
      context = undefined;
    }
    if (launchedBrowser) {
      launchedBrowser = undefined;
    }
    res.json({ ok: true });
    process.nextTick(() => process.exit(0));
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.use((error, _req, res, _next) => {
  res.status(500).json({ ok: false, error: error.message });
});

await startBrowser();

const server = app.listen(port, host, () => {
  console.log(
    JSON.stringify(
      {
        ok: true,
        host,
        port,
        headless,
        channel: channel || "default",
        cdpUrl: cdpUrl || undefined,
        profileDir,
        screenshotDir,
        startUrl
      },
      null,
      2
    )
  );
});

async function shutdown(signal) {
  try {
    ready = false;
    await new Promise((resolve) => server.close(resolve));
  } catch {
    // ignore
  }
  try {
    if (context) {
      await context.close();
    }
  } catch {
    // ignore
  }
  try {
    if (launchedBrowser && cdpUrl) {
      await launchedBrowser.close();
    }
  } catch {
    // ignore
  }
  process.exit(signal ? 0 : 1);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
