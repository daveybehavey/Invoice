import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const repoRoot = process.cwd();
const gradlePath = path.join(repoRoot, "android", "app", "build.gradle");
const bundleDir = path.join(repoRoot, "android", "app", "build", "outputs", "bundle", "release");
const nativeSymbolsDir = path.join(repoRoot, "android", "app", "build", "outputs", "native-debug-symbols", "release");
const androidAssetsDir = path.join(repoRoot, "android", "app", "src", "main", "assets", "public");
const execFileAsync = promisify(execFile);

const requiredAndroidAssetPaths = [
  "dist/app.css",
  "dist/build-meta.js",
  "dist/runtime-config.js",
  "dist/vendor/react.production.min.js",
  "dist/vendor/react-dom.production.min.js",
  "dist/vendor/router.umd.min.js",
  "dist/vendor/react-router.production.min.js",
  "dist/vendor/react-router-dom.production.min.js"
];

function parseGradleValue(source, pattern) {
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

function compareBundleNames(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

async function readCurrentAndroidVersion() {
  const gradleSource = await fs.readFile(gradlePath, "utf8");
  return {
    applicationId: parseGradleValue(gradleSource, /applicationId\s+"([^"]+)"/),
    versionCode: Number.parseInt(parseGradleValue(gradleSource, /versionCode\s+(\d+)/) ?? "", 10) || null,
    versionName: parseGradleValue(gradleSource, /versionName\s+"([^"]+)"/)
  };
}

async function readBundleInventory() {
  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  const bundles = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".aab"))
      .map(async (entry) => {
        const fullPath = path.join(bundleDir, entry.name);
        const stats = await fs.stat(fullPath);
        const namedMatch = entry.name.match(/^app-release-(.+)\.aab$/i);
        return {
          file: entry.name,
          namedVersion: namedMatch?.[1] ?? null,
          bytes: stats.size,
          updatedAt: stats.mtime.toISOString()
        };
      })
  );

  return bundles.sort((left, right) => compareBundleNames(left.file, right.file));
}

async function readNativeSymbolInventory() {
  try {
    const entries = await fs.readdir(nativeSymbolsDir, { withFileTypes: true });
    const zips = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
        .map(async (entry) => {
          const fullPath = path.join(nativeSymbolsDir, entry.name);
          const stats = await fs.stat(fullPath);
          const namedMatch = entry.name.match(/^native-debug-symbols-(.+)\.zip$/i);
          return {
            file: entry.name,
            namedVersion: namedMatch?.[1] ?? null,
            bytes: stats.size,
            updatedAt: stats.mtime.toISOString()
          };
        })
    );
    return zips.sort((left, right) => compareBundleNames(left.file, right.file));
  } catch {
    return [];
  }
}

async function readMissingAndroidAssets() {
  const missing = [];
  for (const relativePath of requiredAndroidAssetPaths) {
    const fullPath = path.join(androidAssetsDir, relativePath);
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile() || stats.size <= 0) {
        missing.push(relativePath);
      }
    } catch {
      missing.push(relativePath);
    }
  }
  return missing;
}

async function readBundleEntries(bundlePath) {
  const javaHome = process.env.JAVA_HOME;
  const jarCandidates = [
    javaHome ? path.join(javaHome, "bin", "jar.exe") : "",
    javaHome ? path.join(javaHome, "bin", "jar") : "",
    "jar"
  ].filter(Boolean);

  let lastError = null;
  for (const jarPath of jarCandidates) {
    try {
      const { stdout } = await execFileAsync(jarPath, ["tf", bundlePath], {
        cwd: repoRoot,
        maxBuffer: 16 * 1024 * 1024
      });
      return new Set(stdout.split(/\r?\n/).filter(Boolean));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Unable to inspect Android App Bundle contents.");
}

async function resolveJarPath() {
  const javaHome = process.env.JAVA_HOME;
  const jarCandidates = [
    javaHome ? path.join(javaHome, "bin", "jar.exe") : "",
    javaHome ? path.join(javaHome, "bin", "jar") : "",
    "jar"
  ].filter(Boolean);

  let lastError = null;
  for (const jarPath of jarCandidates) {
    try {
      await execFileAsync(jarPath, ["--help"], {
        cwd: repoRoot,
        maxBuffer: 1024 * 1024
      });
      return jarPath;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Unable to find jar executable.");
}

async function hashFile(filePath) {
  const source = await fs.readFile(filePath);
  return createHash("sha256").update(source).digest("hex");
}

async function readMissingBundleAssets(latestArchivedBundle) {
  if (!latestArchivedBundle) {
    return requiredAndroidAssetPaths;
  }
  const bundlePath = path.join(bundleDir, latestArchivedBundle.file);
  const bundleEntries = await readBundleEntries(bundlePath);
  return requiredAndroidAssetPaths.filter(
    (relativePath) => !bundleEntries.has(`base/assets/public/${relativePath}`)
  );
}

async function readBundleAssetMismatches(latestArchivedBundle) {
  if (!latestArchivedBundle) {
    return requiredAndroidAssetPaths;
  }

  const jarPath = await resolveJarPath();
  const bundlePath = path.join(bundleDir, latestArchivedBundle.file);
  const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), "notebill-aab-"));
  try {
    await execFileAsync(jarPath, ["xf", bundlePath], {
      cwd: extractDir,
      maxBuffer: 16 * 1024 * 1024
    });

    const mismatches = [];
    for (const relativePath of requiredAndroidAssetPaths) {
      const androidAssetPath = path.join(androidAssetsDir, relativePath);
      const bundleAssetPath = path.join(extractDir, "base", "assets", "public", relativePath);
      try {
        const [androidHash, bundleHash] = await Promise.all([
          hashFile(androidAssetPath),
          hashFile(bundleAssetPath)
        ]);
        if (androidHash !== bundleHash) {
          mismatches.push(relativePath);
        }
      } catch {
        mismatches.push(relativePath);
      }
    }
    return mismatches;
  } finally {
    await fs.rm(extractDir, { recursive: true, force: true });
  }
}

async function main() {
  const [current, bundles, nativeSymbolInventory] = await Promise.all([
    readCurrentAndroidVersion(),
    readBundleInventory(),
    readNativeSymbolInventory()
  ]);
  const archivedBundles = bundles.filter((bundle) => bundle.file !== "app-release.aab");
  const latestArchivedBundle = archivedBundles.at(-1) ?? null;
  const archivedNativeSymbols = nativeSymbolInventory.filter((zip) => zip.file !== "native-debug-symbols.zip");
  const latestArchivedNativeSymbols = archivedNativeSymbols.at(-1) ?? null;
  const [missingAndroidAssets, missingBundleAssets, bundleAssetMismatches] = await Promise.all([
    readMissingAndroidAssets(),
    readMissingBundleAssets(latestArchivedBundle),
    readBundleAssetMismatches(latestArchivedBundle)
  ]);
  const latestBundleMatchesCurrentVersion = latestArchivedBundle?.namedVersion === current.versionName;
  const assetCheck = {
    required: requiredAndroidAssetPaths,
    missingAndroidAssets,
    missingLatestBundleAssets: missingBundleAssets,
    bundleAssetMismatches,
    latestBundleMatchesCurrentVersion
  };
  const ok =
    missingAndroidAssets.length === 0 &&
    missingBundleAssets.length === 0 &&
    bundleAssetMismatches.length === 0 &&
    latestBundleMatchesCurrentVersion;

  console.log(
    JSON.stringify(
      {
        ok,
        checkedAt: new Date().toISOString(),
        android: current,
        releaseBundleDir: bundleDir,
        nativeSymbolsDir,
        latestArchivedBundle,
        latestArchivedNativeSymbols,
        bundleInventory: bundles,
        nativeSymbolInventory,
        assetCheck
      },
      null,
      2
    )
  );
  if (!ok) {
    process.exitCode = 1;
  }
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
