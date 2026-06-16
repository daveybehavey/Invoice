import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const publicDir = path.join(repoRoot, "public");
const androidPublicDir = path.join(repoRoot, "android", "app", "src", "main", "assets", "public");

const requiredPaths = [
  "dist/app.css",
  "dist/build-meta.js",
  "dist/runtime-config.js",
  "dist/vendor/react.production.min.js",
  "dist/vendor/react-dom.production.min.js",
  "dist/vendor/router.umd.min.js",
  "dist/vendor/react-router.production.min.js",
  "dist/vendor/react-router-dom.production.min.js"
];

async function ensureFileCopied(relativePath) {
  const sourcePath = path.join(publicDir, relativePath);
  const destinationPath = path.join(androidPublicDir, relativePath);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function main() {
  await Promise.all(requiredPaths.map((relativePath) => ensureFileCopied(relativePath)));
  console.log(
    JSON.stringify(
      {
        ok: true,
        copied: requiredPaths
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
