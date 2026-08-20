(() => {
  const LEGAL_TERMS_VERSION = "2026-08-12.1";
  const LEGAL_PRIVACY_VERSION = "2026-08-12.1";
  const LEGAL_EFFECTIVE_DATE = "2026-08-12";
  /** Keep IDs in sync with server listRegisteredTermsVersions (production base only). */
  const REGISTERED_TERMS_VERSIONS = ["2026-08-12.1"];

  const isRegisteredTermsVersion = (version) => {
    const trimmed = typeof version === "string" ? version.trim() : "";
    return Boolean(trimmed) && REGISTERED_TERMS_VERSIONS.includes(trimmed);
  };

  const LEGAL_SUPPLIER = {
    legalName: "David Heslop, carrying on business as EuroDigital",
    tradeStyle: "EuroDigital",
    productName: "NoteBill",
    addressLine: "1193 Kangaroo Road, Metchosin, BC V9C 4C9, Canada",
    supportEmail: "support@notebill.app",
    privacyEmail: "support@notebill.app",
    siteUrl: "https://notebill.app",
    appUrl: "https://app.notebill.app"
  };

  const LEGAL_OFFER = {
    planName: "NoteBill Pro",
    priceDisplay: "$19 USD",
    priceAmount: 19,
    currency: "USD",
    intervalLabel: "per month",
    goodwillRefundDays: 7
  };

  const buildVersionedTermsPath = (version) => {
    const trimmed = typeof version === "string" ? version.trim() : "";
    const resolved = trimmed || LEGAL_TERMS_VERSION;
    return `/terms?version=${encodeURIComponent(resolved)}`;
  };

  const buildTermsDownloadPath = (version) => {
    const trimmed = typeof version === "string" ? version.trim() : "";
    const resolved = trimmed || LEGAL_TERMS_VERSION;
    return `/api/legal/documents/terms?version=${encodeURIComponent(resolved)}&format=txt`;
  };

  const getLegalFoundationClient = () => ({
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    supplier: { ...LEGAL_SUPPLIER },
    offer: { ...LEGAL_OFFER },
    termsUrlPath: "/terms",
    versionedTermsUrlPath: buildVersionedTermsPath(LEGAL_TERMS_VERSION),
    termsDownloadPath: buildTermsDownloadPath(LEGAL_TERMS_VERSION),
    privacyUrlPath: "/privacy",
    supportUrlPath: "/support",
    cancellationUrlPath: `${buildVersionedTermsPath(LEGAL_TERMS_VERSION)}#cancellation`
  });

  const buildCheckoutDisclosureCopy = () => {
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
  };

  window.InvoiceLegalFoundation = {
    getLegalFoundationClient,
    buildCheckoutDisclosureCopy,
    buildVersionedTermsPath,
    buildTermsDownloadPath,
    isRegisteredTermsVersion,
    LEGAL_TERMS_VERSION,
    LEGAL_PRIVACY_VERSION,
    LEGAL_EFFECTIVE_DATE,
    LEGAL_SUPPLIER,
    LEGAL_OFFER,
    REGISTERED_TERMS_VERSIONS: REGISTERED_TERMS_VERSIONS.slice()
  };
})();
