import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();

const checks = [
  {
    id: "manifest",
    description: "Manifest file exists",
    path: "public/manifest.webmanifest",
    validate: (content) => content.includes('"name"') && content.includes('"icons"')
  },
  {
    id: "service-worker",
    description: "Service worker file exists",
    path: "public/sw.js",
    validate: (content) => content.includes("self.addEventListener")
  },
  {
    id: "icon-192",
    description: "192x192 app icon exists",
    path: "public/icons/notebill-192.png",
    validate: () => true
  },
  {
    id: "icon-512",
    description: "512x512 app icon exists",
    path: "public/icons/notebill-512.png",
    validate: () => true
  },
  {
    id: "capacitor-config",
    description: "Capacitor config baseline exists",
    path: "capacitor.config.json",
    validate: (content) => content.includes('"appId"') && content.includes('"webDir"')
  }
];

function readFileContent(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  if (fs.statSync(absolutePath).isDirectory()) {
    return "__DIR__";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

const results = checks.map((check) => {
  const content = readFileContent(check.path);
  if (content === null) {
    return { ...check, ok: false, reason: "missing" };
  }
  try {
    const ok = check.validate(content);
    return { ...check, ok, reason: ok ? "ok" : "invalid" };
  } catch (error) {
    return { ...check, ok: false, reason: error instanceof Error ? error.message : "invalid" };
  }
});

for (const result of results) {
  const icon = result.ok ? "OK" : "FAIL";
  console.log(`${icon} ${result.description} (${result.path})`);
}

const allPassed = results.every((result) => result.ok);

if (allPassed) {
  console.log("\nMobile wrapper baseline readiness: PASS");
  console.log("Next: install Capacitor packages and run platform sync when ready.");
} else {
  console.log("\nMobile wrapper baseline readiness: FAIL");
  console.log("Fix the failing checks above before wrapping for iOS/Android.");
  process.exitCode = 1;
}
