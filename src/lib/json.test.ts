/**
 * Covers: src/lib/json.ts (parseJsonFromModel)
 *
 * Deterministic string fixtures only — no network, no clock.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonFromModel } from "./json.js";

test("parseJsonFromModel: plain JSON object parses", () => {
  const result = parseJsonFromModel<{ a: number; b: string }>('{"a":1,"b":"x"}');
  assert.deepEqual(result, { a: 1, b: "x" });
});

test("parseJsonFromModel: strips markdown json fences", () => {
  const raw = "```json\n{\"ok\":true,\"n\":2}\n```";
  assert.deepEqual(parseJsonFromModel<{ ok: boolean; n: number }>(raw), { ok: true, n: 2 });
});

test("parseJsonFromModel: strips bare fences without language tag", () => {
  const raw = "```\n{\"v\":3}\n```";
  assert.deepEqual(parseJsonFromModel<{ v: number }>(raw), { v: 3 });
});

test("parseJsonFromModel: extracts first {...} object from surrounding prose", () => {
  const raw = 'Here is the invoice draft:\n{"customerName":"Ada","total":12.5}\nThanks.';
  assert.deepEqual(parseJsonFromModel<{ customerName: string; total: number }>(raw), {
    customerName: "Ada",
    total: 12.5
  });
});

test("parseJsonFromModel: throws when no JSON object is present", () => {
  assert.throws(() => parseJsonFromModel("not json at all"), /Model response did not contain valid JSON/);
});

test("parseJsonFromModel: characterisation — opening brace without closing brace throws model-JSON error", () => {
  // Current behaviour: no closing "}" → dedicated Error, not SyntaxError.
  assert.throws(
    () => parseJsonFromModel('prefix {"a":1 trailing'),
    /Model response did not contain valid JSON/
  );
});
