import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapProject } from "../src/application/projects.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/persistence/db.js";
import { Store } from "../src/persistence/store.js";
import { parseReplInput, isReplAvailable } from "../src/cli/repl.js";
import { collectWelcomeStatus, printWelcome } from "../src/cli/welcome.js";

describe("repl", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  });

  it("parseReplInput treats slash-prefixed lines as commands and everything else as chat", () => {
    expect(parseReplInput("")).toEqual({ kind: "empty" });
    expect(parseReplInput("  ")).toEqual({ kind: "empty" });
    expect(parseReplInput("/agents tree")).toEqual({
      kind: "command",
      name: "agents",
      args: ["tree"],
    });
    expect(parseReplInput("/status")).toEqual({
      kind: "command",
      name: "status",
      args: [],
    });
    expect(parseReplInput("/clear")).toEqual({
      kind: "command",
      name: "clear",
      args: [],
    });
    expect(parseReplInput("agents list")).toEqual({
      kind: "message",
      text: "agents list",
    });
    expect(parseReplInput("kampaku agents tree")).toEqual({
      kind: "message",
      text: "kampaku agents tree",
    });
    expect(parseReplInput("/repo worker")).toEqual({
      kind: "command",
      name: "repo",
      args: ["worker"],
    });
    expect(parseReplInput("fix health endpoint")).toEqual({
      kind: "message",
      text: "fix health endpoint",
    });
  });

  it("isReplAvailable is false without a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    expect(isReplAvailable()).toBe(false);
  });

  it("isReplAvailable is true with a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    expect(isReplAvailable()).toBe(true);
  });
});

describe("welcome", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("collectWelcomeStatus reports database and project when bootstrapped", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-welcome-test-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      plannerMode: "stub",
      coreUrl: "http://127.0.0.1:59999",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    bootstrapProject(store, config);

    const status = await collectWelcomeStatus(config);

    expect(status.database.ok).toBe(true);
    expect(status.project?.name).toBe("Kampaku");
    expect(status.planner).toBe("stub");
    expect(status.executor).toBe("freellmapi");
    expect(status.core.status).toBe("stopped");
  });

  it("printWelcome includes logo, status sections, and quick start commands", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-welcome-test-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      plannerMode: "stub",
      coreUrl: "http://127.0.0.1:59999",
    });

    vi.spyOn(await import("../src/cli/context.js"), "createAppContext").mockReturnValue({
      config,
    });

    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });

    await printWelcome();

    const output = lines.join("\n");
    expect(output).toContain("Autonomous agent control plane");
    expect(output).toContain("Kampaku v0.1.0");
    expect(output).toContain("◆ Status");
    expect(output).toContain("◆ Quick start");
    expect(output).toContain("Type a message");
    expect(output).toContain("/agents tree");
    expect(output).toContain("/clear");
    expect(output).toContain("kampaku dev");
    expect(output).toContain("kampaku run");
    expect(output).toContain("kampaku bootstrap");
    expect(output).toContain("Run `kampaku --help` for all commands.");
  });
});
