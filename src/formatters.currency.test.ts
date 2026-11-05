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
