/**

 * Canonical paid-beta legal foundation for NoteBill (product of EuroDigital).

 * Keep client mirror in public/utils/legalFoundation.js aligned with this module.

 */



export const LEGAL_TERMS_VERSION = "2026-08-12.1";

export const LEGAL_PRIVACY_VERSION = "2026-08-12.1";

export const LEGAL_EFFECTIVE_DATE = "2026-08-12";



export const LEGAL_SUPPLIER = {

  legalName: "David Heslop, carrying on business as EuroDigital",

  tradeStyle: "EuroDigital",

  productName: "NoteBill",

  addressLine: "1193 Kangaroo Road, Metchosin, BC V9C 4C9, Canada",

  supportEmail: "support@notebill.app",

  privacyEmail: "support@notebill.app",

  siteUrl: "https://notebill.app",

  appUrl: "https://app.notebill.app"

} as const;



export const LEGAL_OFFER = {

  planName: "NoteBill Pro",

  priceDisplay: "$19 USD",

  priceAmount: 19,

  currency: "USD",

  interval: "month",

  intervalLabel: "per month",

  autoRenew: true,

  gstHstRegistered: false,

  stripeTaxEnabled: false,

  salesTaxCollectedByNoteBill: false,

  cancelAnytime: true,

  cancelFee: false,

  cancelEffect: "end_of_paid_billing_period",

  accessAfterCancel: "through_end_of_current_paid_period",

  goodwillRefundDays: 7,

  goodwillRefundScope: "initial_pro_subscription_payment"

} as const;



export type LegalDocumentKind = "terms" | "privacy";



export type LegalSection = {

  title: string;

  paragraphs: string[];

  items?: string[];

  id?: string;

};



export type ResolvedTermsDocument = {

  version: string;

  effectiveDate: string;

  sections: LegalSection[];

  isCurrent: boolean;

  termsUrlPath: string;

};



/** Frozen facts used to build a registered Terms document body (never live LEGAL_* globals). */

export type FrozenTermsFacts = {

  version: string;

  effectiveDate: string;

  privacyVersion: string;

  supplier: {

    legalName: string;

    tradeStyle: string;

    addressLine: string;

    supportEmail: string;

    siteUrl: string;

    appUrl: string;

  };

  offer: {

    planName: string;

    priceDisplay: string;

    intervalLabel: string;

    goodwillRefundDays: number;

  };

};



type RegisteredTermsEntry = {

  version: string;

  effectiveDate: string;

  buildSections: () => LegalSection[];

};



/**

 * Literal freeze of Terms 2026-08-12.1 facts (copied from today's LEGAL_* values).

 * Historical/registered Terms sections must use only this object — never live globals.

 */

export const TERMS_2026_08_12_1_FACTS: Readonly<FrozenTermsFacts> = Object.freeze({

  version: "2026-08-12.1",

  effectiveDate: "2026-08-12",

  privacyVersion: "2026-08-12.1",

  supplier: Object.freeze({

    legalName: "David Heslop, carrying on business as EuroDigital",

    tradeStyle: "EuroDigital",

    addressLine: "1193 Kangaroo Road, Metchosin, BC V9C 4C9, Canada",

    supportEmail: "support@notebill.app",

    siteUrl: "https://notebill.app",

    appUrl: "https://app.notebill.app"

  }),

  offer: Object.freeze({

    planName: "NoteBill Pro",

    priceDisplay: "$19 USD",

    intervalLabel: "per month",

    goodwillRefundDays: 7

  })

});



/** Build Terms sections from explicit frozen facts — never reads LEGAL_* globals. */

export function buildTermsSectionsFromFrozenFacts(facts: FrozenTermsFacts): LegalSection[] {

  const s = facts.supplier;

  const o = facts.offer;

  const termsUrlPath = buildVersionedTermsPath(facts.version);

  return [

    {

      title: "1. Supplier and service identity",

      paragraphs: [

        `The supplier is ${s.legalName}. NoteBill is a product of ${s.tradeStyle}. NoteBill is not a separately registered legal entity or business.`,

        `Business address: ${s.addressLine}.`,

        `Support contact: ${s.supportEmail}. Website: ${s.siteUrl}. App: ${s.appUrl}.`

      ]

    },

    {

      title: "2. Beta service description",

      paragraphs: [

        "NoteBill helps solo service businesses turn rough notes, imports, and drafts into invoices, then save, export, and optionally send or collect payment when those features are configured.",

        "This paid web beta is limited and may change. Availability, features, and capacity can be adjusted as the product develops.",

        "Free accounts are subject to a monthly limit on new saved invoices. NoteBill Pro unlocks unlimited saved invoices for the subscription period. Other workflows such as sending, reminders, hosted payment links, and client memory may be available on Free when configured; they are not separately server-gated by plan tier today. Do not treat Pro marketing claims beyond unlimited saves as separately enforced entitlements unless stated in the product and these Terms."

      ]

    },

    {

      title: "3. Eligibility and account responsibilities",

      paragraphs: [

        "You must be able to form a binding contract and provide accurate account information.",

        "You are responsible for activity under your signed-in account and for keeping access credentials confidential.",

        "NoteBill is intended for business invoicing use by adults, not for children under 13."

      ]

    },

    {

      title: "4. Acceptable use",

      paragraphs: [

        "You may not misuse NoteBill, attempt unauthorized access, interfere with the service, abuse AI or email features, or use the service for unlawful, fraudulent, or harmful purposes.",

        "We may suspend or terminate access for abuse, security risk, or material Terms violations."

      ]

    },

    {

      title: "5. Your content and intellectual property",

      paragraphs: [

        "You retain ownership of content you submit (notes, invoice details, uploads, and similar materials).",

        "You grant EuroDigital a limited license to host, process, transmit, and display that content solely to operate and improve NoteBill for you.",

        "NoteBill software, branding, and documentation remain owned by David Heslop / EuroDigital or its licensors."

      ]

    },

    {

      title: "6. AI and output limitations",

      paragraphs: [

        "AI-assisted drafting, OCR, and transcription can be incomplete or incorrect. You must review invoices before sending or relying on them.",

        "NoteBill does not guarantee error-free operation, uninterrupted availability, or that AI outputs are fit for a particular legal, tax, or professional purpose."

      ]

    },

    {

      title: "7. Free and Pro boundaries",

      paragraphs: [

        "Free plan: limited number of new saved invoices per month (production default is 25 unless configured otherwise).",

        `${o.planName}: unlimited saved invoices while the subscription remains active for your authenticated account.`,

        "Plan status is determined server-side from authenticated identity and Stripe entitlement state."

      ]

    },

    {

      title: "8. Price, billing, renewal, and taxes",

      paragraphs: [

        `${o.planName} costs ${o.priceDisplay} ${o.intervalLabel}. The currency is United States dollars (USD).`,

        "Billing renews automatically each month until you cancel.",

        "David Heslop / EuroDigital is not currently registered for GST/HST. Stripe Tax is off. NoteBill does not currently collect GST/HST or other sales tax. The listed price is not described as tax-inclusive. You remain responsible only for taxes the law directly requires you to pay, if any.",

        "Payment is processed by Stripe. Card details are handled by Stripe, not stored by NoteBill as full card numbers."

      ]

    },

    {

      id: "cancellation",

      title: "9. Cancellation",

      paragraphs: [

        "You may cancel at any time without a cancellation fee or penalty through the Stripe customer portal (Manage billing) or by contacting support.",

        "Cancellation takes effect at the end of the current paid billing period. Pro access remains available through that paid period. Future renewal charges stop after cancellation.",

        "For automatic renewals of 60 days or less, applicable British Columbia consumer-protection rules require that cancellation be available without cancellation fees or penalties; unused time after a mid-period cancel under those rules is generally not refunded as a prorated amount."

      ]

    },

    {

      title: "10. Refunds",

      paragraphs: [

        `Goodwill refund: within ${o.goodwillRefundDays} days of the initial NoteBill Pro subscription payment, you may request a refund through ${s.supportEmail}.`,

        "Duplicate or erroneous charges are eligible for correction or refund.",

        "Otherwise, subscription payments and renewals are non-refundable, and no prorated refunds are offered.",

        "Nothing in these Terms limits non-waivable statutory cancellation, refund, or consumer-protection rights."

      ]

    },

    {

      title: "11. Service changes and termination",

      paragraphs: [

        "We may modify features, beta limits, or these Terms. Material changes to Terms will be reflected by an updated version/effective date on the Terms page.",

        "We may suspend or end the beta or your access where required for security, abuse, legal compliance, or discontinuation of the service."

      ]

    },

    {

      title: "12. Privacy",

      paragraphs: [

        `Personal information is handled as described in the Privacy Policy at ${s.appUrl}/privacy (version ${facts.privacyVersion}), which is incorporated into these Terms.`

      ]

    },

    {

      title: "13. Notices and support",

      paragraphs: [

        `Legal and support notices: ${s.supportEmail}. Postal: ${s.addressLine}.`

      ]

    },

    {

      title: "14. Governing law",

      paragraphs: [

        "These Terms are governed by the laws of British Columbia and the applicable federal laws of Canada, without regard to conflict-of-law rules that would apply a different law.",

        "These Terms do not require mandatory arbitration, ban class proceedings, restrict lawful reviews, shorten non-waivable limitation periods, or waive non-waivable consumer rights."

      ]

    },

    {

      title: "15. Contract copy and version",

      paragraphs: [

        `These Terms are version ${facts.version}, effective ${facts.effectiveDate}.`,

        `A retainable copy is always available at ${termsUrlPath} and as a downloadable/printable text file from the Terms document API.`,

        "Signed-in users may request an emailed copy when email delivery is configured. Download and print are always available, whether or not email is configured."

      ]

    }

  ];

}



/**

 * Immutable production Terms registry. Only explicitly registered versions resolve.

 * Unknown versions throw — never silently substitute the latest.

 */

const TERMS_REGISTRY_BASE: ReadonlyMap<string, RegisteredTermsEntry> = new Map([

  [

    TERMS_2026_08_12_1_FACTS.version,

    Object.freeze({

      version: TERMS_2026_08_12_1_FACTS.version,

      effectiveDate: TERMS_2026_08_12_1_FACTS.effectiveDate,

      buildSections: () => buildTermsSectionsFromFrozenFacts(TERMS_2026_08_12_1_FACTS)

    })

  ]

]);



/** Test-only overlay versions checked before the immutable base registry. */

const termsRegistryOverlaysForTests = new Map<string, RegisteredTermsEntry>();



/**

 * Register a temporary Terms document for tests. Returns a disposer that removes it.

 * Production TERMS_REGISTRY_BASE stays immutable.

 */

export function registerTermsDocumentForTests(entry: {

  version: string;

  effectiveDate: string;

  sections: LegalSection[];

}): () => void {

  const version = typeof entry.version === "string" ? entry.version.trim() : "";

  if (!version) {

    throw new Error("registerTermsDocumentForTests requires a version.");

  }

  const effectiveDate =

    typeof entry.effectiveDate === "string" ? entry.effectiveDate.trim() : "";

  if (!effectiveDate) {

    throw new Error("registerTermsDocumentForTests requires an effectiveDate.");

  }

  const sections = Array.isArray(entry.sections)

    ? entry.sections.map((section) =>

        Object.freeze({

          title: section.title,

          paragraphs: Object.freeze([...(section.paragraphs || [])]) as string[],

          ...(section.items ? { items: Object.freeze([...section.items]) as string[] } : {}),

          ...(section.id ? { id: section.id } : {})

        })

      )

    : [];

  const frozenSections = Object.freeze(sections) as LegalSection[];

  termsRegistryOverlaysForTests.set(

    version,

    Object.freeze({

      version,

      effectiveDate,

      buildSections: () =>

        frozenSections.map((section) => ({

          title: section.title,

          paragraphs: [...section.paragraphs],

          ...(section.items ? { items: [...section.items] } : {}),

          ...(section.id ? { id: section.id } : {})

        }))

    })

  );

  return () => {

    termsRegistryOverlaysForTests.delete(version);

  };

}



export function clearTermsRegistryOverlaysForTests(): void {

  termsRegistryOverlaysForTests.clear();

}



function lookupTermsRegistryEntry(version: string): RegisteredTermsEntry | undefined {

  return termsRegistryOverlaysForTests.get(version) ?? TERMS_REGISTRY_BASE.get(version);

}



export type LegalFoundationSnapshot = {

  termsVersion: string;

  privacyVersion: string;

  effectiveDate: string;

  supplier: typeof LEGAL_SUPPLIER;

  offer: typeof LEGAL_OFFER;

  termsUrlPath: string;

  privacyUrlPath: string;

  supportUrlPath: string;

  cancellationSummary: string[];

  refundSummary: string[];

  taxSummary: string[];

  processors: Array<{ name: string; purpose: string }>;

};



export type CheckoutDisclosureSnapshot = {

  title: string;

  bullets: string[];

  acknowledgementLabel: string;

};



export function getLegalFoundationSnapshot(): LegalFoundationSnapshot {

  return {

    termsVersion: LEGAL_TERMS_VERSION,

    privacyVersion: LEGAL_PRIVACY_VERSION,

    effectiveDate: LEGAL_EFFECTIVE_DATE,

    supplier: { ...LEGAL_SUPPLIER },

    offer: { ...LEGAL_OFFER },

    termsUrlPath: "/terms",

    privacyUrlPath: "/privacy",

    supportUrlPath: "/support",

    cancellationSummary: [

      "You may cancel NoteBill Pro at any time without a cancellation fee or penalty.",

      "Cancellation takes effect at the end of the current paid billing period.",

      "Pro access remains available through that paid period.",

      "Future renewal charges stop after cancellation is confirmed in the Stripe customer portal."

    ],

    refundSummary: [

      `A ${LEGAL_OFFER.goodwillRefundDays}-day goodwill refund is available for the initial NoteBill Pro subscription payment when requested through ${LEGAL_SUPPLIER.supportEmail}.`,

      "Duplicate or erroneous charges are eligible for correction or refund.",

      "Otherwise, subscription payments and renewals are non-refundable, and no prorated refunds are offered.",

      "Nothing in this policy limits non-waivable statutory cancellation, refund, or consumer-protection rights."

    ],

    taxSummary: [

      "NoteBill Pro is priced in United States dollars (USD).",

      "David Heslop / EuroDigital is not currently registered for GST/HST.",

      "Stripe Tax is off, and NoteBill does not currently collect GST/HST or other sales tax.",

      "You remain responsible only for taxes the law directly requires you to pay, if any."

    ],

    processors: [

      { name: "Cloudflare", purpose: "Application hosting, static assets, and edge delivery" },

      { name: "Supabase Postgres", purpose: "Durable invoice and runtime state storage" },

      { name: "OpenAI", purpose: "AI-assisted drafting, OCR, and audio transcription when those features are used" },

      { name: "Stripe", purpose: "Checkout, subscriptions, customer portal, payment links, and billing webhooks" },

      { name: "SMTP2GO", purpose: "Transactional email delivery when email sending is enabled" },

      { name: "Resend", purpose: "Alternate transactional email provider path when configured" },

      { name: "Google", purpose: "Optional Google sign-in identity (email/profile)" }

    ]

  };

}



/** Client/server parity snapshot for pre-checkout disclosure UI. */

export function getCheckoutDisclosureSnapshot(): CheckoutDisclosureSnapshot {

  const offer = LEGAL_OFFER;

  const supplier = LEGAL_SUPPLIER;

  return {

    title: "Review NoteBill Pro before Checkout",

    bullets: [

      `${offer.planName} costs ${offer.priceDisplay} ${offer.intervalLabel}. Currency is United States dollars (USD).`,

      "Billing renews automatically every month until you cancel.",

      "Cancel anytime without a cancellation fee. Cancellation takes effect at the end of the current paid period; Pro access continues until then.",

      `Initial-payment goodwill refunds: ${offer.goodwillRefundDays} days via ${supplier.supportEmail}. Duplicate/erroneous charges can be corrected. Otherwise renewals are non-refundable (statutory rights still apply).`,

      "No GST/HST is currently collected by NoteBill; Stripe Tax is off. The price is not tax-inclusive.",

      `Supplier: ${supplier.legalName}. NoteBill is a product of ${supplier.tradeStyle}.`

    ],

    acknowledgementLabel:

      "I have reviewed the Terms of Service and Privacy Policy, and I understand the price, USD currency, monthly automatic renewal, cancellation timing, tax disclosure, and refund policy."

  };

}



export function buildVersionedTermsPath(version: string): string {

  const trimmed = typeof version === "string" ? version.trim() : "";

  if (!trimmed) {

    throw new Error("Terms version is required to build a versioned path.");

  }

  return `/terms?version=${encodeURIComponent(trimmed)}`;

}



export function listRegisteredTermsVersions(): string[] {

  const versions = new Set<string>([

    ...TERMS_REGISTRY_BASE.keys(),

    ...termsRegistryOverlaysForTests.keys()

  ]);

  return Array.from(versions);

}



export function resolveTermsDocument(version?: string | null): ResolvedTermsDocument {

  const requested =

    typeof version === "string" && version.trim() ? version.trim() : LEGAL_TERMS_VERSION;

  const entry = lookupTermsRegistryEntry(requested);

  if (!entry) {

    throw new Error(

      `Unknown Terms version "${requested}". Registered versions: ${listRegisteredTermsVersions().join(", ")}.`

    );

  }

  return {

    version: entry.version,

    effectiveDate: entry.effectiveDate,

    sections: entry.buildSections(),

    isCurrent: entry.version === LEGAL_TERMS_VERSION,

    termsUrlPath: buildVersionedTermsPath(entry.version)

  };

}



export function buildTermsSections(version?: string | null): LegalSection[] {

  return resolveTermsDocument(version).sections;

}



export function buildTermsPlainText(version: string): string {

  const doc = resolveTermsDocument(version);

  const body = doc.sections

    .map((section) => {

      const paras = section.paragraphs.join("\n");

      const items = section.items?.map((item) => `- ${item}`).join("\n") ?? "";

      return `${section.title}\n${paras}${items ? `\n${items}` : ""}`;

    })

    .join("\n\n");

  return [

    "NoteBill Terms of Service",

    `Version: ${doc.version}`,

    `Effective date: ${doc.effectiveDate}`,

    "",

    body

  ].join("\n");

}



export function buildTermsDownloadFilename(version: string): string {

  const doc = resolveTermsDocument(version);

  return `notebill-terms-${doc.version}.txt`;

}



export function buildTermsDownloadPath(version: string): string {

  const doc = resolveTermsDocument(version);

  return `/api/legal/documents/terms?version=${encodeURIComponent(doc.version)}&format=txt`;

}



export function buildPrivacySections(): Array<{ title: string; paragraphs: string[]; items?: string[] }> {

  const s = LEGAL_SUPPLIER;

  const snapshot = getLegalFoundationSnapshot();

  return [

    {

      title: "Accountable organization",

      paragraphs: [

        `${s.legalName} operates NoteBill, a product of ${s.tradeStyle}.`,

        `Privacy contact: ${s.privacyEmail}. Address: ${s.addressLine}.`

      ]

    },

    {

      title: "Information we may collect",

      items: [

        "Account email and authenticated user identifiers when you sign in.",

        "Invoice content you provide: customer details, line items, notes, drafts, and related files.",

        "Images, audio, and derived OCR/transcript text when you use those optional features.",

        "Billing metadata from Stripe (customer/subscription identifiers and status), not full card numbers.",

        "Limited diagnostics, revenue/event signals (often hashed), and device-local storage used to run the app."

      ],

      paragraphs: []

    },

    {

      title: "Purposes",

      items: [

        "Provide invoice drafting, saving, export, send, portal, and related workflows.",

        "Authenticate users and scope data to the correct account.",

        "Process subscriptions and payment links through Stripe.",

        "Operate email delivery when enabled.",

        "Secure, troubleshoot, and improve reliability of the service."

      ],

      paragraphs: []

    },

    {

      title: "Consent and withdrawal",

      paragraphs: [

        "Where consent is required, you can withdraw by stopping use of optional features, signing out, cancelling Pro, or requesting deletion help via support.",

        "Some processing is necessary to provide the service you request (for example, saving an invoice you create)."

      ]

    },

    {

      title: "Processors",

      paragraphs: [

        "NoteBill uses service providers to operate the product. Verified processors include:"

      ],

      items: snapshot.processors.map((p) => `${p.name}: ${p.purpose}`)

    },

    {

      title: "Cross-border processing",

      paragraphs: [

        "Providers may process data in multiple countries. Exact data-centre geography is not pinned in NoteBill’s application configuration; processing may occur outside British Columbia/Canada depending on the provider."

      ]

    },

    {

      title: "AI processing",

      paragraphs: [

        "When you use AI, OCR, or transcription features, relevant content is sent to OpenAI to generate results.",

        "NoteBill’s repository does not establish whether OpenAI uses that content for model training. Treat training use as not promised and not disproven here; review OpenAI’s terms/policies for provider-side handling."

      ]

    },

    {

      title: "Payment data",

      paragraphs: [

        "Card payments are processed by Stripe. NoteBill stores billing entitlement metadata needed to recognize Pro status, not full payment-card numbers."

      ]

    },

    {

      title: "Cookies, local storage, and analytics",

      paragraphs: [

        "The app uses browser local storage for session tokens, drafts, and preferences.",

        "Optional OCR metric export paths (for example GA4 or Segment) exist in code but are not enabled unless configured. Cloudflare Workers observability may retain operational logs."

      ]

    },

    {

      title: "Retention",

      paragraphs: [

        "We keep information as long as needed to provide the service, maintain backups/security records, meet legal obligations, and resolve disputes. Soft-deleted invoices may remain until hard-deleted or removed through an account-deletion request workflow."

      ]

    },

    {

      title: "Safeguards",

      paragraphs: [

        "NoteBill uses HTTPS in production hosting, signed session tokens, Stripe webhook verification, and database access controls where Postgres is used.",

        "No method of transmission or storage is completely secure. Session tokens stored in localStorage can be exposed if a device is compromised or if malicious scripts run in the browser."

      ]

    },

    {

      title: "Access, correction, export, and deletion",

      paragraphs: [

        "You can review and edit invoice content in the app while signed in.",

        "Account deletion requests are handled through /data-deletion or email to support. There is no fully automated portable personal-data export API today; PDF/invoice export is available for invoice documents you create.",

        "Complaints may be directed to support first. You may also contact the Office of the Information and Privacy Commissioner for British Columbia and, where applicable, the Office of the Privacy Commissioner of Canada."

      ]

    },

    {

      title: "Children",

      paragraphs: [

        "NoteBill is not directed to children under 13, and we do not knowingly collect personal information from children under 13."

      ]

    },

    {

      title: "Changes",

      paragraphs: [

        `This Privacy Policy is version ${LEGAL_PRIVACY_VERSION}, effective ${LEGAL_EFFECTIVE_DATE}. Updates will be posted on this page with a new version and effective date.`

      ]

    }

  ];

}



export const TERMS_ACCEPTANCE_METHOD = "pre_checkout_disclosure" as const;



export function assertValidTermsAcknowledgement(input: {

  termsVersion?: string;

  termsAccepted?: boolean | string;

}): {

  termsVersion: string;

  termsAccepted: true;

  termsAcceptanceMethod: typeof TERMS_ACCEPTANCE_METHOD;

} {

  const termsVersion = typeof input.termsVersion === "string" ? input.termsVersion.trim() : "";

  if (termsVersion !== LEGAL_TERMS_VERSION) {

    throw new Error("Confirm the current Terms of Service before starting Checkout.");

  }

  const accepted =

    input.termsAccepted === true ||

    (typeof input.termsAccepted === "string" && input.termsAccepted.trim().toLowerCase() === "true");

  if (!accepted) {

    throw new Error("Confirm the current Terms of Service before starting Checkout.");

  }

  return {

    termsVersion,

    termsAccepted: true,

    termsAcceptanceMethod: TERMS_ACCEPTANCE_METHOD

  };

}
