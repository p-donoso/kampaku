import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Command } from "commander";
import { createAppContext, createCoreClient, detectWorkspaceRoot, loadWorkspaceEnv } from "../context.js";
import {
  resolveFreellmapiKeyForDev,
  waitForFreellmapi,
} from "../freellmapi-dev.js";
import { sleep, stopListenersOnPort } from "../port.js";

interface DevOptions {
  noWorker?: boolean;
  noFreellmapi?: boolean;
  noWeb?: boolean;
  webPort?: string;
  planner?: "stub" | "llm";
  agent?: "stub" | "llm";
}

export function registerDevCommand(program: Command) {
  program
    .command("dev")
    .alias("up")
    .description("Start the full Kampaku stack (FreeLLMApi, Core, Worker, Web UI)")
    .option("--no-worker", "Start without Worker")
    .option("--no-freellmapi", "Do not start FreeLLMApi")
    .option("--no-web", "Do not start kampaku-web")
    .option("--web-port <port>", "Web UI port (default: KAMPAKU_WEB_PORT or 3002)")
    .option("--planner <mode>", "Planner mode: stub or llm")
    .option("--agent <mode>", "Kampaku chat agent mode: stub or llm")
    .action(async (options: DevOptions) => {
      await runDevStack(options);
    });
}

export async function runDevStack(options: DevOptions = {}): Promise<void> {
  const workspace = detectWorkspaceRoot();
  loadWorkspaceEnv(workspace);
  const { config } = createAppContext();
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (options.planner) {
    env.KAMPAKU_PLANNER = options.planner;
  }

  if (options.agent) {
    env.KAMPAKU_AGENT = options.agent;
  }

  const webPort = options.webPort ? Number(options.webPort) : config.webPort;
  env.KAMPAKU_WEB_PORT = String(webPort);
  env.KAMPAKU_CORE_URL = config.coreUrl;
  env.NEXT_PUBLIC_KAMPAKU_API_URL = config.coreUrl;

  stopBackgroundServices(config.dataDir);

  const stoppedOnPort = stopListenersOnPort(config.corePort);
  if (stoppedOnPort.length > 0) {
    console.log(
      `Stopped previous listener(s) on port ${config.corePort}: ${stoppedOnPort.join(", ")}`,
    );
    await sleep(500);
  }

  if (!options.noWeb) {
    const stoppedWeb = stopListenersOnPort(webPort);
    if (stoppedWeb.length > 0) {
      console.log(`Stopped previous listener(s) on port ${webPort}: ${stoppedWeb.join(", ")}`);
      await sleep(500);
    }
  }

  const children: ChildProcess[] = [];
  const shutdown = () => {
    for (const child of children) {
      child.kill("SIGTERM");
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("Kampaku stack");
  console.log(`  workspace:  ${workspace}`);
  console.log(`  core url:   ${config.coreUrl}`);
  console.log(`  web ui:     ${options.noWeb ? "(disabled)" : `http://localhost:${webPort}`}`);
  console.log(`  planner:    ${env.KAMPAKU_PLANNER ?? "stub"}`);
  console.log(`  agent:      ${env.KAMPAKU_AGENT ?? "stub"}`);
  console.log(`  executor:   ${env.KAMPAKU_EXECUTOR ?? "freellmapi"}`);
  console.log("  Press Ctrl+C to stop");
  console.log("");

  if (!options.noFreellmapi && shouldStartFreeLLMApi(env)) {
    maybeStartFreeLLMApi(workspace, env, children);
    const baseUrl = env.FREELLMAPI_BASE_URL ?? "http://localhost:3001/v1";
    const ready = await waitForFreellmapi(baseUrl);
    if (!ready) {
      console.warn("FreeLLMApi did not become ready in time; LLM modes may fail.");
    } else {
      await resolveFreellmapiKeyForDev(workspace, env);
    }
  }

  const coreDir = join(workspace, "kampaku-core");
  const workerDir = join(workspace, "kampaku-worker");
  const webDir = join(workspace, "kampaku-web");

  children.push(spawnWatchedProcess("core", coreDir, ["serve"], env, config.dataDir));

  if (!options.noWorker) {
    const client = createCoreClient(config);
    console.log("Waiting for Core to become healthy...");
    await client.waitForHealth(60_000);
    children.push(spawnWatchedProcess("worker", workerDir, ["run"], env, config.dataDir));
  }

  if (!options.noWeb) {
    ensureWebDependencies(webDir);
    applyLanDevOrigins(env);
    children.push(spawnWebProcess(webDir, webPort, env, config.dataDir));
  }

  await new Promise(() => {});
}

function detectLanDevOrigins(): string[] {
  const hosts: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      hosts.push(entry.address);
    }
  }
  return hosts;
}

function applyLanDevOrigins(env: NodeJS.ProcessEnv) {
  const lanHosts = detectLanDevOrigins();
  if (lanHosts.length === 0) return;

  const existing =
    env.KAMPAKU_ALLOWED_DEV_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ??
    [];

  env.KAMPAKU_ALLOWED_DEV_ORIGINS = [...new Set([...existing, ...lanHosts])].join(",");
}

function spawnWatchedProcess(
  label: string,
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  dataDir: string,
): ChildProcess {
  const child = spawn("npx", ["tsx", "watch", "src/cli.ts", ...args], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (child.pid) {
    writePidFile(dataDir, label, child.pid);
  }

  pipeWithPrefix(label, child.stdout);
  pipeWithPrefix(label, child.stderr);

  child.on("exit", (code, signal) => {
    clearPidFile(dataDir, label);
    if (signal) {
      console.error(`[${label}] exited due to signal ${signal}`);
    } else if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

function spawnWebProcess(
  cwd: string,
  port: number,
  env: NodeJS.ProcessEnv,
  dataDir: string,
): ChildProcess {
  const child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (child.pid) {
    writePidFile(dataDir, "web", child.pid);
  }

  pipeWithPrefix("web", child.stdout);
  pipeWithPrefix("web", child.stderr);

  child.on("exit", (code, signal) => {
    clearPidFile(dataDir, "web");
    if (signal) {
      console.error(`[web] exited due to signal ${signal}`);
    } else if (code && code !== 0) {
      console.error(`[web] exited with code ${code}`);
    }
  });

  return child;
}

function ensureWebDependencies(webDir: string): void {
  if (!existsSync(webDir)) {
    throw new Error(`kampaku-web not found at ${webDir}`);
  }
  if (!existsSync(join(webDir, "node_modules"))) {
    console.log("[web] Installing dependencies...");
    const result = spawnSync("npm", ["install"], { cwd: webDir, stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`npm install failed in ${webDir}`);
    }
  }
}

function writePidFile(dataDir: string, name: string, pid: number) {
  const runDir = join(dataDir, "run");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, `${name}.pid`), String(pid));
}

function clearPidFile(dataDir: string, name: string) {
  const path = join(dataDir, "run", `${name}.pid`);
  if (existsSync(path)) unlinkSync(path);
}

function pipeWithPrefix(label: string, stream: NodeJS.ReadableStream | null) {
  if (!stream) return;

  const reader = createInterface({ input: stream });
  reader.on("line", (line) => {
    console.log(`[${label}] ${line}`);
  });
}

function stopBackgroundServices(dataDir: string) {
  const runDir = join(dataDir, "run");
  for (const name of ["web", "worker", "core", "freellmapi"]) {
    const pidFile = join(runDir, `${name}.pid`);
    if (!existsSync(pidFile)) continue;

    const pid = readFileSync(pidFile, "utf8").trim();
    if (pid === "docker") {
      unlinkSync(pidFile);
      continue;
    }

    const numericPid = Number(pid);
    if (!Number.isNaN(numericPid)) {
      try {
        process.kill(numericPid, 0);
        process.kill(numericPid, "SIGTERM");
      } catch {
        // Process is not running.
      }
    }

    unlinkSync(pidFile);
  }
}

function shouldStartFreeLLMApi(env: NodeJS.ProcessEnv): boolean {
  if (env.KAMPAKU_START_FREELLMAPI === "false") return false;

  const planner = env.KAMPAKU_PLANNER ?? "llm";
  const agent = env.KAMPAKU_AGENT ?? "stub";
  const startMode = env.KAMPAKU_START_FREELLMAPI ?? "auto";
  if (planner === "stub" && agent === "stub" && startMode === "auto") {
    console.log(
      "FreeLLMApi skipped (KAMPAKU_PLANNER=stub and KAMPAKU_AGENT=stub). Set KAMPAKU_START_FREELLMAPI=true to include it.",
    );
    return false;
  }

  return true;
}

function maybeStartFreeLLMApi(
  workspace: string,
  env: NodeJS.ProcessEnv,
  children: ChildProcess[],
) {
  if (!shouldStartFreeLLMApi(env)) return;

  const child = spawn("docker", ["compose", "up", "-d", "freellmapi"], {
    cwd: workspace,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  pipeWithPrefix("freellmapi", child.stdout);
  pipeWithPrefix("freellmapi", child.stderr);
  children.push(child);
}
