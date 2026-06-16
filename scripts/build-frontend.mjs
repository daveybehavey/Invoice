import path from "node:path";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { build as esbuild } from "esbuild";
import dotenv from "dotenv";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const distDir = path.join(publicDir, "dist");
const tailwindInput = path.join(publicDir, "styles", "app.css");
const tailwindConfig = path.join(rootDir, "tailwind.config.cjs");
const tailwindOutput = path.join(distDir, "app.css");
const runtimeConfigOutput = path.join(distDir, "runtime-config.js");
const buildMetaOutput = path.join(distDir, "build-meta.js");
const indexHtmlPath = path.join(publicDir, "index.html");
const spaShellHtmlPath = path.join(publicDir, "spa-shell.html");
const prerenderedMarketingRoutes = {
  "/invoice-app-on-phone": {
    title: "Invoice app on phone for freelancers and contractors | NoteBill",
    description:
      "Phone-first invoice, bill maker, and mobile billing app for rough notes, clean invoices, and follow-up on Google Play."
  },
  "/mobile-invoice-app": {
    title: "Mobile invoice app for freelancers and contractors | NoteBill",
    description:
      "Mobile invoice app for fast note-to-invoice flow, statements, and follow-up on phone or desktop."
  },
  "/bill-maker-app": {
    title: "Bill maker app for freelancers and service businesses | NoteBill",
    description:
      "Bill maker app for turning rough job notes into clean bills, invoices, and follow-up without blank-template friction."
  },
  "/mobile-billing-app": {
    title: "Mobile billing app for reminders and follow-up | NoteBill",
    description:
      "Mobile billing app for rough notes, invoice review, payment handoff, reminders, and follow-up in one workflow."
  },
  "/ai-invoicing-app": {
    title: "AI invoice generator for freelancers and contractors | NoteBill",
    description:
      "AI invoice generator for rough notes, cleaner drafts, and a visible review before you save or send."
  },
  "/ai-invoice-app": {
    title: "AI invoice app for quick drafts | NoteBill",
    description:
      "AI invoice app for rough notes, cleaner drafts, and a clearer review before save or send."
  },
  "/ai-billing-app": {
    title: "AI billing app for reminders and follow-up | NoteBill",
    description:
      "AI billing app for reminders, follow-up wording, payment handoff, and cleaner billing flow."
  },
  "/how-to-make-an-invoice-on-your-phone": {
    title: "How to make an invoice on your phone | NoteBill",
    description:
      "How to make an invoice on your phone using rough notes, clear review, and a better mobile billing workflow."
  },
  "/invoice-app-for-contractors": {
    title: "Invoice app for contractors | NoteBill",
    description:
      "Invoice app for contractors that turns rough job notes into clean invoices, statements, and follow-up."
  },
  "/invoice-app-for-service-businesses": {
    title: "Invoice app for service businesses | NoteBill",
    description:
      "Invoice app for service businesses with invoices, statements, follow-up, and repeat-client memory."
  },
  "/client-statements-and-follow-up": {
    title: "Client statements and follow-up | NoteBill",
    description:
      "Client statement and follow-up workflow for open balances, reminders, and cleaner collections."
  },
  "/help": {
    title: "Help Center | NoteBill",
    description:
      "Get help using NoteBill for rough notes, clean invoices, statements, follow-up, and billing recovery."
  },
  "/support": {
    title: "Support | NoteBill",
    description:
      "Contact NoteBill support for billing, restore, invoice delivery, and workflow help."
  },
  "/privacy": {
    title: "Privacy Policy | NoteBill",
    description:
      "Read the NoteBill privacy policy for account, invoice, billing, and data handling details."
  },
  "/data-deletion": {
    title: "Account and data deletion | NoteBill",
    description:
      "Request NoteBill account deletion and understand what account-linked data is removed or retained."
  },
  "/feedback": {
    title: "Feedback | NoteBill",
    description:
      "Share NoteBill feedback, bugs, tester notes, and workflow friction so the product keeps improving."
  }
};
const tailwindCli = path.join(rootDir, "node_modules", "tailwindcss", "lib", "cli.js");
const vendorFiles = [
  ["node_modules/react/umd/react.production.min.js", "react.production.min.js"],
  ["node_modules/react-dom/umd/react-dom.production.min.js", "react-dom.production.min.js"],
  ["node_modules/@remix-run/router/dist/router.umd.min.js", "router.umd.min.js"],
  ["node_modules/react-router/dist/umd/react-router.production.min.js", "react-router.production.min.js"],
  [
    "node_modules/react-router-dom/dist/umd/react-router-dom.production.min.js",
    "react-router-dom.production.min.js"
  ]
];

async function main() {
  await fs.mkdir(distDir, { recursive: true });
  await clearDirectory(distDir);

  const jsxFiles = await collectFiles(publicDir, ".jsx");
  const jsFiles = await collectFiles(publicDir, ".js");

  await Promise.all(
    jsxFiles.map(async (absolutePath) => {
      const relativePath = path.relative(publicDir, absolutePath).replace(/\.jsx$/i, ".js");
      const destination = path.join(distDir, relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
    })
  );

  if (jsxFiles.length > 0) {
    await esbuild({
      entryPoints: jsxFiles,
      outdir: distDir,
      outbase: publicDir,
      bundle: false,
      logLevel: "info",
      target: "es2020",
      loader: { ".jsx": "jsx" }
    });
  }

  await Promise.all(
    jsFiles.map(async (absolutePath) => {
      const relativePath = path.relative(publicDir, absolutePath);
      const destination = path.join(distDir, relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(absolutePath, destination);
    })
  );

  await runTailwindBuild();
  await writeRuntimeConfig();
  await writeBuildMeta();
  await syncSpaShellHtml();
  await writePrerenderedMarketingShells();
  await copyVendorAssets();
}

async function loadRepoEnv() {
  const merged = {};
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(rootDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    Object.assign(merged, dotenv.parse(await fs.readFile(filePath, "utf8")));
  }
  return merged;
}

function normalizePublicValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function writeRuntimeConfig() {
  const repoEnv = await loadRepoEnv();
  const publicConfig = {
    googleClientId: normalizePublicValue(process.env.GOOGLE_CLIENT_ID ?? repoEnv.GOOGLE_CLIENT_ID),
    googleAnalyticsMeasurementId: normalizePublicValue(
      process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID ??
        process.env.GA4_MEASUREMENT_ID ??
        repoEnv.GOOGLE_ANALYTICS_MEASUREMENT_ID ??
        repoEnv.GA4_MEASUREMENT_ID
    ),
    internalBillingDebug: ["1", "true", "yes", "on"].includes(
      normalizePublicValue(process.env.INVOICE_INTERNAL_BILLING_DEBUG ?? repoEnv.INVOICE_INTERNAL_BILLING_DEBUG).toLowerCase()
    )
  };
  const source = [
    "window.InvoicePublicConfig = Object.freeze(",
    JSON.stringify(publicConfig, null, 2),
    ");",
    ""
  ].join("");
  await fs.writeFile(runtimeConfigOutput, source, "utf8");
}

async function writeBuildMeta() {
  const buildId = new Date().toISOString();
  const source = [
    "window.InvoiceBuildMeta = Object.freeze(",
    JSON.stringify({ buildId }, null, 2),
    ");",
    ""
  ].join("");
  await fs.writeFile(buildMetaOutput, source, "utf8");
}

async function syncSpaShellHtml() {
  await fs.copyFile(indexHtmlPath, spaShellHtmlPath);
}

function injectMarketingMetadata(html, pathname, metadata) {
  const canonicalUrl = `https://app.notebill.app${pathname}`;
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${metadata.title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${metadata.description}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${metadata.title}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${metadata.description}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${canonicalUrl}" />`
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${metadata.title}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${metadata.description}" />`
    )
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${canonicalUrl}" />`
    );
}

async function writePrerenderedMarketingShells() {
  const baseHtml = await fs.readFile(spaShellHtmlPath, "utf8");
  await Promise.all(
    Object.entries(prerenderedMarketingRoutes).map(async ([pathname, metadata]) => {
      const outputPath = path.join(publicDir, pathname.replace(/^\//, ""));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const html =
        pathname === "/invoice-app-on-phone"
          ? renderInvoiceAppOnPhoneLandingHtml(metadata)
          : injectMarketingMetadata(baseHtml, pathname, metadata);
      await fs.writeFile(outputPath, html, "utf8");
    })
  );
}

function renderInvoiceAppOnPhoneLandingHtml(metadata) {
  const title = metadata.title;
  const description = metadata.description;
  const structuredData = metadata.structuredData
    ? `
    <script type="application/ld+json">${JSON.stringify(metadata.structuredData)}</script>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="theme-color" content="#14532d" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://app.notebill.app/invoice-app-on-phone" />
    <meta property="og:image" content="https://app.notebill.app/icons/notebill-512.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="https://app.notebill.app/icons/notebill-512.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="NoteBill" />
    <link rel="canonical" href="https://app.notebill.app/invoice-app-on-phone" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/notebill-192.png" />
    <link rel="apple-touch-icon" href="/icons/notebill-192.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    ${structuredData}
    <link rel="stylesheet" href="/dist/app.css" />
    <script>
      (function () {
        var endpoint = "/api/telemetry/revenue-signals";
        var send = function (event, source) {
          try {
            var payload = JSON.stringify({ event: event, source: source });
            fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true
            });
          } catch (_error) {}
        };
        send("billing_plan_viewed", "landing:phone");
        document.addEventListener("click", function (event) {
          var target =
            event.target && event.target.closest
              ? event.target.closest('[data-revenue-cta="play"], [data-revenue-cta="sample-pdf"]')
              : null;
          if (target) {
            send(
              target.getAttribute("data-revenue-cta") === "sample-pdf"
                ? "landing_invoice_sample_opened"
                : "billing_plan_selected",
              "landing:phone"
            );
          }
        });
      })();
    </script>
  </head>
  <body class="bg-slate-50 text-slate-900">
    <main class="nb-page nb-page--quiet bg-[linear-gradient(180deg,#f4f7f4_0%,#eef4ef_100%)]">
      <section class="relative overflow-hidden rounded-[38px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_28px_70px_rgba(15,23,42,0.08)] md:px-8 md:py-8 lg:px-10 lg:py-10">
        <div class="pointer-events-none absolute right-[-8%] top-[-4%] h-72 w-72 rounded-full bg-[#d9eee1]/45 blur-3xl"></div>
        <div class="pointer-events-none absolute bottom-[-18%] left-[24%] h-72 w-72 rounded-full bg-[#edf5ef] blur-3xl"></div>
        <div class="relative grid gap-8 lg:grid-cols-[1fr_0.96fr] lg:items-center">
          <div class="max-w-2xl">
            <span class="inline-flex items-center rounded-full border border-[#d4e2d8] bg-[#f6faf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#2d5e50]">
              Invoice app on phone
            </span>
            <h1 class="mt-4 max-w-[11ch] text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl lg:text-[3.55rem] lg:leading-[1.02]">
              From rough job notes to a client-ready invoice on your phone.
            </h1>
            <p class="mt-4 max-w-xl text-base leading-8 text-slate-600 md:text-lg">
              NoteBill helps freelancers, contractors, and small business owners turn messy job notes into client-ready invoices on the phone without fighting blank templates or bulky accounting tools.
            </p>
            <div class="mt-6 flex flex-wrap gap-3">
              <span class="rounded-full border border-[#d7e2da] bg-[#f9fbfa] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#44695c]">Phone-first invoicing</span>
              <span class="rounded-full border border-[#d7e2da] bg-[#f9fbfa] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#44695c]">Review before send</span>
              <span class="rounded-full border border-[#d7e2da] bg-[#f9fbfa] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#44695c]">Google Play billing</span>
            </div>
            <div class="mt-8 flex flex-col gap-4 lg:max-w-xl">
              <a href="https://play.google.com/store/apps/details?id=app.notebill.app" target="_blank" rel="noreferrer" data-revenue-cta="play" aria-label="Get it on Google Play" class="group inline-flex rounded-[24px] border border-white/14 bg-[#0a0d0b] p-2 shadow-[0_18px_44px_rgba(8,15,11,0.32)] transition hover:-translate-y-0.5 hover:border-white/28 hover:shadow-[0_26px_54px_rgba(8,15,11,0.36)]">
                <img src="/landing/google-play-badge-official.png" alt="Get it on Google Play" loading="eager" fetchpriority="high" decoding="async" class="h-[54px] w-auto rounded-[14px] object-contain" />
              </a>
              <div class="flex flex-wrap items-center gap-3">
                <a href="/landing/invoice-export-samples/classic-split.pdf" target="_blank" rel="noreferrer" data-revenue-cta="sample-pdf" class="inline-flex items-center justify-center rounded-full border border-[#cfe1d6] bg-white px-5 py-3 text-sm font-semibold text-[#17493c] shadow-[0_10px_24px_rgba(20,83,45,0.06)] transition hover:-translate-y-0.5 hover:border-[#b8cec0]">View sample invoice</a>
                <a href="/ai-intake?mode=quick" class="text-sm font-semibold text-[#2d5e50] underline decoration-[#bfd0c3] decoration-2 underline-offset-4 transition hover:text-[#17493c]">Try the web version first</a>
              </div>
            </div>
            <p class="mt-4 text-sm leading-6 text-slate-500">Free install on Google Play. Paid unlocks the repeat workflow: saved client details, sends, reminders, payment links, memory, and sync when the app becomes part of your monthly routine.</p>
            <div class="mt-5 grid gap-3 sm:grid-cols-3">
              <div class="rounded-[22px] border border-[#d7e2da] bg-[#f8fbf8] px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Review first</p>
                <p class="mt-2 text-sm leading-6 text-slate-600">Money and wording stay visible before you save or send.</p>
              </div>
              <div class="rounded-[22px] border border-[#d7e2da] bg-[#f8fbf8] px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Phone-first</p>
                <p class="mt-2 text-sm leading-6 text-slate-600">The workflow feels designed for the same phone where the notes already live.</p>
              </div>
              <div class="rounded-[22px] border border-[#d7e2da] bg-[#f8fbf8] px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Billing nearby</p>
                <p class="mt-2 text-sm leading-6 text-slate-600">Save, payment link, and follow-up stay attached to the same invoice.</p>
              </div>
            </div>
          </div>
          <div class="relative">
            <div class="rounded-[34px] border border-[#d9e4dc] bg-[linear-gradient(180deg,#f8fbf8_0%,#eef5f0_100%)] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div class="grid gap-4">
                <div class="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
                  <div class="rounded-[30px] border border-[#d9e4dc] bg-[#fdfefd] p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                    <img src="/landing/phone-workflow-1.svg" alt="NoteBill phone screen showing rough notes turning into a draft invoice." width="1200" height="900" fetchpriority="high" class="mx-auto w-full max-w-[280px] rounded-[24px] border border-[#e4ebe6] bg-white" />
                  </div>
                  <div class="grid content-start gap-3">
                    <div class="rounded-[26px] border border-[#d7e2da] bg-white px-4 py-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">What the install gets you</p>
                      <p class="mt-2 text-xl font-semibold leading-8 text-slate-950">Start from the notes you already have instead of rebuilding the invoice from scratch.</p>
                      <p class="mt-2 text-sm leading-6 text-slate-600">Billie helps shape the draft, but the workflow still slows down at the right moment so you can review the money and wording before anything goes out.</p>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-2">
                      <div class="rounded-[24px] border border-[#d7e2da] bg-white px-4 py-4">
                        <p class="text-sm font-semibold text-slate-950">Cleaner than templates</p>
                        <p class="mt-2 text-sm leading-6 text-slate-600">You are not dropped into a blank invoice form before the draft is even visible.</p>
                      </div>
                      <div class="rounded-[24px] border border-[#d7e2da] bg-white px-4 py-4">
                        <p class="text-sm font-semibold text-slate-950">Cleaner than app soup</p>
                        <p class="mt-2 text-sm leading-6 text-slate-600">Save, payment, and follow-up stay closer than they do across chat, docs, and a finance tool.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="hidden rounded-[28px] border border-[#d7e2da] bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:block">
                  <div class="flex items-center justify-between gap-3 px-2 pb-3">
                    <div>
                      <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Real export proof</p>
                      <p class="mt-1 text-sm text-slate-600">A real sample invoice exported from the app, not a fake preview block.</p>
                    </div>
                    <a href="/landing/invoice-export-samples/classic-split.pdf" target="_blank" rel="noreferrer" class="rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-4 py-2 text-sm font-semibold text-[#17493c]">Open sample PDF</a>
                  </div>
                  <div class="overflow-hidden rounded-[22px] border border-[#e2e9e4] bg-white">
                    <img src="/landing/invoice-export-samples/classic-split.preview.png" alt="Real exported invoice preview from NoteBill showing a painter finish work invoice." width="1090" height="1314" loading="eager" fetchpriority="high" decoding="async" class="h-auto w-full bg-white object-contain" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="mt-6 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div class="rounded-[32px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p class="nb-kicker">What happens after the tap</p>
            <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">A short path from notes to a sendable invoice</h2>
            <div class="mt-5 grid gap-4 md:grid-cols-3">
              <div class="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-[#2d5e50]">01</p>
                <h3 class="mt-3 text-lg font-semibold tracking-tight text-slate-950">Paste rough notes</h3>
                <p class="mt-2 text-sm leading-7 text-slate-600">Use the job details you already have instead of rewriting everything into a form first.</p>
              </div>
              <div class="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-[#2d5e50]">02</p>
                <h3 class="mt-3 text-lg font-semibold tracking-tight text-slate-950">Review the clean draft</h3>
                <p class="mt-2 text-sm leading-7 text-slate-600">Billie helps structure the invoice, but the totals and final wording stay visible before you save or send.</p>
              </div>
              <div class="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-[#2d5e50]">03</p>
                <h3 class="mt-3 text-lg font-semibold tracking-tight text-slate-950">Install if Android is the fit</h3>
                <p class="mt-2 text-sm leading-7 text-slate-600">Google Play billing and restore stay inside the installed app, which makes upgrades and repeat use feel more complete.</p>
              </div>
            </div>
          </div>
          <div class="rounded-[32px] border border-[#d9e4dc] bg-[linear-gradient(180deg,#ffffff_0%,#f7faf8_100%)] px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p class="nb-kicker">Why install instead of staying on web</p>
            <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Use the app if Android is where the work already starts</h2>
            <ul class="mt-5 space-y-3 text-sm leading-7 text-slate-700">
              <li class="flex items-start gap-3"><span class="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]"></span><span>Start from rough notes instead of a blank invoice template.</span></li>
              <li class="flex items-start gap-3"><span class="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]"></span><span>Keep Google Play billing and restore inside the same app people use in the field.</span></li>
              <li class="flex items-start gap-3"><span class="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]"></span><span>Save, payment link, and follow-up stay tied to the same invoice once the job is done.</span></li>
            </ul>
          </div>
        </section>
        <section class="mt-10 rounded-[34px] border border-[#d9e4dc] bg-[linear-gradient(180deg,#ffffff_0%,#f7faf8_100%)] px-5 py-6 shadow-[0_22px_58px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
          <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div class="max-w-3xl">
              <p class="nb-kicker">Real exported invoice examples</p>
          <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Real exported invoices that look client-ready on first open</h2>
          <p class="mt-3 text-sm leading-7 text-slate-600 md:text-[15px]">These are actual PDFs exported from NoteBill. Each sample uses a different layout so the page shows believable work, not a placeholder illustration.</p>
        </div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tap a sample to inspect the full PDF</p>
      </div>
      <div class="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#44695c]">
        <span class="rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-3 py-2">Real PDFs from the app</span>
        <span class="rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-3 py-2">Three visual directions</span>
        <span class="rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-3 py-2">Open the full sample PDF</span>
      </div>
      <div class="mt-5 grid gap-5 xl:grid-cols-3">
            <article class="overflow-hidden rounded-[30px] border border-[#d7e2da] bg-white p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Real PDF sample</p>
                  <h3 class="mt-2 text-xl font-semibold tracking-tight text-slate-950">North Shore Paint Co</h3>
                <p class="mt-1 text-sm text-slate-500">Classic layout \u00b7 painter finish work</p>
                </div>
                <span class="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Classic</span>
              </div>
              <div class="mt-4 overflow-hidden rounded-[24px] border border-[#d9e4dc] bg-[#f6f8f7] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                <div class="overflow-hidden rounded-[18px] border border-[#dfe7e1] bg-white shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
                  <img src="/landing/invoice-export-samples/classic-split.preview.png" alt="Real exported invoice preview from NoteBill showing a painter finish work invoice." width="1090" height="1314" loading="lazy" decoding="async" class="h-auto w-full bg-white object-contain" />
                </div>
              </div>
              <p class="mt-4 text-sm leading-7 text-slate-600">A repaint invoice with labor, materials, and a balance block that still feels polished on first open.</p>
              <div class="mt-4 flex flex-wrap items-center gap-3"><a href="/landing/invoice-export-samples/classic-split.pdf" target="_blank" rel="noreferrer" data-revenue-cta="sample-pdf" class="inline-flex items-center justify-center rounded-full border border-[#cfe1d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#17493c] shadow-[0_10px_24px_rgba(20,83,45,0.06)]">Open sample PDF</a><span class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Exported from the app</span></div>
            </article>
            <article class="overflow-hidden rounded-[30px] border border-[#d7e2da] bg-white p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Real PDF sample</p>
                  <h3 class="mt-2 text-xl font-semibold tracking-tight text-slate-950">Harbour HVAC Service</h3>
                <p class="mt-1 text-sm text-slate-500">Minimal layout \u00b7 HVAC service call</p>
                </div>
                <span class="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Minimal</span>
              </div>
              <div class="mt-4 overflow-hidden rounded-[24px] border border-[#d9e4dc] bg-[#f6f8f7] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                <div class="overflow-hidden rounded-[18px] border border-[#dfe7e1] bg-white shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
                  <img src="/landing/invoice-export-samples/minimal-centered.preview.png" alt="Minimal exported HVAC invoice example from NoteBill." width="1090" height="1343" loading="lazy" decoding="async" class="h-auto w-full bg-white object-contain" />
                </div>
              </div>
              <p class="mt-4 text-sm leading-7 text-slate-600">A tighter service-call invoice for diagnostics, parts, and one quick payment decision without visual clutter.</p>
              <div class="mt-4 flex flex-wrap items-center gap-3"><a href="/landing/invoice-export-samples/minimal-centered.pdf" target="_blank" rel="noreferrer" data-revenue-cta="sample-pdf" class="inline-flex items-center justify-center rounded-full border border-[#cfe1d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#17493c] shadow-[0_10px_24px_rgba(20,83,45,0.06)]">Open sample PDF</a><span class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Exported from the app</span></div>
            </article>
            <article class="overflow-hidden rounded-[30px] border border-[#d7e2da] bg-white p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Real PDF sample</p>
                  <h3 class="mt-2 text-xl font-semibold tracking-tight text-slate-950">Cedar Ridge Grounds Co</h3>
                <p class="mt-1 text-sm text-slate-500">Bold layout \u00b7 landscape monthly billing</p>
                </div>
                <span class="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Bold</span>
              </div>
              <div class="mt-4 overflow-hidden rounded-[24px] border border-[#d9e4dc] bg-[#f6f8f7] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                <div class="overflow-hidden rounded-[18px] border border-[#dfe7e1] bg-white shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
                  <img src="/landing/invoice-export-samples/bold-split.preview.png" alt="Bold exported landscape invoice example from NoteBill." width="1090" height="1345" loading="lazy" decoding="async" class="h-auto w-full bg-white object-contain" />
                </div>
              </div>
              <p class="mt-4 text-sm leading-7 text-slate-600">A more branded monthly billing invoice that still feels client-safe when recurring work needs a stronger look.</p>
              <div class="mt-4 flex flex-wrap items-center gap-3"><a href="/landing/invoice-export-samples/bold-split.pdf" target="_blank" rel="noreferrer" data-revenue-cta="sample-pdf" class="inline-flex items-center justify-center rounded-full border border-[#cfe1d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#17493c] shadow-[0_10px_24px_rgba(20,83,45,0.06)]">Open sample PDF</a><span class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Exported from the app</span></div>
            </article>
          </div>
        </section>
        <section class="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div class="rounded-[32px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p class="nb-kicker">What to know before you install</p>
            <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Use it free first. Pay only if the workflow earns it.</h2>
            <div class="mt-5 grid gap-3 md:grid-cols-2">
              <div class="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4"><p class="text-sm font-semibold text-slate-950">What it is</p><ul class="mt-3 space-y-2 text-sm leading-6 text-slate-700"><li class="flex items-start gap-3"><span class="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]"></span><span>A phone-first invoice and billing workflow for messy job notes.</span></li><li class="flex items-start gap-3"><span class="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]"></span><span>A cleaner path from draft review to save, send, payment, and follow-up.</span></li></ul></div>
              <div class="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4"><p class="text-sm font-semibold text-slate-950">What it is not</p><ul class="mt-3 space-y-2 text-sm leading-6 text-slate-700"><li class="flex items-start gap-3"><span class="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#c58f3b]"></span><span>A generic blank invoice template.</span></li><li class="flex items-start gap-3"><span class="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#c58f3b]"></span><span>A bookkeeping suite trying to do everything.</span></li></ul></div>
            </div>
          </div>
          <div class="rounded-[32px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p class="nb-kicker">Quick answers</p>
            <div class="mt-4 space-y-3">
              <div class="rounded-[22px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4"><p class="text-sm font-semibold text-slate-950">Can I try it before I pay?</p><p class="mt-2 text-sm leading-6 text-slate-600">Yes. The install is free, the web draft flow is still available, and the point is to see whether the workflow earns a place in your business before you upgrade.</p></div>
              <div class="rounded-[22px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4"><p class="text-sm font-semibold text-slate-950">Do I still approve the money part?</p><p class="mt-2 text-sm leading-6 text-slate-600">Yes. Billie helps shape the draft, but totals, discounts, tax, and send decisions stay visible before anything becomes final.</p></div>
            </div>
          </div>
        </section>
        <section class="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center rounded-[34px] border border-[#d9e4dc] bg-[linear-gradient(145deg,#10261b_0%,#17493c_52%,#143628_100%)] px-5 py-6 text-white shadow-[0_24px_72px_rgba(20,83,45,0.16)] md:px-8 md:py-8">
          <div class="max-w-2xl">
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d8ece0]">Ready to install</p>
            <h2 class="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">Put the invoice workflow on the same phone where the job notes already live.</h2>
            <p class="mt-3 text-sm leading-7 text-white/76 md:text-[15px]">If the phone is where the work starts, the app should meet you there with a clean draft, a clearer review, and an easier path to getting paid.</p>
          </div>
          <div class="flex flex-col gap-3">
            <a href="https://play.google.com/store/apps/details?id=app.notebill.app" target="_blank" rel="noreferrer" data-revenue-cta="play" aria-label="Get it on Google Play" class="group inline-flex rounded-[24px] border border-white/14 bg-[#0a0d0b] p-2 shadow-[0_18px_44px_rgba(8,15,11,0.32)] transition hover:-translate-y-0.5 hover:border-white/28 hover:shadow-[0_26px_54px_rgba(8,15,11,0.36)]">
              <img src="/landing/google-play-badge-official.png" alt="Get it on Google Play" loading="eager" decoding="async" class="h-[54px] w-auto rounded-[14px] object-contain" />
            </a>
            <a href="https://play.google.com/store/apps/details?id=app.notebill.app" target="_blank" rel="noreferrer" class="text-center text-sm font-semibold text-white/74 underline decoration-white/24 underline-offset-4 hover:text-white">Find us on Google Play</a>
          </div>
        </section>
      </main>
    </body>
  </html>`;
}

async function collectFiles(directory, extension) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "dist") {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, extension)));
      continue;
    }
    // Windows can surface moved OneDrive-backed files as reparse points.
    // Node can still read them normally, but Dirent.isFile() may return false.
    if (!entry.isDirectory() && absolutePath.endsWith(extension)) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function clearDirectory(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(directory, entry.name), { recursive: true, force: true })
    )
  );
}

async function runTailwindBuild() {
  await new Promise((resolve, reject) => {
    const args = ["-c", tailwindConfig, "-i", tailwindInput, "-o", tailwindOutput, "--minify"];
    const child = spawn(process.execPath, [tailwindCli, ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        BROWSERSLIST_IGNORE_OLD_DATA: "1"
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tailwind build failed with exit code ${code}`));
    });
  });
}

async function copyVendorAssets() {
  const vendorDir = path.join(distDir, "vendor");
  await fs.mkdir(vendorDir, { recursive: true });
  await Promise.all(
    vendorFiles.map(async ([sourceRelativePath, destinationFileName]) => {
      const source = path.join(rootDir, sourceRelativePath);
      const destination = path.join(vendorDir, destinationFileName);
      await fs.copyFile(source, destination);
    })
  );
}

main().catch((error) => {
  console.error("[build-frontend] failed", error);
  process.exitCode = 1;
});
