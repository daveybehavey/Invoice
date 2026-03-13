import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();

function readText(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  const content = readText(relativePath);
  if (content === null) {
    return null;
  }
  return JSON.parse(content);
}

function hasInstalledPackage(packageJson, packageName) {
  return Boolean(
    packageJson?.dependencies?.[packageName] || packageJson?.devDependencies?.[packageName]
  );
}

const manifest = readJson("public/manifest.webmanifest");
const capacitorConfig = readJson("capacitor.config.json");
const packageJson = readJson("package.json");
const indexHtml = readText("public/index.html");

const checks = [
  {
    id: "manifest",
    description: "Manifest contains launch-ready metadata",
    ok:
      Boolean(manifest?.name) &&
      Boolean(manifest?.short_name) &&
      Boolean(manifest?.description) &&
      manifest?.display === "standalone" &&
      manifest?.start_url === "/" &&
      manifest?.scope === "/" &&
      manifest?.orientation === "portrait-primary" &&
      Array.isArray(manifest?.categories) &&
      manifest.categories.length >= 2 &&
      Boolean(manifest?.theme_color) &&
      Boolean(manifest?.background_color),
    reason: manifest ? "ok" : "missing"
  },
  {
    id: "manifest-icons",
    description: "Manifest declares 192 and 512 icons with maskable support",
    ok:
      Array.isArray(manifest?.icons) &&
      manifest.icons.some((icon) => icon?.sizes === "192x192") &&
      manifest.icons.some((icon) => icon?.sizes === "512x512") &&
      manifest.icons.some((icon) => String(icon?.purpose || "").includes("maskable")),
    reason: manifest ? "ok" : "missing"
  },
  {
    id: "index-meta",
    description: "HTML shell links manifest and mobile meta tags",
    ok:
      typeof indexHtml === "string" &&
      indexHtml.includes('rel="manifest"') &&
      indexHtml.includes('name="theme-color"') &&
      indexHtml.includes('rel="apple-touch-icon"'),
    reason: indexHtml ? "ok" : "missing"
  },
  {
    id: "icon-192",
    description: "192x192 app icon exists",
    ok: fs.existsSync(path.join(rootDir, "public/icons/notebill-192.png")),
    reason: "missing"
  },
  {
    id: "icon-512",
    description: "512x512 app icon exists",
    ok: fs.existsSync(path.join(rootDir, "public/icons/notebill-512.png")),
    reason: "missing"
  },
  {
    id: "capacitor-config",
    description: "Capacitor config includes stable app metadata",
    ok:
      Boolean(capacitorConfig?.appId) &&
      Boolean(capacitorConfig?.appName) &&
      capacitorConfig?.webDir === "public",
    reason: capacitorConfig ? "ok" : "missing"
  },
  {
    id: "capacitor-security",
    description: "Capacitor config avoids cleartext production transport",
    ok: capacitorConfig?.server?.cleartext !== true,
    reason: capacitorConfig ? "ok" : "missing"
  },
  {
    id: "capacitor-packages",
    description: "Capacitor CLI/core packages are installed",
    ok:
      hasInstalledPackage(packageJson, "@capacitor/core") &&
      hasInstalledPackage(packageJson, "@capacitor/cli"),
    reason: packageJson ? "ok" : "missing"
  }
];

for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.description}`);
}

const allPassed = checks.every((check) => check.ok);

if (allPassed) {
  console.log("\nMobile/store packaging baseline: PASS");
  console.log("Next: add native platforms with `npx cap add ios` and `npx cap add android` when ready.");
} else {
  console.log("\nMobile/store packaging baseline: FAIL");
  console.log("Fix the failed checks above before moving into native platform packaging.");
  process.exitCode = 1;
}
