import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRTY_SUFFIX = "-dirty";

export function getMeaningfulChanges(statusOutput) {
  return statusOutput
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isWranglerStateChange(line));
}

export function getVersionEnvironment({ mode, appVersion, gitSha, statusOutput }) {
  const meaningfulChanges = getMeaningfulChanges(statusOutput);

  if (mode === "deploy" && meaningfulChanges.length > 0) {
    throw new Error(
      `Refusing deploy with uncommitted working tree changes:\n${meaningfulChanges.join("\n")}`
    );
  }

  if (mode === "deploy" && !gitSha) {
    throw new Error("Refusing deploy because the Git SHA is unavailable");
  }

  const normalizedSha = gitSha?.trim() || "unknown";
  const buildSha =
    mode === "dev" && normalizedSha !== "unknown" && meaningfulChanges.length > 0
      ? `${normalizedSha}${DIRTY_SUFFIX}`
      : normalizedSha;

  return {
    appVersion: typeof appVersion === "string" && appVersion.trim() ? appVersion.trim() : "unknown",
    buildSha
  };
}

export function createWranglerArgs(command, environment, extraArgs = []) {
  const args = [
    command,
    "--var",
    `APP_VERSION:${environment.appVersion}`,
    "--var",
    `BUILD_SHA:${environment.buildSha}`
  ];

  if (command === "deploy") {
    args.push("--keep-vars");
  }

  return [...args, ...extraArgs];
}

function isWranglerStateChange(line) {
  const pathPart = line.slice(3).trimStart();
  return pathPart === ".wrangler" || pathPart.startsWith(".wrangler/");
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  return typeof packageJson.version === "string" ? packageJson.version : "unknown";
}

function readGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT_DIR,
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}

function readGitStatus() {
  try {
    return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: ROOT_DIR,
      encoding: "utf8"
    });
  } catch {
    return "";
  }
}

function run(command, extraArgs) {
  const environment = getVersionEnvironment({
    mode: command,
    appVersion: readPackageVersion(),
    gitSha: readGitSha(),
    statusOutput: readGitStatus()
  });
  const wranglerBinary = path.join(
    ROOT_DIR,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler"
  );
  const child = spawn(wranglerBinary, createWranglerArgs(command, environment, extraArgs), {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const [command, ...extraArgs] = process.argv.slice(2);

  if (command === "dev" || command === "deploy") {
    try {
      run(command, extraArgs);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  } else {
    console.error("Usage: node scripts/wrangler.mjs <dev|deploy> [...wrangler args]");
    process.exitCode = 1;
  }
}
