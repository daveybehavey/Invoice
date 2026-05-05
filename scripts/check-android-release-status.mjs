import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const gradlePath = path.join(repoRoot, "android", "app", "build.gradle");
const bundleDir = path.join(repoRoot, "android", "app", "build", "outputs", "bundle", "release");

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

async function main() {
  const [current, bundles] = await Promise.all([readCurrentAndroidVersion(), readBundleInventory()]);
  const archivedBundles = bundles.filter((bundle) => bundle.file !== "app-release.aab");
  const latestArchivedBundle = archivedBundles.at(-1) ?? null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedAt: new Date().toISOString(),
        android: current,
        releaseBundleDir: bundleDir,
        latestArchivedBundle,
        bundleInventory: bundles
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
