export const SITE_URL = "https://app.notebill.app";
export const DEFAULT_TITLE = "NoteBill | AI invoice app for phone-first businesses";
export const DEFAULT_DESCRIPTION =
  "NoteBill helps freelancers, contractors, and small business owners turn rough job notes into clean invoices, statements, and follow-up on mobile.";

export const PUBLIC_PAGE_METADATA = {
  "/": {
    title: "NoteBill | AI invoice app for freelancers and contractors",
    description:
      "Turn rough job notes into clean invoices, statements, and follow-up with a phone-first AI invoice app."
  },
  "/invoice-app-on-phone": {
    title: "Invoice app on phone for freelancers and contractors | NoteBill",
    description:
      "Phone-first invoice, bill maker, and mobile billing app for rough notes, clean invoices, and follow-up on Google Play.",
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "MobileApplication",
          name: "NoteBill",
          operatingSystem: "Android",
          applicationCategory: "BusinessApplication",
          url: `${SITE_URL}/invoice-app-on-phone`,
          downloadUrl: "https://play.google.com/store/apps/details?id=app.notebill.app",
          offers: [
            {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD"
            }
          ],
          description:
            "Phone-first invoice and billing app for turning rough job notes into clean invoices, payment handoff, and follow-up."
        },
        {
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Can I try it before I pay?",
              acceptedAnswer: {
                "@type": "Answer",
                text:
                  "Yes. The install is free, the web draft flow is still available, and the point is to see whether the workflow earns a place in your business before you upgrade."
              }
            },
            {
              "@type": "Question",
              name: "Do I still approve the money part?",
              acceptedAnswer: {
                "@type": "Answer",
                text:
                  "Yes. Billie helps shape the draft, but totals, discounts, tax, and send decisions stay visible before anything becomes final."
              }
            },
            {
              "@type": "Question",
              name: "Why install instead of staying on web?",
              acceptedAnswer: {
                "@type": "Answer",
                text:
                  "Use the Android app if that is where the work already starts. Google Play billing and restore stay inside the same app, and save, payment link, and follow-up stay attached to the same invoice."
              }
            }
          ]
        }
      ]
    }
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
} satisfies Record<string, { title: string; description: string; structuredData?: Record<string, unknown> }>;

export function injectPageMetadata(
  html: string,
  pathname: string,
  metadata: { title: string; description: string; structuredData?: Record<string, unknown> }
) {
  const canonicalUrl = `${SITE_URL}${pathname === "/" ? "/" : pathname}`;
  const dynamicStructuredData = metadata.structuredData
    ? `\n    <script id="nb-route-structured-data" type="application/ld+json">${JSON.stringify(metadata.structuredData)}</script>`
    : "";

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
    )
    .replace(/<script id="nb-route-structured-data"[\s\S]*?<\/script>/i, "")
    .replace("</head>", `${dynamicStructuredData}\n  </head>`);
}
