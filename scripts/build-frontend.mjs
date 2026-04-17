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

async function main() {
  await fs.mkdir(distDir, { recursive: true });
  await clearDirectory(distDir);

  const jsxFiles = await collectFiles(publicDir, ".jsx");
  const jsFiles = await collectFiles(publicDir, ".js");

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
    if (entry.isFile() && absolutePath.endsWith(extension)) {
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

main().catch((error) => {
  console.error("[build-frontend] failed", error);
  process.exitCode = 1;
});
