import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import {
  bootstrapFilesystemSettings,
  getFilesystemSettings,
  saveFilesystemSettings,
} from "../../src/application/settings/filesystem.js";
import { createProject, workOrderReachability } from "../../src/application/projects.js";
import { planAndDelegate } from "../../src/delegator/plan-and-delegate.js";

/**
 * **A checkout the executor cannot write is refused when the work order is opened, not after a plan is approved.**
 *
 * Measured 2026-11-05 on suite 19's fourth run (`s19r4`, BOARD F-137): pointed at
 * `/home/pdonoso/projects/eval-legacy-ledger` — a brownfield checkout outside the factory's granted folders — the
 * front office read the repository, named every convention it found, applied a four-leaf repair plan, and only then
 * reported the wall in its own words: *"The checkout is outside the factory's granted folders … Writes outside a
 * granted folder are refused on the resolved path."* The plan was durable and unexecutable, and the turn that
 * discovered it was already spent.
 *
 * The row's own fix is either widening the grant at intake or **refusing a path the grants do not cover and naming
 * the grant command**. This is the second: the grant boundary is the operator's and a suite run must not move it,
 * so what changes is *when* the refusal arrives and whether it names the fix.
 */
describe("a linked checkout outside the grants (suite 19 / s19r4, BOARD F-137)", () => {
  let dataDir: string | undefined;
  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-reachability-"));
    const granted = join(dataDir, "granted");
    const outside = join(dataDir, "outside");
    mkdirSync(granted, { recursive: true });
    mkdirSync(outside, { recursive: true });
    const config = loadConfig({ dataDir, dbPath: join(dataDir, "kampaku.db") });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    // The boundary a bootstrapped instance carries: one granted folder, and it is not the checkout's parent.
    bootstrapFilesystemSettings(store, join(dataDir, "workspace"), granted);
    return { store, pmStore, agentStore, config, granted, outside, dataDir };
  }

  it("is reported unreachable, and the sentence names the grant command", () => {
    const f = fixture();
    createProject(f.store, {
      slug: "legacy",
      name: "Legacy",
      status: "active",
      repositories: [{ url: `file://${f.outside}`, role: "core" }],
    } as never);

    const reach = workOrderReachability(f.store, "legacy");
    expect(reach.reachable).toBe(false);
    expect(reach.checkout).toBe(f.outside);
    expect(reach.reason).toContain("kampaku settings folders add");
    expect(reach.reason, "the sentence names the path the grant has to cover").toContain(f.outside);
    expect(reach.reason, "and the folders that are granted, so the operator can compare").toContain(f.granted);
  });

  it("is reachable when a grant covers it", () => {
    const f = fixture();
    const checkout = join(f.granted, "legacy-ledger");
    mkdirSync(checkout, { recursive: true });
    createProject(f.store, {
      slug: "legacy",
      name: "Legacy",
      status: "active",
      repositories: [{ url: `file://${checkout}`, role: "core" }],
    } as never);
    expect(workOrderReachability(f.store, "legacy")).toEqual({ reachable: true, checkout });
  });

  it("checks nothing when the instance has no grants at all", () => {
    // An instance that never bootstrapped a boundary has no boundary to measure; inventing one here would refuse
    // work on the strength of a setting nobody wrote.
    const f = fixture();
    saveFilesystemSettings(f.store, { folders: [] });
    expect(getFilesystemSettings(f.store).folders).toHaveLength(0);
    createProject(f.store, {
      slug: "legacy",
      name: "Legacy",
      status: "active",
      repositories: [{ url: `file://${f.outside}`, role: "core" }],
    } as never);
    expect(workOrderReachability(f.store, "legacy")).toEqual({ reachable: true, checkout: f.outside });
  });

  it("refuses the plan, before any plan is produced, with that sentence", async () => {
    const f = fixture();
    createProject(f.store, {
      slug: "legacy",
      name: "Legacy",
      status: "active",
      repositories: [{ url: `file://${f.outside}`, role: "core" }],
    } as never);
    const ctx = {
      store: f.store,
      pmStore: f.pmStore,
      agentStore: f.agentStore,
      config: { ...f.config, plannerMode: "stub" as const },
    };
    await expect(
      planAndDelegate(ctx as never, { intent: "Bring the legacy ledger to a working state.", projectSlug: "legacy" } as never),
      "the refusal arrives here — not after an approved plan and a spent turn",
    ).rejects.toThrow(/outside the folders this instance may write/);
  });

  it("plans as before when the checkout is inside a grant", async () => {
    const f = fixture();
    const checkout = join(f.granted, "legacy-ledger");
    mkdirSync(checkout, { recursive: true });
    createProject(f.store, {
      slug: "legacy",
      name: "Legacy",
      status: "active",
      repositories: [{ url: `file://${checkout}`, role: "core" }],
    } as never);
    const ctx = {
      store: f.store,
      pmStore: f.pmStore,
      agentStore: f.agentStore,
      config: { ...f.config, plannerMode: "stub" as const },
    };
    const result = await planAndDelegate(ctx as never, {
      intent: "Bring the legacy ledger to a working state.",
      projectSlug: "legacy",
    } as never);
    expect(result, "the control: a reachable checkout plans exactly as it did").toBeTruthy();
  });
});
