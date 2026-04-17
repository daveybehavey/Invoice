import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  closeSync,
  existsSync,
  mkdirSync,
  renameSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const runtimeDir = path.join(rootDir, ".runtime", "public");
const appPidPath = path.join(runtimeDir, "notebill-dev.pid");
const tunnelPidPath = path.join(runtimeDir, "notebill-tunnel.pid");
const appLogPath = path.join(runtimeDir, "notebill-dev.log");
const tunnelLogPath = path.join(runtimeDir, "notebill-tunnel.log");
const cloudflaredDir = path.join(os.homedir(), ".cloudflared");
const cloudflaredConfigPath = path.join(cloudflaredDir, "config.yml");
const isWindows = process.platform === "win32";
const tunnelName = "notebill-app";
const publicHosts = ["app.notebill.app", "notebill.app", "www.notebill.app"];
const repoEnv = loadRepoEnv();
const nodeExecutable = process.execPath;
const tsxCliPath = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const buildFrontendScriptPath = path.join(rootDir, "scripts", "build-frontend.mjs");

function loadRepoEnv() {
  const merged = {};
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(rootDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    Object.assign(merged, dotenv.parse(readFileSync(filePath, "utf8")));
  }
  return merged;
}

function ensureRuntimeDir() {
  mkdirSync(runtimeDir, { recursive: true });
}

function ensureCloudflaredDir() {
  mkdirSync(cloudflaredDir, { recursive: true });
}

function commandExistsInPath(command) {
  const probe = spawnSync(isWindows ? "where" : "which", [command], {
    stdio: "ignore",
    shell: false
  });
  return probe.status === 0;
}

function resolveCommand(command) {
  if (!isWindows) {
    return command;
  }

  const candidatesByCommand = {
    npm: ["npm.cmd"],
    npx: ["npx.cmd"],
    cloudflared: [
      "cloudflared.exe",
      path.join(process.env.ProgramFiles || "C:\\Program Files", "cloudflared", "cloudflared.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "cloudflared", "cloudflared.exe")
    ]
  };

  const candidates = candidatesByCommand[command] || [command];
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    if (commandExistsInPath(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function isResolvedCommandAvailable(resolvedCommand) {
  return path.isAbsolute(resolvedCommand)
    ? existsSync(resolvedCommand)
    : commandExistsInPath(resolvedCommand);
}

function isCommandAvailable(command) {
  return isResolvedCommandAvailable(resolveCommand(command));
}

function assertCommand(command, message) {
  if (!isCommandAvailable(command)) {
    throw new Error(message || `${command} is not available in PATH.`);
  }
}

function readPid(pidPath) {
  if (!existsSync(pidPath)) {
    return null;
  }

  const raw = readFileSync(pidPath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function removeFileIfPresent(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  rmSync(filePath, { force: true });
}

function stopPidProcess(pidPath, label) {
  const pid = readPid(pidPath);
  if (!pid) {
    removeFileIfPresent(pidPath);
    return false;
  }

  if (!isProcessAlive(pid)) {
    removeFileIfPresent(pidPath);
    return false;
  }

  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false
    });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch (_error) {
      // Fall through and remove stale pid file below.
    }
  }

  removeFileIfPresent(pidPath);
  console.log(`Stopped ${label} (pid ${pid}).`);
  return true;
}

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function findWindowsManagedPids(kind) {
  if (!isWindows) {
    return [];
  }

  const pattern =
    kind === "app"
      ? "*node_modules*tsx*dist*cli.mjs*src/server.ts*"
      : `*cloudflared.exe*config.yml*tunnel run ${tunnelName}*`;
  return findWindowsProcessIdsByPattern(pattern);
}

function findWindowsPublicHostWrapperPids() {
  if (!isWindows) {
    return [];
  }

  return [
    ...findWindowsProcessIdsByPattern("*node scripts/public-host.mjs start*"),
    ...findWindowsProcessIdsByPattern("*cmd.exe /d /s /c node scripts/public-host.mjs start*")
  ].filter((pid, index, values) => values.indexOf(pid) === index);
}

function cleanupStaleWindowsPublicHostWrappers(excludePids = []) {
  if (!isWindows) {
    return false;
  }

  const excluded = new Set(excludePids.filter((pid) => Number.isInteger(pid) && pid > 0));
  let stoppedAny = false;

  for (const pid of findWindowsPublicHostWrapperPids()) {
    if (excluded.has(pid)) {
      continue;
    }
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false
    });
    console.log(`Stopped stale public host wrapper (pid ${pid}).`);
    stoppedAny = true;
  }

  return stoppedAny;
}

function findWindowsProcessIdsByPattern(pattern) {
  if (!isWindows) {
    return [];
  }

  const script = [
    "$processes = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like " + quoteForPowerShell(pattern) + " }",
    "$processes | Select-Object -ExpandProperty ProcessId"
  ].join("\n");

  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: false
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function ensureManagedPidFile(pidPath, kind) {
  const pid = readPid(pidPath);
  if (pid && isProcessAlive(pid)) {
    return pid;
  }

  const discovered = findWindowsManagedPids(kind)[0];
  if (discovered) {
    writeFileSync(pidPath, `${discovered}\n`, "utf8");
    return discovered;
  }

  return null;
}

function startDetachedProcess({ command, args, logPath, pidPath, env = {}, label }) {
  ensureRuntimeDir();

  if (isWindows) {
    const psCommand = [
      "$envMap = @{}",
      ...Object.entries(env).map(
        ([key, value]) => `$envMap[${quoteForPowerShell(key)}] = ${quoteForPowerShell(value)}`
      ),
      "$argumentList = @()",
      ...args.map((arg) => `$argumentList += ${quoteForPowerShell(arg)}`),
      "$startInfo = @{",
      `  FilePath = ${quoteForPowerShell(command)}`,
      "  ArgumentList = $argumentList",
      `  WorkingDirectory = ${quoteForPowerShell(rootDir)}`,
      "  WindowStyle = 'Hidden'",
      "  PassThru = $true",
      "}",
      "$previousValues = @{}",
      "foreach ($entry in $envMap.GetEnumerator()) {",
      "  $previousValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')",
      "  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')",
      "}",
      "$proc = Start-Process @startInfo",
      "$proc.Id",
      "foreach ($entry in $envMap.GetEnumerator()) {",
      "  [Environment]::SetEnvironmentVariable($entry.Key, $previousValues[$entry.Key], 'Process')",
      "}"
    ].join("\n");

    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", psCommand], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, ...repoEnv }
    });

    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || result.stdout?.trim() || `Failed to start ${label}.`);
    }

    const pid = Number.parseInt(result.stdout.trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error(`Failed to determine the pid for ${label}.`);
    }

    writeFileSync(pidPath, `${pid}\n`, "utf8");
    console.log(`Started ${label} (pid ${pid}).`);
    return pid;
  }

  const stdoutFd = openSync(logPath, "a");
  const stderrFd = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: rootDir,
    detached: true,
    env: { ...process.env, ...repoEnv, ...env },
    stdio: ["ignore", stdoutFd, stderrFd],
    shell: false
  });

  closeSync(stdoutFd);
  closeSync(stderrFd);
  child.unref();

  writeFileSync(pidPath, `${child.pid}\n`, "utf8");
  console.log(`Started ${label} (pid ${child.pid}). Logs: ${logPath}`);
  return child.pid;
}

async function waitForUrl(url, timeoutMs, label) {
  const startedAt = Date.now();
  const intervalMs = 1_000;

  while (Date.now() - startedAt < timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        console.log(`${label} ready: ${url} (${response.status})`);
        return;
      }
    } catch (_error) {
      // Keep polling until timeout.
    } finally {
      clearTimeout(timeout);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label} at ${url}.`);
}

function delegateToLegacyScript(scriptName) {
  execFileSync("bash", [path.join(__dirname, scriptName)], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function installCloudflaredIfNeeded() {
  if (isCommandAvailable("cloudflared")) {
    console.log("cloudflared already available.");
    return;
  }

  if (!isWindows) {
    throw new Error("cloudflared is not installed.");
  }

  assertCommand("winget", "winget is required to install cloudflared on Windows.");
  console.log("Installing cloudflared with winget...");
  try {
    execFileSync("winget", [
      "install",
      "--id",
      "Cloudflare.cloudflared",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--silent",
      "--disable-interactivity"
    ], {
      stdio: "inherit"
    });
  } catch (_error) {
    if (!isCommandAvailable("cloudflared")) {
      throw _error;
    }
  }

  const installedPath = resolveCommand("cloudflared");
  if (!isResolvedCommandAvailable(installedPath)) {
    throw new Error("cloudflared installation finished but the binary is still unavailable in PATH.");
  }

  console.log(`cloudflared ready at ${installedPath}`);
}

function findTunnelCredentialsPath() {
  if (!existsSync(cloudflaredDir)) {
    return null;
  }

  const candidates = readdirSync(cloudflaredDir)
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(cloudflaredDir, entry))
    .sort((left, right) => {
      const leftName = path.basename(left).toLowerCase();
      const rightName = path.basename(right).toLowerCase();
      return leftName.localeCompare(rightName);
    });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[candidates.length - 1];
}

function toPosixPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function writeTunnelConfig(tunnelId, credentialsPath) {
  ensureCloudflaredDir();
  const yaml = [
    `tunnel: ${tunnelId}`,
    `credentials-file: ${toPosixPath(credentialsPath)}`,
    "",
    "ingress:",
    "  - hostname: app.notebill.app",
    "    service: http://localhost:3000",
    "  - hostname: notebill.app",
    "    service: http://localhost:3000",
    "  - hostname: www.notebill.app",
    "    service: http://localhost:3000",
    "  - service: http_status:404",
    ""
  ].join("\n");

  writeFileSync(cloudflaredConfigPath, yaml, "utf8");
  console.log(`Wrote ${cloudflaredConfigPath}`);
}

function ensureTunnelCredentialsFile() {
  const tempCredentialsPath = path.join(cloudflaredDir, `${tunnelName}.json`);
  execFileSync(resolveCommand("cloudflared"), [
    "tunnel",
    "token",
    "--cred-file",
    tempCredentialsPath,
    tunnelName
  ], {
    cwd: rootDir,
    stdio: "ignore"
  });

  const credentialPayload = JSON.parse(readFileSync(tempCredentialsPath, "utf8"));
  const tunnelId = credentialPayload?.TunnelID;
  if (typeof tunnelId !== "string" || tunnelId.length === 0) {
    throw new Error(`Could not determine the tunnel id from ${tempCredentialsPath}.`);
  }

  const finalCredentialsPath = path.join(cloudflaredDir, `${tunnelId}.json`);
  if (tempCredentialsPath !== finalCredentialsPath) {
    if (existsSync(finalCredentialsPath)) {
      rmSync(finalCredentialsPath, { force: true });
    }
    renameSync(tempCredentialsPath, finalCredentialsPath);
  }

  return { tunnelId, credentialsPath: finalCredentialsPath };
}

function routePublicDns() {
  for (const hostname of publicHosts) {
    try {
      execFileSync(resolveCommand("cloudflared"), ["tunnel", "route", "dns", tunnelName, hostname], {
        stdio: "inherit"
      });
    } catch (error) {
      console.warn(`Skipping DNS route update for ${hostname}: ${error.message}`);
    }
  }
}

function installWindowsHostPrereqs() {
  ensureRuntimeDir();
  assertCommand("node", "node is required to host NoteBill from Windows.");
  if (!existsSync(tsxCliPath)) {
    throw new Error(`Missing ${tsxCliPath}. Run npm install before hosting NoteBill from Windows.`);
  }
  if (!existsSync(buildFrontendScriptPath)) {
    throw new Error(`Missing ${buildFrontendScriptPath}.`);
  }
  installCloudflaredIfNeeded();
  ensureCloudflaredDir();

  console.log("Windows host prerequisites look good.");
  console.log(`Runtime state: ${runtimeDir}`);

  if (!existsSync(cloudflaredConfigPath)) {
    console.log(`Cloudflare config not found yet at ${cloudflaredConfigPath}.`);
    console.log("Run `npm run public:tunnel:login` once, then `npm run public:tunnel:bootstrap`.");
  }
}

function runTunnelLogin() {
  installCloudflaredIfNeeded();
  ensureCloudflaredDir();
  console.log("Starting the one-time Cloudflare browser login for this Windows host...");
  execFileSync(resolveCommand("cloudflared"), ["tunnel", "login"], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function bootstrapTunnel() {
  installCloudflaredIfNeeded();
  ensureCloudflaredDir();

  const certPath = path.join(cloudflaredDir, "cert.pem");
  if (!existsSync(certPath)) {
    throw new Error(`Cloudflare login is required first. Missing ${certPath}. Run \`npm run public:tunnel:login\`.`);
  }

  const beforeCredentials = new Set(
    existsSync(cloudflaredDir)
      ? readdirSync(cloudflaredDir).filter((entry) => entry.toLowerCase().endsWith(".json"))
      : []
  );

  try {
    execFileSync(resolveCommand("cloudflared"), ["tunnel", "create", tunnelName], {
      cwd: rootDir,
      stdio: "inherit"
    });
  } catch (error) {
    console.warn(`Tunnel create returned a non-zero exit code. Continuing with existing tunnel if present. ${error.message}`);
  }

  const { tunnelId, credentialsPath } = ensureTunnelCredentialsFile();
  const createdCredentials = path.basename(credentialsPath);
  if (!beforeCredentials.has(createdCredentials)) {
    console.log(`Using tunnel credentials file ${createdCredentials}.`);
  } else {
    console.log(`Using existing tunnel credentials file ${createdCredentials}.`);
  }

  writeTunnelConfig(tunnelId, credentialsPath);
  routePublicDns();
}

async function startWindowsPublicHost() {
  installWindowsHostPrereqs();
  cleanupStaleWindowsPublicHostWrappers([process.pid, process.ppid]);

  if (!existsSync(cloudflaredConfigPath)) {
    throw new Error(`Missing ${cloudflaredConfigPath}. Run \`npm run public:tunnel:bootstrap\` before starting the public host.`);
  }

  stopPidProcess(tunnelPidPath, "NoteBill tunnel");
  stopPidProcess(appPidPath, "NoteBill app");

  execFileSync(nodeExecutable, [buildFrontendScriptPath], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ...repoEnv, NODE_ENV: "production" }
  });

  startDetachedProcess({
    command: nodeExecutable,
    args: [tsxCliPath, "src/server.ts"],
    logPath: appLogPath,
    pidPath: appPidPath,
    env: { NODE_ENV: "production" },
    label: "NoteBill app"
  });

  await waitForUrl("http://127.0.0.1:3000/health", 60_000, "Local health check");
  await waitForUrl("http://127.0.0.1:3000/privacy", 30_000, "Local privacy page");
  ensureManagedPidFile(appPidPath, "app");

  startDetachedProcess({
    command: resolveCommand("cloudflared"),
    args: ["--config", cloudflaredConfigPath, "tunnel", "run", tunnelName],
    logPath: tunnelLogPath,
    pidPath: tunnelPidPath,
    label: "NoteBill Cloudflare tunnel"
  });
  ensureManagedPidFile(tunnelPidPath, "tunnel");
  console.log("Started NoteBill app and Cloudflare tunnel. Run `npm run check:public-domain` to verify public readiness.");
}

function stopWindowsPublicHost() {
  let stoppedAnything = false;
  const stoppedTunnel = stopPidProcess(tunnelPidPath, "NoteBill tunnel");
  const stoppedApp = stopPidProcess(appPidPath, "NoteBill app");
  stoppedAnything = stoppedAnything || stoppedTunnel || stoppedApp;

  if (!stoppedTunnel) {
    for (const pid of findWindowsManagedPids("tunnel")) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false
      });
      console.log(`Stopped NoteBill tunnel (pid ${pid}) via command-line discovery.`);
      stoppedAnything = true;
    }
    removeFileIfPresent(tunnelPidPath);
  }

  if (!stoppedApp) {
    for (const pid of findWindowsManagedPids("app")) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false
      });
      console.log(`Stopped NoteBill app (pid ${pid}) via command-line discovery.`);
      stoppedAnything = true;
    }
    removeFileIfPresent(appPidPath);
  }

  for (const pid of findWindowsPublicHostWrapperPids()) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false
    });
    console.log(`Stopped public host wrapper (pid ${pid}).`);
    stoppedAnything = true;
  }

  if (!stoppedAnything) {
    console.log("No Windows-managed NoteBill public host processes were running.");
  }
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    throw new Error("Usage: node scripts/public-host.mjs <install|start|stop|tunnel-login|tunnel-bootstrap>");
  }

  if (!isWindows) {
    if (command === "install") {
      delegateToLegacyScript("install-notebill-user-services.sh");
      return;
    }
    if (command === "start") {
      delegateToLegacyScript("start-notebill-public.sh");
      return;
    }
    if (command === "stop") {
      delegateToLegacyScript("stop-notebill-public.sh");
      return;
    }
  }

  if (command === "install") {
    installWindowsHostPrereqs();
    return;
  }

  if (command === "start") {
    await startWindowsPublicHost();
    console.log("NoteBill public host is ready.");
    process.exit(0);
  }

  if (command === "stop") {
    stopWindowsPublicHost();
    return;
  }

  if (command === "tunnel-login") {
    runTunnelLogin();
    return;
  }

  if (command === "tunnel-bootstrap") {
    bootstrapTunnel();
    return;
  }

  throw new Error(`Unknown public host command: ${command}`);
}

main().catch((error) => {
  console.error("[public-host] failed", error);
  process.exitCode = 1;
});
