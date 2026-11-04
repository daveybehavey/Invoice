import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("default test manifest contains every root suite, nested suites and corpus once", () => {
  const files: string[] = JSON.parse(execFileSync(process.execPath, ["scripts/run-tests.mjs", "--list"], { encoding: "utf8" }));
  for (const name of readdirSync("src").filter((name) => name.endsWith(".test.ts"))) {
    assert.ok(files.includes(path.join("src", name)), `Missing root suite ${name}`);
  }
  assert.ok(files.includes(path.join("src", "services", "invoicePipeline.test.ts")));
  assert.ok(files.includes(path.join("src", "testdata", "goldenCorpus", "goldenCorpus.test.ts")));
  assert.equal(new Set(files).size, files.length);
  assert.deepEqual(files, [...files].sort());
});
