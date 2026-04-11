import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const shouldAssert = process.argv.includes("--assert");
const requireDevice = process.argv.includes("--require-device");
const rootDir = process.cwd();
const homeDir = process.env.HOME ?? "";

function resolveLocalBinary(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      continue;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function resolveSdkRoot() {
  const candidates = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  if (homeDir) {
    candidates.push(path.join(homeDir, "Android", "Sdk"));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? "";
}

function checkCommand(command, args = [], extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv
    }
  });
  if (result.error) {
    return {
      ok: false,
      detail: result.error.message
    };
  }
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  return {
    ok: result.status === 0,
    detail: [stdout, stderr].filter(Boolean).join("\n").split("\n")[0] ?? ""
  };
}

const sdkRoot = resolveSdkRoot();
const sdkPlatformTools = sdkRoot ? path.join(sdkRoot, "platform-tools") : "";
const javaHome = process.env.JAVA_HOME?.trim() || (homeDir ? path.join(homeDir, ".local", "jdk-current") : "");
const javaExecutable = resolveLocalBinary([
  javaHome ? path.join(javaHome, "bin", "java") : ""
]);
const adbExecutable = resolveLocalBinary([
  sdkPlatformTools ? path.join(sdkPlatformTools, "adb") : ""
]);
const sdkmanagerExecutable = resolveLocalBinary([
  sdkRoot ? path.join(sdkRoot, "cmdline-tools", "latest", "bin", "sdkmanager") : ""
]);

function listAdbDevices() {
  const adbCommand = adbExecutable || "adb";
  const result = spawnSync(adbCommand, ["devices"], {
    stdio: "pipe",
    encoding: "utf8",
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_SDK_ROOT: sdkRoot,
      ANDROID_HOME: sdkRoot
    }
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      devices: [],
      detail: result.error ? result.error.message : String(result.stderr ?? "").trim()
    };
  }
  const lines = String(result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const deviceLines = lines
    .slice(1)
    .filter((line) => /\bdevice$/.test(line) || /\bemulator-\d+\b/.test(line));
  return {
    ok: true,
    devices: deviceLines,
    detail: deviceLines.length > 0 ? deviceLines.join(", ") : "none connected"
  };
}

const checks = [
  {
    id: "node",
    description: "Node.js is installed",
    ...checkCommand("node", ["--version"])
  },
  {
    id: "java",
    description: "Java runtime is available",
    ...(javaExecutable
      ? checkCommand(javaExecutable, ["-version"], {
          JAVA_HOME: javaHome
        })
      : checkCommand("java", ["-version"]))
  },
  {
    id: "adb",
    description: "Android Debug Bridge (adb) is available",
    ...(adbExecutable
      ? checkCommand(adbExecutable, ["version"], {
          JAVA_HOME: javaHome,
          ANDROID_SDK_ROOT: sdkRoot,
          ANDROID_HOME: sdkRoot
        })
      : checkCommand("adb", ["version"]))
  },
  {
    id: "sdkmanager",
    description: "Android sdkmanager is available",
    ...(sdkmanagerExecutable
      ? checkCommand(sdkmanagerExecutable, ["--version"], {
          JAVA_HOME: javaHome,
          ANDROID_SDK_ROOT: sdkRoot,
          ANDROID_HOME: sdkRoot
        })
      : checkCommand("sdkmanager", ["--version"]))
  },
  {
    id: "sdk-root",
    description: "ANDROID_SDK_ROOT / ANDROID_HOME points to an existing SDK directory",
    ok: Boolean(sdkRoot) && fs.existsSync(sdkRoot),
    detail: sdkRoot || "not set"
  },
  {
    id: "sdk-platform-tools",
    description: "Android SDK platform-tools directory exists",
    ok: Boolean(sdkPlatformTools) && fs.existsSync(sdkPlatformTools),
    detail: sdkPlatformTools || "not found"
  },
  {
    id: "capacitor-config",
    description: "Capacitor config exists",
    ok: fs.existsSync(path.join(rootDir, "capacitor.config.json")),
    detail: "capacitor.config.json"
  },
  {
    id: "android-project",
    description: "Native Android project folder exists (npx cap add android)",
    ok: fs.existsSync(path.join(rootDir, "android")),
    detail: "android/"
  }
];

const adbDevices = listAdbDevices();
checks.push({
  id: "adb-device",
  description: requireDevice
    ? "At least one Android device/emulator is connected"
    : "Android device/emulator connection status (informational)",
  ok: requireDevice ? adbDevices.ok && adbDevices.devices.length > 0 : true,
  detail: adbDevices.ok ? adbDevices.detail : `adb unavailable: ${adbDevices.detail}`
});

const failures = checks.filter((check) => !check.ok);
const passed = failures.length === 0;
const summary = {
  passed,
  totalChecks: checks.length,
  failedChecks: failures.length,
  requireDevice,
  connectedDevices: adbDevices.devices.length
};

for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.description}`);
  if (check.detail) {
    console.log(`  ${check.detail}`);
  }
}

console.log("\nSummary");
console.log(JSON.stringify(summary, null, 2));

if (!passed) {
  console.log("\nSuggested next commands:");
  if (!checks.find((check) => check.id === "android-project")?.ok) {
    console.log("- npm run cap:sync");
    console.log("- npx cap add android");
  }
  if (!checks.find((check) => check.id === "adb")?.ok) {
    console.log("- Install Android SDK Platform Tools and ensure `adb` is on PATH.");
  }
  if (!checks.find((check) => check.id === "java")?.ok) {
    console.log("- Install JDK and set JAVA_HOME (or source scripts/android-env.sh).");
  }
  console.log("- npm run cap:sync");
  console.log("- npm run cap:open:android");
}

if (shouldAssert && !passed) {
  process.exitCode = 1;
}
