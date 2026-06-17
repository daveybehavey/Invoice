import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const androidDir = path.join(repoRoot, "android");
const gradlePath = path.join(androidDir, "app", "build.gradle");
const nativeDebugMetadataDir = path.join(
  androidDir,
  "app",
  "build",
  "intermediates",
  "native_debug_metadata",
  "release",
  "extractReleaseNativeDebugMetadata",
  "out",
);
const symbolOutputDir = path.join(androidDir, "app", "build", "outputs", "native-debug-symbols", "release");

function parseGradleValue(source, pattern) {
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

async function readVersionName() {
  const gradleSource = await fs.readFile(gradlePath, "utf8");
  return parseGradleValue(gradleSource, /versionName\s+"([^"]+)"/);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(currentDir) {
  if (!(await fileExists(currentDir))) {
    return [];
  }
  const results = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
        continue;
      }
      if (entry.isFile()) {
        results.push(nextPath);
      }
    }
  }
  await walk(currentDir);
  return results;
}

async function packageZip(zipPath, sourceDir, rootName = null) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "notebill-native-symbols-"));
  try {
    const stagedDir = rootName ? path.join(tempDir, rootName) : tempDir;
    await fs.cp(sourceDir, stagedDir, { recursive: true });

    if (process.platform === "win32") {
      const script = [
        "$ErrorActionPreference='Stop'",
        `$zipPath = ${JSON.stringify(zipPath)}`,
        `$source = ${JSON.stringify(rootName ? path.join(tempDir, rootName) : path.join(tempDir, "*"))}`,
        "if (Test-Path $zipPath) { Remove-Item $zipPath -Force }",
        "Compress-Archive -Path $source -DestinationPath $zipPath -Force"
      ].join("; ");
      await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
        cwd: repoRoot,
        maxBuffer: 16 * 1024 * 1024
      });
      return;
    }

    await execFileAsync("zip", ["-r", zipPath, rootName ?? "."], {
      cwd: tempDir,
      maxBuffer: 16 * 1024 * 1024
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const versionName = await readVersionName();
  if (!versionName) {
    throw new Error("Unable to determine Android version name from build.gradle");
  }

  await fs.mkdir(symbolOutputDir, { recursive: true });
  const zipPath = path.join(symbolOutputDir, "native-debug-symbols.zip");
  const archivedZipPath = path.join(symbolOutputDir, `native-debug-symbols-${versionName}.zip`);
  const nativeDebugFiles = await collectFiles(nativeDebugMetadataDir);

  if (nativeDebugFiles.length === 0) {
    await fs.rm(zipPath, { force: true });
    await fs.rm(archivedZipPath, { force: true });
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          versionName,
          reason:
            "No native debug metadata files were generated for this release build. Do not upload a native debug symbols zip to Play Console for this build."
        },
        null,
        2
      )
    );
    return;
  }

  await packageZip(zipPath, nativeDebugMetadataDir);
  await fs.copyFile(zipPath, archivedZipPath);
  const stats = await fs.stat(archivedZipPath);

  console.log(
    JSON.stringify(
      {
        ok: true,
        versionName,
        nativeDebugFileCount: nativeDebugFiles.length,
        zip: {
          path: zipPath,
          archivedPath: archivedZipPath,
          bytes: stats.size
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
