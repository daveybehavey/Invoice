import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type FormatUtils = {
  formatCurrencyAmount: (value: number, currency?: string) => string;
  formatMoney: (value: number, currency?: string) => string;
  formatPreviewMoney: (value: number, currency?: string) => string;
};

function loadFormatUtils(): FormatUtils {
  const windowObj: { InvoiceFormatUtils?: FormatUtils } = {};
  const sandbox: Record<string, unknown> = { window: windowObj };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync("public/utils/formatters.js", "utf8"), sandbox, {
    filename: "public/utils/formatters.js"
  });
  assert.ok(windowObj.InvoiceFormatUtils, "formatters.js must expose InvoiceFormatUtils");
  return windowObj.InvoiceFormatUtils;
}

const formatUtils = loadFormatUtils();

test("formatMoney USD output remains byte-identical to the historical $ + toFixed(2) path", () => {
  const legacy = (value: number) => `$${Number(value).toFixed(2)}`;
  for (const value of [0, 0.1, 1, 12.5, 12.345, 99.99, 1234.5, 0.005, 0.004]) {
    assert.equal(formatUtils.formatMoney(value), legacy(value));
    assert.equal(formatUtils.formatMoney(value, "USD"), legacy(value));
    assert.equal(formatUtils.formatCurrencyAmount(value, "USD"), legacy(value));
  }
  assert.equal(formatUtils.formatMoney(Number.NaN), "");
  assert.equal(formatUtils.formatMoney(Number.POSITIVE_INFINITY), "");
});

test("formatMoney USD stays byte-identical on negatives, half-steps, and large values", () => {
  const legacy = (value: number) => `$${Number(value).toFixed(2)}`;
  // Negatives: the historical path renders the sign after the symbol
  // ("$-5.00"); a bare Intl formatter renders "-$5.00".
  assert.equal(formatUtils.formatMoney(-5), legacy(-5));
  assert.equal(formatUtils.formatMoney(-5), "$-5.00");
  assert.equal(formatUtils.formatPreviewMoney(-5), "$-5.00");
  assert.equal(formatUtils.formatMoney(-0.004), legacy(-0.004));
  assert.equal(formatUtils.formatMoney(-0.004), "$-0.00");
  // Exact half-steps: Intl rounds the shortest decimal form of the double,
  // toFixed rounds the exact binary value — they disagree here.
  for (const value of [2.675, 1.005, 0.015, 10.075, 0.045, 3.335]) {
    assert.equal(formatUtils.formatMoney(value), legacy(value), `value=${value}`);
  }
  // Large values: no thousands separators, matching the historical path.
  assert.equal(formatUtils.formatMoney(1234567.89), legacy(1234567.89));
  assert.equal(formatUtils.formatMoney(1234567.89), "$1234567.89");
  // Exhaustive three-decimal sweep plus a deterministic pseudo-random sweep.
  for (let k = 0; k <= 20000; k += 1) {
    const value = k / 1000;
    assert.equal(formatUtils.formatMoney(value), legacy(value), `value=${value}`);
    assert.equal(formatUtils.formatMoney(-value), legacy(-value), `value=${-value}`);
  }
  let seed = 123456789;
  for (let i = 0; i < 5000; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const value = (seed / 2147483648) * 100000;
    assert.equal(formatUtils.formatMoney(value), legacy(value), `value=${value}`);
  }
});

test("formatPreviewMoney shares the currency-aware formatter and keeps USD bytes", () => {
  assert.equal(formatUtils.formatPreviewMoney(12.5), "$12.50");
  assert.equal(formatUtils.formatPreviewMoney(0, "USD"), "$0.00");
  assert.equal(formatUtils.formatPreviewMoney(Number.NaN), "—");
  assert.equal(formatUtils.formatPreviewMoney(Number.POSITIVE_INFINITY), "—");
});

test("shared formatter is currency-aware for CAD, EUR, GBP, and a zero-decimal currency", () => {
  assert.equal(formatUtils.formatMoney(12.5, "CAD"), "CA$12.50");
  assert.equal(formatUtils.formatPreviewMoney(12.5, "CAD"), "CA$12.50");

  assert.equal(formatUtils.formatMoney(12.5, "EUR"), "€12.50");
  assert.equal(formatUtils.formatPreviewMoney(12.5, "EUR"), "€12.50");

  assert.equal(formatUtils.formatMoney(12.5, "GBP"), "£12.50");
  assert.equal(formatUtils.formatPreviewMoney(12.5, "GBP"), "£12.50");

  // JPY is a zero-decimal currency under ISO 4217 / Intl.
  assert.equal(formatUtils.formatMoney(1000, "JPY"), "¥1000");
  assert.equal(formatUtils.formatPreviewMoney(1000, "JPY"), "¥1000");
  assert.equal(formatUtils.formatCurrencyAmount(1000, "JPY"), "¥1000");
});
