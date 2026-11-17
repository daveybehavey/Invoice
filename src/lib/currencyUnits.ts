/** ISO 4217 minor units: SIX list-one.xml, published 2026-09-17, retrieved 2026-11-11.
 * https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
 * Only explicit numeric exponents are admitted; N.A. and unknown codes fail closed.
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

/** Stripe's ISK/UGX compatibility units differ from ISO; refuse rather than mischarge.
 * https://docs.stripe.com/currencies#special-cases
 */
export function supportsStripeIsoUnits(currency: string | undefined | null): boolean {
  const code = currency?.trim().toUpperCase();
  return currencyExponent(currency) !== null && code !== "ISK" && code !== "UGX";
}
