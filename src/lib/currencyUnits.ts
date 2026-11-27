/** ISO 4217 minor units: SIX list-one.xml, published 2026-09-17, retrieved 2026-11-11.
 * https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
 * Only explicit numeric exponents are admitted; N.A. and unknown codes fail closed.
 *
 * This module's conversion helpers are generic ISO arithmetic. Stripe presentment
 * support is a separate allowlist below — never infer Stripe routability from ISO alone.
 */
const currenciesByExponent: Record<number, string> = {
  0: "BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF",
  2: "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CNY COP COU CRC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD USN UYU UZS VED VES WST XAD XCD XCG YER ZAR ZMW ZWG",
  3: "BHD IQD JOD KWD LYD OMR TND",
  4: "CLF UYW"
};
const exponents = new Map(Object.entries(currenciesByExponent).flatMap(
  ([exponent, codes]) => codes.split(" ").map(code => [code, Number(exponent)] as const)
));

/**
 * Stripe presentment currencies whose charge minor units match ISO 4217.
 * Source: https://docs.stripe.com/currencies presentment table (default country view),
 * retrieved for this gate. Deliberately excludes:
 * - Codes Stripe does not list for presentment there (e.g. 3-decimal BHD/KWD/JOD/OMR/TND)
 * - Special-case codes whose Stripe API units differ from ISO (ISK, UGX; MGA is
 *   zero-decimal at Stripe but exponent 2 in ISO)
 * https://docs.stripe.com/currencies#special-cases
 */
const stripePresentmentMatchingIso = new Set(
  ("AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BIF BMD BND BOB BRL BSD BWP BYN BZD " +
    "CAD CDF CHF CLP CNY COP CRC CVE CZK DJF DKK DOP DZD EGP ETB EUR FJD FKP GBP GEL GIP GMD GNF " +
    "GTQ GYD HKD HNL HTG HUF IDR ILS INR JMD JPY KES KGS KHR KMF KRW KYD KZT LAK LBP LKR LRD LSL " +
    "MAD MDL MKD MMK MNT MOP MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR " +
    "PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SEK SGD SHP SLE SOS SRD SZL THB TJS TOP TRY TTD TWD " +
    "TZS UAH UYU UZS VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW USD").split(" ")
);

export function currencyExponent(currency: string | undefined | null): number | null {
  return exponents.get(currency?.trim().toUpperCase() ?? "") ?? null;
}

/** Exact ISO minor units; never round a fractional minor unit into a payment. */
export function toAmountMinorExact(amountMajor: number, currency: string | undefined | null): number | null {
  const exponent = currencyExponent(currency);
  if (exponent === null || !Number.isFinite(amountMajor)) return null;
  const scaled = amountMajor * 10 ** exponent;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-6) return null;
  return rounded;
}

/** Reverse conversion for a validated ISO minor-unit amount. */
export function toAmountMajor(amountMinor: number, currency: string | undefined | null): number {
  const exponent = currencyExponent(currency);
  if (exponent === null || !Number.isSafeInteger(amountMinor)) {
    throw new Error("Unknown currency or invalid minor-unit amount.");
  }
  return amountMinor / 10 ** exponent;
}

/**
 * Whether this currency may be routed to Stripe invoice payment links / settlement.
 * Independent of generic ISO conversion: ISO math may still be exact for codes this
 * function rejects (e.g. BHD/KWD).
 */
export function supportsStripeIsoUnits(currency: string | undefined | null): boolean {
  const code = currency?.trim().toUpperCase() ?? "";
  return stripePresentmentMatchingIso.has(code) && currencyExponent(code) !== null;
}
