import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { build as esbuild } from "esbuild";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const distDir = path.join(publicDir, "dist");
const tailwindInput = path.join(publicDir, "styles", "app.css");
const tailwindConfig = path.join(rootDir, "tailwind.config.cjs");
const tailwindOutput = path.join(distDir, "app.css");
const tailwindCli = path.join(rootDir, "node_modules", "tailwindcss", "lib", "cli.js");
const vendorFiles = [
  ["node_modules/react/umd/react.production.min.js", "react.production.min.js"],
  ["node_modules/react-dom/umd/react-dom.production.min.js", "react-dom.production.min.js"],
  ["node_modules/@remix-run/router/dist/router.umd.min.js", "router.umd.min.js"],
  ["node_modules/react-router/dist/umd/react-router.production.min.js", "react-router.production.min.js"],
  [
    "node_modules/react-router-dom/dist/umd/react-router-dom.production.min.js",
    "react-router-dom.production.min.js"
  ]
];

async function main() {
  await fs.mkdir(distDir, { recursive: true });
  await clearDirectory(distDir);

  const jsxFiles = await collectFiles(publicDir, ".jsx");
  const jsFiles = await collectFiles(publicDir, ".js");

  await Promise.all(
    jsxFiles.map(async (absolutePath) => {
      const relativePath = path.relative(publicDir, absolutePath).replace(/\.jsx$/i, ".js");
      const destination = path.join(distDir, relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
    })
  );

  if (jsxFiles.length > 0) {
    await esbuild({
      entryPoints: jsxFiles,
      outdir: distDir,
      outbase: publicDir,
      bundle: false,
      logLevel: "info",
      target: "es2020",
      loader: { ".jsx": "jsx" }
    });
  }

  await Promise.all(
    jsFiles.map(async (absolutePath) => {
      const relativePath = path.relative(publicDir, absolutePath);
      const destination = path.join(distDir, relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(absolutePath, destination);
    })
  );

  await runTailwindBuild();
  await copyVendorAssets();
}

async function collectFiles(directory, extension) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "dist") {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, extension)));
      continue;
    }
    // Windows can surface moved OneDrive-backed files as reparse points.
    // Node can still read them normally, but Dirent.isFile() may return false.
    if (!entry.isDirectory() && absolutePath.endsWith(extension)) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function clearDirectory(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(directory, entry.name), { recursive: true, force: true })
    )
  );
}

async function runTailwindBuild() {
  await new Promise((resolve, reject) => {
    const args = ["-c", tailwindConfig, "-i", tailwindInput, "-o", tailwindOutput, "--minify"];
    const child = spawn(process.execPath, [tailwindCli, ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        BROWSERSLIST_IGNORE_OLD_DATA: "1"
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tailwind build failed with exit code ${code}`));
    });
  });
}

async function copyVendorAssets() {
  const vendorDir = path.join(distDir, "vendor");
  await fs.mkdir(vendorDir, { recursive: true });
  await Promise.all(
    vendorFiles.map(async ([sourceRelativePath, destinationFileName]) => {
      const source = path.join(rootDir, sourceRelativePath);
      const destination = path.join(vendorDir, destinationFileName);
      await fs.copyFile(source, destination);
    })
  );
}

main().catch((error) => {
  console.error("[build-frontend] failed", error);
  process.exitCode = 1;
});
