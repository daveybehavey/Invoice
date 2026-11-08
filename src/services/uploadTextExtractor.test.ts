/**
 * Covers: src/services/uploadTextExtractor.ts
 *
 * Focuses on deterministic local extract paths (text / empty / unsupported).
 * OCR and audio paths call OpenAI and are intentionally not exercised here
 * (no network; sibling/excluded AI surfaces).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractUploadedInvoiceText } from "./uploadTextExtractor.js";

test("extractUploadedInvoiceText: empty buffer throws", async () => {
  await assert.rejects(
    () => extractUploadedInvoiceText({ mimetype: "text/plain", buffer: Buffer.alloc(0) }),
    /Uploaded file is empty/
  );
});

test("extractUploadedInvoiceText: text/plain returns trimmed utf8", async () => {
  const text = await extractUploadedInvoiceText({
    mimetype: "text/plain",
    buffer: Buffer.from("  Client: Ada\nLabor 2h @ $80  \n", "utf8")
  });
  assert.equal(text, "Client: Ada\nLabor 2h @ $80");
});

test("extractUploadedInvoiceText: application/json is treated as text", async () => {
  const payload = '{"note":"synthetic"}';
  const text = await extractUploadedInvoiceText({
    mimetype: "application/json",
    buffer: Buffer.from(payload, "utf8")
  });
  assert.equal(text, payload);
});

test("extractUploadedInvoiceText: whitespace-only text file throws", async () => {
  await assert.rejects(
    () =>
      extractUploadedInvoiceText({
        mimetype: "text/plain",
        buffer: Buffer.from("   \n\t  ", "utf8")
      }),
    /Uploaded text file is empty/
  );
});

test("extractUploadedInvoiceText: unsupported mime throws with guidance", async () => {
  await assert.rejects(
    () =>
      extractUploadedInvoiceText({
        mimetype: "image/png",
        buffer: Buffer.from([1, 2, 3])
      }),
    /Unsupported file type: image\/png\. Upload PDF or text\./
  );
});
