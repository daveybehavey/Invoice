import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function readText(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  const text = readText(relativePath);
  return text ? JSON.parse(text) : null;
}

function hasInstalledPackage(packageJson, packageName) {
  return Boolean(
    packageJson?.dependencies?.[packageName] || packageJson?.devDependencies?.[packageName]
  );
}

const packageJson = readJson("package.json");
const capacitorConfig = readJson("capacitor.config.json");
const workflow = readText(".github/workflows/ios-testflight.yml");

const checks = [
  {
    id: "ios-shell",
    description: "Native iOS shell exists",
    ok: exists("ios/App/App.xcodeproj")
  },
  {
    id: "workflow",
    description: "GitHub Actions iOS workflow exists and names the required secrets",
    ok:
      Boolean(workflow) &&
      workflow.includes("APPLE_TEAM_ID") &&
      workflow.includes("IOS_DISTRIBUTION_CERT_BASE64") &&
      workflow.includes("IOS_PROVISION_PROFILE_BASE64") &&
      workflow.includes("APPSTORE_API_KEY_ID") &&
      workflow.includes("Upload to TestFlight")
  },
  {
    id: "capacitor-config",
    description: "Capacitor config has a stable app id and web directory",
    ok:
      Boolean(capacitorConfig?.appId) &&
      Boolean(capacitorConfig?.appName) &&
      capacitorConfig?.webDir === "public"
  },
  {
    id: "capacitor-packages",
    description: "Capacitor packages are installed",
    ok:
      hasInstalledPackage(packageJson, "@capacitor/core") &&
      hasInstalledPackage(packageJson, "@capacitor/cli")
  },
  {
    id: "launch-docs",
    description: "iOS launch docs are present",
    ok:
      exists("docs/ios-github-actions-cheap-path.md") &&
      exists("docs/apple-app-store-launch-pack.md") &&
      exists("docs/apple-app-store-final-checklist.md")
  }
];

const manualChecks = [
  {
    id: "apple-membership",
    description: "Apple Developer Program membership and App Store Connect access"
  },
  {
    id: "signing-assets",
    description: "Distribution certificate, provisioning profile, and App Store Connect API key"
  },
  {
    id: "device-smoke",
    description: "One real device smoke test after the first signed build"
  }
];

for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.description}`);
}

console.log("\nManual items you still need to confirm:");
for (const item of manualChecks) {
  console.log(`- ${item.description}`);
}

const allRepoChecksPassed = checks.every((check) => check.ok);

if (allRepoChecksPassed) {
  console.log("\niOS launch readiness: REPO PASS");
  console.log("Next: complete the Apple account and signing steps, then run the GitHub Actions workflow.");
} else {
  console.log("\niOS launch readiness: REPO FAIL");
  process.exitCode = 1;
}
