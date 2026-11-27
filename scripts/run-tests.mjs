import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Pass concrete paths to Node, independent of shell glob expansion.
const collectTests = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTests(filename);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [filename] : [];
  });
const files = collectTests("src").sort();
if (files.length === 0) throw new Error("No test files found in src");
if (process.argv.includes("--list")) {
  console.log(JSON.stringify(files));
} else {
  const result = spawnSync(process.execPath, [
    "--import", "tsx", "--test", "--test-concurrency=1",
    ...process.argv.slice(2), ...files
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
