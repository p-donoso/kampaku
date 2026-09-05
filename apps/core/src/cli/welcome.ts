import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultProject } from "../application/projects.js";
import { createModelBroker } from "../model-broker/client.js";
import type { AppConfig } from "../config.js";
import { bold, checkMark, cyan, dim, yellow } from "./ansi.js";
import { createAppContext, createCoreClient, createStoreContext } from "./context.js";

export const VERSION = "0.1.0";

const KAMPAKU_LOGO = [
  "██╗  ██╗ █████╗ ███╗   ███╗██████╗  █████╗ ██╗  ██╗██╗   ██╗",
  "██║ ██╔╝██╔══██╗████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝██║   ██║",
  "█████╔╝ ███████║██╔████╔██║██████╔╝███████║█████╔╝ ██║   ██║",
  "██╔═██╗ ██╔══██║██║╚██╔╝██║██╔═══╝ ██╔══██║██╔═██╗ ██║   ██║",
  "██║  ██╗██║  ██║██║ ╚═╝ ██║██║     ██║  ██║██║  ██╗╚██████╔╝",
  "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝",
];

type ServiceStatus = "running" | "stopped" | "docker";

export interface WelcomeStatus {
  core: { status: ServiceStatus; detail: string };
  worker: { status: ServiceStatus; detail: string };
  database: { ok: boolean; path: string };
  project?: { name: string; id: string };
  planner: string;
  agent: string;
  executor: string;
  freellmapi?: boolean;
  lastGoal?: { id: string; status: string };
  workspace: string;
  coreUrl: string;
}

function readPidFile(dataDir: string, name: string): number | "docker" | null {
  const path = join(dataDir, "run", `${name}.pid`);
  if (!existsSync(path)) return null;

  const content = readFileSync(path, "utf8").trim();
  if (content === "docker") return "docker";

  const pid = Number(content);
  return Number.isNaN(pid) ? null : pid;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function resolveServiceStatus(pid: number | "docker" | null): {
  status: ServiceStatus;
  detail: string;
} {
  if (pid === "docker") {
    return { status: "docker", detail: "docker compose" };
  }

  if (pid !== null && isProcessRunning(pid)) {
    return { status: "running", detail: `pid ${pid}` };
  }

  return { status: "stopped", detail: "stopped" };
}

function truncateId(id: string, length = 8): string {
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}

export async function collectWelcomeStatus(config: AppConfig): Promise<WelcomeStatus> {
  const client = createCoreClient(config);
  let coreHealthy = false;

  try {
    coreHealthy = await client.health();
  } catch {
    coreHealthy = false;
  }

  const corePid = readPidFile(config.dataDir, "core");
  const workerPid = readPidFile(config.dataDir, "worker");

  const core = coreHealthy
    ? ({ status: "running" as const, detail: config.coreUrl })
    : resolveServiceStatus(corePid);

  const status: WelcomeStatus = {
    core,
    worker: resolveServiceStatus(workerPid),
    database: {
      ok: existsSync(config.dbPath),
      path: config.dbPath,
    },
    planner: config.plannerMode,
    agent: config.agentMode,
    executor: process.env.KAMPAKU_EXECUTOR ?? "freellmapi",
    workspace: config.workspaceRoot,
    coreUrl: config.coreUrl,
  };

  if (status.database.ok) {
    try {
      const { store } = createStoreContext();
      const project = getDefaultProject(store);
      if (project) {
        status.project = { name: project.name, id: project.id };
      }
    } catch {
      // Database exists but is not readable yet.
    }
  }

  if (config.plannerMode === "llm" || config.agentMode === "llm") {
    try {
      const broker = createModelBroker({
        baseUrl: config.freellmapiBaseUrl,
        apiKey: config.freellmapiApiKey,
        model: config.agentMode === "llm" ? config.agentModel : config.plannerModel,
      });
      status.freellmapi = await broker.isAvailable();
    } catch {
      status.freellmapi = false;
    }
  }

  if (coreHealthy) {
    try {
      const goals = await client.listGoals({ limit: 1 });
      const goal = goals[0];
      if (goal) {
        status.lastGoal = { id: goal.id, status: goal.status };
      }
    } catch {
      // Core is up but goals are unavailable.
    }
  }

  return status;
}

function printStatusLine(label: string, ok: boolean | undefined, detail: string) {
  const mark = ok === undefined ? dim("·") : checkMark(ok);
  console.log(`  ${label.padEnd(12)} ${mark} ${detail}`);
}

function printQuickStart(command: string, description: string) {
  console.log(`  ${cyan(command)}`);
  console.log(`    ${dim(description)}`);
}

export async function printWelcome() {
  const { config } = createAppContext();
  const status = await collectWelcomeStatus(config);

  console.log("");
  for (const line of KAMPAKU_LOGO) {
    console.log(yellow(line));
  }
  console.log("");
  console.log(dim("  Autonomous agent control plane"));
  console.log("");

  const border = "─".repeat(42);
  const title = ` Kampaku v${VERSION} `.padEnd(42);
  console.log(cyan(`┌${border}┐`));
  console.log(cyan(`│${bold(title)}│`));
  console.log(cyan(`└${border}┘`));

  console.log("");
  console.log(bold(cyan("◆ Status")));
  printStatusLine(
    "Core",
    status.core.status === "running" || status.core.status === "docker",
    status.core.status === "running" ? status.coreUrl : status.core.detail,
  );
  printStatusLine(
    "Worker",
    status.worker.status === "running" || status.worker.status === "docker",
    status.worker.detail,
  );
  printStatusLine("Database", status.database.ok, status.database.path);
  printStatusLine(
    "Project",
    Boolean(status.project),
    status.project ? status.project.name : "not bootstrapped",
  );
  printStatusLine("Planner", undefined, status.planner);
  printStatusLine("Agent", undefined, status.agent);
  printStatusLine("Executor", undefined, status.executor);

  if (status.freellmapi !== undefined) {
    printStatusLine("FreeLLMApi", status.freellmapi, status.freellmapi ? "available" : "unavailable");
  }

  if (status.lastGoal) {
    printStatusLine(
      "Last goal",
      undefined,
      `${truncateId(status.lastGoal.id)} · ${status.lastGoal.status}`,
    );
  }

  console.log(`  ${dim("Workspace").padEnd(12)} ${dim(status.workspace)}`);

  console.log("");
  console.log(bold(cyan("◆ Quick start")));
  printQuickStart("Type a message", "Talk to Kampaku");
  printQuickStart("/agents tree", "Show agent hierarchy");
  printQuickStart("/agents delete <slug> -y", "Delete a leaf agent");
  printQuickStart("/agents update <slug>", "Update agent fields");
  printQuickStart("/status", "Show the latest goal audit trail");
  printQuickStart("/clear", "Clear the screen");
  printQuickStart("/help", "Show all REPL commands");
  console.log("");
  console.log(dim("  Other terminal:"));
  printQuickStart("kampaku dev", "Start core + worker with hot reload");
  printQuickStart('kampaku run "Add GET /health endpoint"', "Submit a goal and wait for completion");
  printQuickStart("kampaku bootstrap", "Initialize data dir and project registry");

  console.log("");
  console.log(dim("Run `kampaku --help` for all commands."));
  console.log("");
}
