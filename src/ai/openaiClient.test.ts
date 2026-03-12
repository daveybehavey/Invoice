import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { resolveJsonTaskConfig, resolveJsonTaskModel } from "./openaiClient.js";

const ORIGINAL_OPENAI_MODEL = process.env.OPENAI_MODEL;
const ORIGINAL_OPENAI_WORDING_MODEL = process.env.OPENAI_WORDING_MODEL;
const ORIGINAL_OPENAI_WORDING_MODEL_FALLBACK = process.env.OPENAI_WORDING_MODEL_FALLBACK;

afterEach(() => {
  if (ORIGINAL_OPENAI_MODEL === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = ORIGINAL_OPENAI_MODEL;
  }

  if (ORIGINAL_OPENAI_WORDING_MODEL === undefined) {
    delete process.env.OPENAI_WORDING_MODEL;
  } else {
    process.env.OPENAI_WORDING_MODEL = ORIGINAL_OPENAI_WORDING_MODEL;
  }

  if (ORIGINAL_OPENAI_WORDING_MODEL_FALLBACK === undefined) {
    delete process.env.OPENAI_WORDING_MODEL_FALLBACK;
  } else {
    process.env.OPENAI_WORDING_MODEL_FALLBACK = ORIGINAL_OPENAI_WORDING_MODEL_FALLBACK;
  }
});

test("resolveJsonTaskModel uses OPENAI_MODEL for default tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  delete process.env.OPENAI_WORDING_MODEL;
  delete process.env.OPENAI_WORDING_MODEL_FALLBACK;

  assert.equal(resolveJsonTaskModel(), "gpt-main");
});

test("resolveJsonTaskModel prefers OPENAI_WORDING_MODEL for wording tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  process.env.OPENAI_WORDING_MODEL = "gpt-wording-fast";
  delete process.env.OPENAI_WORDING_MODEL_FALLBACK;

  assert.equal(resolveJsonTaskModel({ taskType: "wording" }), "gpt-wording-fast");
});

test("resolveJsonTaskModel falls back to default model for wording tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  delete process.env.OPENAI_WORDING_MODEL;
  delete process.env.OPENAI_WORDING_MODEL_FALLBACK;

  assert.equal(resolveJsonTaskModel({ taskType: "wording" }), "gpt-main");
});

test("resolveJsonTaskModel uses fallback wording model when configured", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  delete process.env.OPENAI_WORDING_MODEL;
  process.env.OPENAI_WORDING_MODEL_FALLBACK = "gpt-wording-fallback";

  assert.equal(resolveJsonTaskModel({ taskType: "wording" }), "gpt-wording-fallback");
});

test("resolveJsonTaskConfig uses compact wording settings for wording tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  delete process.env.OPENAI_WORDING_MODEL;
  delete process.env.OPENAI_WORDING_MODEL_FALLBACK;

  const config = resolveJsonTaskConfig({ taskType: "wording" });

  assert.equal(config.model, "gpt-main");
  assert.equal(config.maxCompletionTokens, 400);
  assert.equal(config.temperature, 0.2);
  assert.deepEqual(config.responseFormat, { type: "json_object" });
  assert.match(config.systemPrompt, /rewrite invoice wording only/i);
  assert.match(
    config.systemPrompt,
    /Do not start descriptions with prepositions like "of", "for", or "with"\./i
  );
  assert.doesNotMatch(config.systemPrompt, /AI Invoice Translator & Generator/i);
});

test("resolveJsonTaskConfig can relax wording response format for retries", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  delete process.env.OPENAI_WORDING_MODEL;
  delete process.env.OPENAI_WORDING_MODEL_FALLBACK;

  const config = resolveJsonTaskConfig({
    taskType: "wording",
    maxCompletionTokens: 900,
    disableStructuredJsonResponse: true
  });

  assert.equal(config.model, "gpt-main");
  assert.equal(config.maxCompletionTokens, 900);
  assert.equal(config.responseFormat, undefined);
  assert.match(config.systemPrompt, /rewrite invoice wording only/i);
});

test("resolveJsonTaskConfig keeps the full system prompt for default tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";

  const config = resolveJsonTaskConfig();

  assert.equal(config.model, "gpt-main");
  assert.equal(config.maxCompletionTokens, undefined);
  assert.equal(config.responseFormat, undefined);
  assert.match(config.systemPrompt, /AI Invoice Translator & Generator/i);
});
