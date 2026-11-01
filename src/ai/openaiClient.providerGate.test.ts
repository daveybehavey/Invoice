import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import {
  AiProviderConfigurationError,
  resolveAiProviderConfiguration,
  runAudioTranscriptionTask,
  runImageOcrTask,
  runJsonTask
} from "./openaiClient.js";

// S93-3 item 4: provider fail-closed gate. These tests use a mocked SDK
// transport (a local HTTP stub reached through OPENAI_BASE_URL) and never
// install the test-runner overrides: the assertions count REAL SDK HTTP
// calls, so a configuration that permits dispatch is directly observable.

type RecordedRequest = { path: string };

const recordedRequests: RecordedRequest[] = [];
let chatCompletionsBehavior: "ok" | "empty-then-ok" = "ok";
let chatAttempts = 0;

const stubServer = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  recordedRequests.push({ path });
  req.resume();
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (path.endsWith("/chat/completions")) {
      chatAttempts += 1;
      const empty = chatCompletionsBehavior === "empty-then-ok" && chatAttempts === 1;
      res.end(
        JSON.stringify({
          id: "chatcmpl-stub",
          object: "chat.completion",
          created: 1700000000,
          model: "stub-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: empty ? "" : JSON.stringify({ ok: true, extractedText: "stub text", warnings: [] })
              },
              finish_reason: "stop"
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      );
      return;
    }
    if (path.endsWith("/audio/transcriptions")) {
      res.end(JSON.stringify({ text: "stub transcript" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "unknown path" }));
  });
});

const ENV_KEYS = ["INVOICE_AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_BASE_URL"] as const;
const originalEnv = new Map<string, string | undefined>(ENV_KEYS.map((key) => [key, process.env[key]]));
let keyCounter = 0;

function freshApiKey(): string {
  keyCounter += 1;
  return `sk-test-stub-${keyCounter}`;
}

function setEnv(selector: string | undefined, apiKey: string | undefined): void {
  if (selector === undefined) {
    delete process.env.INVOICE_AI_PROVIDER;
  } else {
    process.env.INVOICE_AI_PROVIDER = selector;
  }
  if (apiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = apiKey;
  }
}

function sdkCallCount(): number {
  return recordedRequests.length;
}

async function exerciseAllDispatchPaths(): Promise<void> {
  await runJsonTask<{ ok: boolean }>("Return JSON.");
  await runImageOcrTask({ mimeType: "image/png", base64Data: Buffer.from("x").toString("base64") });
  await runAudioTranscriptionTask({
    mimeType: "audio/mpeg",
    fileName: "note.mp3",
    fileData: Buffer.from("audio")
  });
}

before(async () => {
  await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", resolve));
  const address = stubServer.address() as AddressInfo;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
});

after(async () => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
});

test("resolveAiProviderConfiguration normalizes the selector and key", () => {
  assert.deepEqual(
    resolveAiProviderConfiguration({ INVOICE_AI_PROVIDER: " OpenAI ", OPENAI_API_KEY: " sk-x " }),
    { permitted: true, provider: "openai", apiKey: "sk-x" }
  );
  assert.equal(
    resolveAiProviderConfiguration({ INVOICE_AI_PROVIDER: "DISABLED", OPENAI_API_KEY: "sk-x" }).permitted,
    false
  );
  assert.equal(
    resolveAiProviderConfiguration({ INVOICE_AI_PROVIDER: "anthropic", OPENAI_API_KEY: "sk-x" }).permitted,
    false
  );
  assert.equal(resolveAiProviderConfiguration({ OPENAI_API_KEY: "sk-x" }).permitted, false);
  assert.equal(
    resolveAiProviderConfiguration({ INVOICE_AI_PROVIDER: "  ", OPENAI_API_KEY: "sk-x" }).permitted,
    false
  );
  assert.equal(
    resolveAiProviderConfiguration({ INVOICE_AI_PROVIDER: "openai", OPENAI_API_KEY: "   " }).permitted,
    false
  );
  assert.equal(resolveAiProviderConfiguration({ INVOICE_AI_PROVIDER: "openai" }).permitted, false);
});

for (const scenario of [
  { name: "selector missing", selector: undefined },
  { name: "selector blank", selector: "   " },
  { name: "selector unknown", selector: "anthropic" },
  { name: "selector disabled", selector: "disabled" }
] as const) {
  test(`fail closed with a configured key when ${scenario.name}: zero SDK calls on JSON, OCR and audio`, async () => {
    setEnv(scenario.selector, freshApiKey());
    const before = sdkCallCount();
    await assert.rejects(() => exerciseAllDispatchPaths(), AiProviderConfigurationError);
    assert.equal(sdkCallCount(), before);
  });
}

test("fail closed when selector is openai but the key is missing or blank: zero SDK calls", async () => {
  setEnv("openai", undefined);
  let before = sdkCallCount();
  await assert.rejects(() => exerciseAllDispatchPaths(), AiProviderConfigurationError);
  assert.equal(sdkCallCount(), before);

  setEnv("openai", "   ");
  before = sdkCallCount();
  await assert.rejects(() => exerciseAllDispatchPaths(), AiProviderConfigurationError);
  assert.equal(sdkCallCount(), before);
});

test("explicit openai selection with a key dispatches JSON, OCR and audio through the SDK transport", async () => {
  setEnv("openai", freshApiKey());
  const before = sdkCallCount();
  const json = await runJsonTask<{ ok: boolean }>("Return JSON.");
  assert.equal(json.ok, true);
  const ocr = await runImageOcrTask({
    mimeType: "image/png",
    base64Data: Buffer.from("x").toString("base64")
  });
  assert.equal(ocr.extractedText, "stub text");
  const audio = await runAudioTranscriptionTask({
    mimeType: "audio/mpeg",
    fileName: "note.mp3",
    fileData: Buffer.from("audio")
  });
  assert.equal(audio.transcript, "stub transcript");
  assert.equal(sdkCallCount(), before + 3);
});

test("a warm cached client is not reused after the selector is disabled, changed to unknown, or the key is removed", async () => {
  const apiKey = freshApiKey();
  setEnv("openai", apiKey);
  await runJsonTask("Warm the cache.");
  const warmedAt = sdkCallCount();
  assert.ok(warmedAt > 0);

  setEnv("disabled", apiKey);
  await assert.rejects(() => runJsonTask("After disable."), AiProviderConfigurationError);
  assert.equal(sdkCallCount(), warmedAt);

  setEnv("unknown-provider", apiKey);
  await assert.rejects(() => runJsonTask("After unknown."), AiProviderConfigurationError);
  assert.equal(sdkCallCount(), warmedAt);

  setEnv("openai", undefined);
  await assert.rejects(() => runJsonTask("After key removal."), AiProviderConfigurationError);
  assert.equal(sdkCallCount(), warmedAt);
});

test("rotating the key replaces the cached client and dispatch continues", async () => {
  setEnv("openai", freshApiKey());
  await runJsonTask("First key.");
  const afterFirst = sdkCallCount();
  setEnv("openai", freshApiKey());
  const result = await runJsonTask<{ ok: boolean }>("Second key.");
  assert.equal(result.ok, true);
  assert.equal(sdkCallCount(), afterFirst + 1);
});

test("configuration rejection is not retried as a provider failure", async () => {
  setEnv("disabled", freshApiKey());
  const before = sdkCallCount();
  await assert.rejects(() => runJsonTask("No retry on configuration errors."), AiProviderConfigurationError);
  // A single rejected attempt: getClient throws before any HTTP call, and
  // the JSON retry wrapper must not convert it into further attempts.
  assert.equal(sdkCallCount(), before);
});

test("genuine model-response failure retains the existing retry behavior", async () => {
  setEnv("openai", freshApiKey());
  chatCompletionsBehavior = "empty-then-ok";
  chatAttempts = 0;
  try {
    const result = await runJsonTask<{ ok: boolean }>("Retry me.");
    assert.equal(result.ok, true);
    assert.equal(chatAttempts, 2);
  } finally {
    chatCompletionsBehavior = "ok";
  }
});
