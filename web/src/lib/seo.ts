import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface SeoEntry {
  title: string;
  description: string;
  canonicalPath: string;
}

const DEFAULT_SEO: SeoEntry = {
  title: "NoteBill — Dump the Mess. Get Paid Before You Leave the Driveway.",
  description:
    "Turn rough job notes, voice memos, or receipts into crisp, itemized invoices and quotes in seconds — with zero silent price assumptions.",
  canonicalPath: "/"
};

const ROUTE_SEO: Array<[string, SeoEntry]> = [
  ["/", DEFAULT_SEO],
  [
    "/pricing",
    {
      title: "Pricing — NoteBill Free & Pro ($19/mo)",
      description:
        "Start drafting and exporting PDF invoices free. Upgrade to NoteBill Pro for unlimited cloud saves, client quote e-signatures, photo proof, and automated follow-ups.",
      canonicalPath: "/pricing"
    }
  ],
  [
    "/free-invoice-generator",
    {
      title: "Free Contractor & Freelancer Invoice Generator — NoteBill",
      description:
        "Paste rough job notes or pick a trade preset to generate and download a clean itemized PDF invoice right in your browser — no signup required.",
      canonicalPath: "/free-invoice-generator"
    }
  ],
  [
    "/contractor-estimate-template",
    {
      title: "Free Contractor Estimate & Good/Better/Best Quote Template — NoteBill",
      description:
        "Build clear Good / Better / Best contractor estimates with deposit requests and download a PDF or send for 1-tap client e-signature.",
      canonicalPath: "/contractor-estimate-template"
    }
  ],
  [
    "/materials-markup-calculator",
    {
      title: "Materials Markup vs. Profit Margin Calculator for Trades — NoteBill",
      description:
        "Calculate exact parts selling price, gross materials profit, margin vs. markup percentage, and push itemized labor & parts straight into an invoice.",
      canonicalPath: "/materials-markup-calculator"
    }
  ],
  [
    "/create",
    {
      title: "Workbench — Create Invoice or Quote | NoteBill",
      description:
        "Turn rough notes, job timers, quick-bundles, and job-site photos into ready-to-send invoices and quotes.",
      canonicalPath: "/create"
    }
  ],
  [
    "/jobs",
    {
      title: "Jobs, Unbilled Notes & Scratchpad — NoteBill",
      description:
        "Track sent, overdue, and paid invoices alongside your unbilled field scratchpad notes and tax-time CSV export.",
      canonicalPath: "/jobs"
    }
  ],
  [
    "/brand",
    {
      title: "Brand, Payment Methods & Defaults — NoteBill",
      description:
        "Configure your business logo, accepted payment methods, default invoice theme, Google Review link, and saved client memory.",
      canonicalPath: "/brand"
    }
  ],
  [
    "/terms",
    {
      title: "Terms of Service — NoteBill",
      description: "Read, download, or print NoteBill Terms of Service and versioned subscription disclosures.",
      canonicalPath: "/terms"
    }
  ],
  [
    "/privacy",
    {
      title: "Privacy Policy — NoteBill",
      description: "Read NoteBill's Privacy Policy covering invoice records, client data, and local device storage.",
      canonicalPath: "/privacy"
    }
  ],
  [
    "/support",
    {
      title: "Support — NoteBill",
      description: "Contact NoteBill support for help with invoices, quotes, exports, or billing.",
      canonicalPath: "/support"
    }
  ]
];

function resolveSeoForPath(pathname: string): SeoEntry {
  const exact = ROUTE_SEO.find(([prefix]) => pathname === prefix);
  if (exact) return exact[1];
  if (pathname === "/ai-intake" || pathname === "/manual" || pathname === "/import") {
    return ROUTE_SEO.find(([p]) => p === "/create")![1];
  }
  if (pathname === "/invoices" || pathname === "/scratchpad" || pathname === "/dashboard" || pathname === "/clients") {
    return ROUTE_SEO.find(([p]) => p === "/jobs")![1];
  }
  if (pathname.startsWith("/settings")) {
    return ROUTE_SEO.find(([p]) => p === "/brand")![1];
  }
  if (pathname === "/help" || pathname === "/feedback") {
    return ROUTE_SEO.find(([p]) => p === "/support")![1];
  }
  return DEFAULT_SEO;
}

export function RouteSeoSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = resolveSeoForPath(pathname);
    document.title = seo.title;

    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) {
      descEl.setAttribute("content", seo.description);
    }

    const canonicalHref = `https://notebill.app${seo.canonicalPath === "/" ? "/" : seo.canonicalPath}`;
    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute("href", canonicalHref);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", seo.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", seo.description);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", canonicalHref);
  }, [pathname]);

  return null;
}
