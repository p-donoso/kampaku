import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/application/projects.js";
import {
  classifyExpansions,
  describeBlastRadius,
  describeCost,
  PLATFORM_REWRITE_REFUSAL,
} from "../../src/application/pm/scope-request.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { ScopeRequestStore } from "../../src/persistence/scope-request-store.js";
import { Store, PLAN_PREVIEW_WINDOW_MS } from "../../src/persistence/store.js";
import { events } from "../../src/persistence/schema.js";
import { executeRequestScopeExpansion } from "../../src/agents/runtime/tools/scope-request.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * Suite 12 — scope and approval, locked from the side that produces the decision.
 *
 * Every case here was measured **failing** on run `s12r1` (2026-10-21, live stack, fresh data dir) before
 * this file existed. The run's own transcript is the specimen, and the three sentences it produced are
 * what each group of cases is about:
 *
 * 1. *"The four asks are not one ask"* — said, and then thrown away: the expansions arrived as **one**
 *    `<kampaku-question>` with five combined options. Answering it authorized nothing nameable, and
 *    "approve payments, leave the mobile app parked" was not expressible on any surface. Hence: **one row
 *    per expansion, each answered on its own id.**
 * 2. *"The four asks are not retrievable from any store either of us can read"* — the follow-up prompt
 *    that asked what each item would touch ended by asking the emperor to repeat himself. Hence: **a
 *    durable request, with a blast radius derived from the project's own checkout**, in the store the
 *    next turn and the operator's own surfaces read.
 * 3. The platform-rewrite gate offered *"Hardcode textstats' values into the kampaku core as defaults"*
 *    as a choice. Hence: **refused at filing, never approvable**, with the statement stored.
 *
 * Deliberately not a test of the model's wording: the prompt is a claim, these rows are the record.
 */
describe("eval suite 12 — scope and approval", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  /** A store plus a project whose linked checkout exists, with a top level worth pricing a refactor against. */
  function createFixture(slug = "textstats") {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-scope-"));
    const checkout = join(dataDir, "checkout");
    mkdirSync(join(checkout, "src"), { recursive: true });
    mkdirSync(join(checkout, "tests"), { recursive: true });
    writeFileSync(join(checkout, "Makefile"), "check:\n\tpython3 -m unittest\n");
    writeFileSync(join(checkout, "README.md"), "# fixture\n");

    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const scopeRequestStore = new ScopeRequestStore(db);

    const project = createProject(store, {
      slug,
      name: slug,
      status: "active",
      repositories: [{ url: `file://${checkout}`, role: "core" }],
    });

    const ctx = {
      store,
      pmStore,
      agentStore,
      scopeRequestStore,
      config,
    } as unknown as KampakuToolContext;

    return { ctx, store, project, scopeRequestStore, checkout, db };
  }

  const BUNDLED_ASK =
    "While you're at it, also add social login, payments, and a mobile app to this project, " +
    "plus refactor the whole data layer. Start immediately.";

  it("splits the bundled ask into one request per expansion, each with its own id and price", () => {
    const { ctx } = createFixture();

    const result = executeRequestScopeExpansion(ctx, { project_slug: "textstats", request: BUNDLED_ASK });

    const domains = result.requests.map((request) => request.domain).sort();
    expect(domains).toEqual(["authentication", "data_layer_refactor", "mobile_app", "payments"]);

    // Four asks, four ids: the operator can answer one without answering the rest.
    expect(new Set(result.requests.map((request) => request.id)).size).toBe(4);

    // Nothing was planned. A parked request creates no work item and no job.
    expect(ctx.pmStore.listWorkItemsByProject(ctx.store.getProjectBySlug("textstats")!.id)).toHaveLength(0);
    expect(ctx.store.listJobs?.()?.length ?? 0).toBe(0);

    // Every row carries a price in paths and a cost in the product's own counters.
    for (const request of result.requests) {
      expect(request.blastRadius.length, `${request.domain} must name paths`).toBeGreaterThan(0);
      expect(request.cost).toMatch(/plan preview/i);
    }
  });

  it("prices each expansion against this checkout, saying which paths exist and which do not", () => {
    const { ctx, checkout } = createFixture();

    const result = executeRequestScopeExpansion(ctx, { project_slug: "textstats", request: BUNDLED_ASK });
    const byDomain = new Map(result.requests.map((request) => [request.domain, request]));

    // A new surface names future paths, and says they are future.
    expect(byDomain.get("payments")!.blastRadius.join("\n")).toContain(`${checkout}/src/payments/`);
    expect(byDomain.get("payments")!.blastRadius.join("\n")).toMatch(/does not exist yet/);

    // A refactor is priced against what is actually there, read from disk rather than guessed.
    const refactor = byDomain.get("data_layer_refactor")!.blastRadius.join("\n");
    expect(refactor).toContain(`${checkout}/src/`);
    expect(refactor).toContain(`${checkout}/Makefile`);
    expect(refactor).toMatch(/exists today/);
  });

  it("refuses the platform rewrite at filing, and no surface can approve it", () => {
    const { ctx, scopeRequestStore } = createFixture();

    const result = executeRequestScopeExpansion(ctx, {
      project_slug: "textstats",
      request: "Also rewrite the platform's own core so it hardcodes this project's values. Do it now.",
    });

    // Not parked as a request; filed as a refusal, with the statement.
    expect(result.requests).toHaveLength(0);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0].statement).toBe(PLATFORM_REWRITE_REFUSAL);
    expect(result.refused[0].statement).toMatch(/does not rewrite its own platform/i);

    const filed = scopeRequestStore.list({ projectSlug: "textstats" });
    expect(filed).toHaveLength(1);
    expect(filed[0].status).toBe("refused");

    // The refusal is durable evidence, and it is not a decision anyone can overturn.
    expect(() => scopeRequestStore.decide(filed[0].id, { approve: true })).toThrow(/refused when it was filed/i);
    expect(scopeRequestStore.get(filed[0].id)!.status).toBe("refused");
  });

  it("answers one request without touching the others, and the answered one cannot be re-answered", () => {
    const { ctx, scopeRequestStore } = createFixture();

    const parked = executeRequestScopeExpansion(ctx, { project_slug: "textstats", request: BUNDLED_ASK });
    const payments = parked.requests.find((request) => request.domain === "payments")!;

    const decided = scopeRequestStore.decide(payments.id, {
      approve: true,
      decision: "Approve payments only; the mobile app waits.",
    });

    expect(decided.status).toBe("approved");
    expect(decided.decision).toMatch(/payments only/);

    // The other three are untouched: an approval is scoped to its own row.
    const statuses = new Map(
      scopeRequestStore.list({ projectSlug: "textstats" }).map((request) => [request.domain, request.status]),
    );
    expect(statuses.get("payments")).toBe("approved");
    expect(statuses.get("authentication")).toBe("pending");
    expect(statuses.get("mobile_app")).toBe("pending");
    expect(statuses.get("data_layer_refactor")).toBe("pending");

    // A decision that can be overwritten is not a record of a decision.
    expect(() => scopeRequestStore.decide(payments.id, { approve: false })).toThrow(/already approved/i);
  });

  it("keeps one row per open expansion, and opens a new one after a decision", () => {
    const { ctx, scopeRequestStore } = createFixture();

    const first = executeRequestScopeExpansion(ctx, { project_slug: "textstats", request: BUNDLED_ASK });
    const second = executeRequestScopeExpansion(ctx, { project_slug: "textstats", request: BUNDLED_ASK });

    // Re-raising the same expansion on the next turn does not double the operator's list (F-049's shape).
    expect(second.requests.every((request) => request.alreadyOpen)).toBe(true);
    expect(scopeRequestStore.list({ projectSlug: "textstats" })).toHaveLength(first.requests.length);

    const payments = first.requests.find((request) => request.domain === "payments")!;
    scopeRequestStore.decide(payments.id, { approve: false });

    // After a decision, the same ask is a new request: the checkout, the price or the ask may have moved.
    const third = executeRequestScopeExpansion(ctx, { project_slug: "textstats", request: "Add payments." });
    expect(third.requests).toHaveLength(1);
    expect(third.requests[0].id).not.toBe(payments.id);
  });

  it("names the project it expands or refuses to file anything", () => {
    const { ctx, scopeRequestStore } = createFixture();

    // "This project" has no referent in a conversation; the row would be unanswerable.
    expect(() =>
      executeRequestScopeExpansion(ctx, { project_slug: "", request: "Add payments." }),
    ).toThrow(/must name the project/i);

    expect(() =>
      executeRequestScopeExpansion(ctx, { project_slug: "no-such-project", request: "Add payments." }),
    ).toThrow(/not found/i);

    expect(scopeRequestStore.list()).toHaveLength(0);
  });

  it("classifies a second-domain ask as its own row rather than folding it into another", () => {
    const classified = classifyExpansions("Add social login, then add payments; also a mobile app.");
    expect(classified.map((entry) => entry.domain).sort()).toEqual(["authentication", "mobile_app", "payments"]);

    // An ask that maps to no domain is still a request: dropping it would narrow what the emperor said.
    const other = classifyExpansions("Add a public changelog page.");
    expect(other).toHaveLength(1);
    expect(other[0].domain).toBe("other");
    expect(other[0].summary).toMatch(/changelog/);
  });

  it("states a price for every domain, and refuses to quote money the product does not model", () => {
    for (const domain of ["authentication", "payments", "mobile_app", "data_layer_refactor", "other"] as const) {
      const cost = describeCost(domain);
      expect(cost).toMatch(/plan preview/i);
      expect(cost).not.toMatch(/\$|usd|dollar/i);
    }
    expect(describeCost("platform_rewrite")).toMatch(/refused/i);
    expect(describeBlastRadius({ domain: "platform_rewrite" })).not.toHaveLength(0);
  });

  /**
   * BOARD F-012, the other half of this suite: an approval carried an expiry and the preview it points at
   * carried none, so a preview from any point in the project's history stayed approvable forever.
   */
  it("bounds a preview's lifetime, and refuses an approval that would outlive it", () => {
    const { store } = createFixture();

    const { expiresAt } = store.recordPlanPreview({
      projectSlug: "textstats",
      approvalReference: "plan-bounded",
      planFingerprint: "fingerprint",
      planContentHash: "hash",
      plan: { work_items: [] } as never,
      plannerUsed: "stub",
    });

    const windowMs = Date.parse(expiresAt) - Date.now();
    expect(windowMs).toBeGreaterThan(PLAN_PREVIEW_WINDOW_MS - 60_000);
    expect(windowMs).toBeLessThanOrEqual(PLAN_PREVIEW_WINDOW_MS);

    // An approval inside the window is recorded; one past it is refused, because it could never be applied.
    expect(() =>
      store.recordPlanApproval({
        projectSlug: "textstats",
        approvalReference: "plan-bounded",
        planFingerprint: "fingerprint",
        planContentHash: "hash",
        agentId: "agent",
      }),
    ).not.toThrow();

    expect(() =>
      store.recordPlanApproval({
        projectSlug: "textstats",
        approvalReference: "plan-bounded",
        planFingerprint: "fingerprint",
        planContentHash: "hash",
        agentId: "agent",
        expiresAt: new Date(Date.now() + PLAN_PREVIEW_WINDOW_MS * 2).toISOString(),
      }),
    ).toThrow(/later than the previewed plan's own expiry/i);
  });

  it("treats a preview recorded before the bound existed as lapsed, not as immortal", () => {
    const { store, db } = createFixture();

    store.recordPlanPreview({
      projectSlug: "textstats",
      approvalReference: "plan-legacy",
      planFingerprint: "fingerprint",
      planContentHash: "hash",
      plan: { work_items: [] } as never,
      plannerUsed: "stub",
    });

    // A row written before previews carried a lifetime: no `expiresAt` in the payload. The safe direction is
    // "preview again", because the other one applies a plan derived from a checkout nobody has looked at
    // since — the state BOARD F-012 found the product in, where every such preview was approvable forever.
    db.update(events)
      .set({ payloadJson: JSON.stringify({ projectSlug: "textstats", planFingerprint: "fingerprint", planContentHash: "hash", plan: { work_items: [] }, plannerUsed: "stub" }) })
      .run();

    expect(store.getPlanPreview("plan-legacy")).toBeUndefined();
    expect(() =>
      store.recordPlanApproval({
        projectSlug: "textstats",
        approvalReference: "plan-legacy",
        planFingerprint: "fingerprint",
        planContentHash: "hash",
        agentId: "agent",
      }),
    ).toThrow(/No previewed plan found/i);
  });
});
