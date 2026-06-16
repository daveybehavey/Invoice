import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const androidDir = path.join(repoRoot, "android");
const gradlePath = path.join(androidDir, "app", "build.gradle");
const releaseDir = path.join(androidDir, "app", "build", "outputs", "bundle", "release");
const rawBundlePath = path.join(releaseDir, "app-release.aab");
const symbolScriptPath = path.join(repoRoot, "scripts", "package-android-native-debug-symbols.mjs");

function parseGradleValue(source, pattern) {
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

async function readAndroidVersion() {
  const gradleSource = await fs.readFile(gradlePath, "utf8");
  return {
    versionCode: Number.parseInt(parseGradleValue(gradleSource, /versionCode\s+(\d+)/) ?? "", 10) || null,
    versionName: parseGradleValue(gradleSource, /versionName\s+"([^"]+)"/)
  };
}

async function hashFile(filePath) {
  const source = await fs.readFile(filePath);
  return createHash("sha256").update(source).digest("hex").toUpperCase();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runGradleBundle() {
  if (process.platform === "win32") {
    await execFileAsync("cmd.exe", ["/d", "/s", "/c", "gradlew.bat :app:bundleRelease --console=plain"], {
      cwd: androidDir,
      maxBuffer: 16 * 1024 * 1024
    });
    return;
  }

  await execFileAsync(path.join(androidDir, "gradlew"), [":app:bundleRelease", "--console=plain"], {
    cwd: androidDir,
    maxBuffer: 16 * 1024 * 1024
  });
}

async function archiveVersionedBundle(versionName) {
  const archivedBundlePath = path.join(releaseDir, `app-release-${versionName}.aab`);
  await fs.mkdir(releaseDir, { recursive: true });
  if (!(await fileExists(rawBundlePath))) {
    throw new Error(`Android release bundle not found at ${rawBundlePath}`);
  }
  await fs.copyFile(rawBundlePath, archivedBundlePath);
  return archivedBundlePath;
}

async function packageNativeDebugSymbols() {
  await execFileAsync(process.execPath, [symbolScriptPath], {
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024
  });
}

async function main() {
  const version = await readAndroidVersion();
  if (!version.versionName || !version.versionCode) {
    throw new Error("Unable to determine Android version from build.gradle");
  }

  await runGradleBundle();
  await packageNativeDebugSymbols();
  const archivedBundlePath = await archiveVersionedBundle(version.versionName);
  const stats = await fs.stat(archivedBundlePath);
  const sha256 = await hashFile(archivedBundlePath);

  console.log(
    JSON.stringify(
      {
        ok: true,
        android: version,
        bundle: {
          rawPath: rawBundlePath,
          archivedPath: archivedBundlePath,
          bytes: stats.size,
          sha256
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
