import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { resolveJsonTaskModel } from "./openaiClient.js";

const ORIGINAL_OPENAI_MODEL = process.env.OPENAI_MODEL;
const ORIGINAL_OPENAI_WORDING_MODEL = process.env.OPENAI_WORDING_MODEL;

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
});

test("resolveJsonTaskModel uses OPENAI_MODEL for default tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  delete process.env.OPENAI_WORDING_MODEL;

  assert.equal(resolveJsonTaskModel(), "gpt-main");
});

test("resolveJsonTaskModel prefers OPENAI_WORDING_MODEL for wording tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  process.env.OPENAI_WORDING_MODEL = "gpt-wording-fast";

  assert.equal(resolveJsonTaskModel({ taskType: "wording" }), "gpt-wording-fast");
});

test("resolveJsonTaskModel falls back to default model for wording tasks", () => {
  process.env.OPENAI_MODEL = "gpt-main";
  delete process.env.OPENAI_WORDING_MODEL;

  assert.equal(resolveJsonTaskModel({ taskType: "wording" }), "gpt-main");
});
