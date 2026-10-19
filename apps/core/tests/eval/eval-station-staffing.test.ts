import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/api/app.js";
import { provisionSubAgent } from "../../src/application/agents.js";
import {
  assessStaffingRoster,
  staffingSeats,
} from "../../src/delegator/roster-reconciliation.js";
import { executeCreateSubAgent } from "../../src/agents/runtime/tools/create-sub-agent.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { KAMPAKU_BUILTIN_DEFINITION, KAMPAKU_BUILTIN_ID } from "../../src/agents/definitions.js";
import { KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore, seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";
import { PostActionReviewStore } from "../../src/persistence/post-action-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { Store } from "../../src/persistence/store.js";
import { existsSync } from "node:fs";

/**
 * Suite 03's own lock: **a station exists because the project has that aspect, and a seat can work.**
 *
 * The suite's oracle is mostly about what a *turn* proposes, which a unit test cannot decide. What it can
 * lock is every part of the promise that is mechanical, and two of those parts were broken when this file
 * was written — both found by running the suite rather than by reading it:
 *
 * | Row | Measured | Locked by |
 * |---|---|---|
 * | F-039 | a seat created through `POST /api/v1/agents` had **zero skills** and no skill appendix, while the same seat through chat had fifteen and the appendix | "provisions a seat the same way through either entry point" |
 * | F-040 | a refusal classified from **chat** was never recorded, because the chat tool context omitted the refusal store | "records a refusal made from chat" |
 * | F-006 | a staffing request reported the team it **proposed**: `create_sub_agent` returned a receipt (`{id, slug, name}`), and on `s03r3` six proposed skills were mapped by hand onto real ones with nothing but a sentence in the reply saying so | "F-006 — the roster is the tree, and every difference is named" |
 *
 * The suite's P-gate is on the shared rule: two surfaces must not produce different capabilities from the
 * same operation. Both rows are that rule, and both are now locked at the point where the drift happened.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

describe("eval 03 — stations and staffing", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    vi.clearAllMocks();
  });

  function repoRoot(): string | undefined {
    let dir = process.cwd();
    for (let depth = 0; depth < 6; depth += 1) {
      if (existsSync(join(dir, "packages/contracts/skills"))) return dir;
      const parent = join(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  }

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-stations-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "llm",
      plannerMode: "llm",
    });
    mkdirSync(config.workspaceRoot, { recursive: true });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const journalStore = new JournalStore(db, pmStore);
    const wikiStore = new WikiStore(db);
    const postActionStore = new PostActionReviewStore(db, pmStore);
    const refusalStore = new RefusalStore(db);
    // The real catalog, because the whole point is what a new seat actually inherits.
    const root = repoRoot();
    if (root) seedSkillsFromCatalog(skillStore, root);
    bootstrapProject(store, config);

    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      memoryStore,
      blockageStore,
      journalStore,
      wikiStore,
      db,
      postActionStore,
      refusalStore,
    );

    return {
      app,
      store,
      agentStore,
      pmStore,
      skillStore,
      refusalStore,
      config,
      postMessage: (message: string) =>
        app.request("/api/v1/agents/kampaku/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        }),
    };
  }

  /**
   * F-039. The same seat, created two ways, must be equally able to work.
   *
   * This is the suite's P-gate in one assertion: the operation is the same and the surfaces are not,
   * which is exactly how a seat created through the API ended up with nothing to work with.
   */
  describe("a seat is provisioned the same way through either entry point", () => {
    it("gives a seat the default skills and the skill appendix", () => {
      const { agentStore, skillStore } = setup();

      const seat = provisionSubAgent(agentStore, skillStore, {
        slug: "aspect-owner",
        name: "Aspect Owner",
        responsibilities: "Own the aspect",
        systemPrompt: "You own the aspect.",
      });

      const skills = skillStore.listAgentSkills(seat.id);
      expect(skills.length).toBeGreaterThan(0);
      // And the appendix, because a skill held but not written into the prompt is a capability on paper.
      const stored = agentStore.getAgentBySlugOrId("aspect-owner")!;
      expect(stored.systemPrompt.length).toBeGreaterThan("You own the aspect.".length + 50);
    });

    it("gives an explicitly requested skill as well as the defaults", () => {
      const { agentStore, skillStore } = setup();
      const seat = provisionSubAgent(agentStore, skillStore, {
        slug: "qa-owner",
        name: "QA Owner",
        responsibilities: "Own verification",
        systemPrompt: "You verify.",
        skillSlugs: ["qa-testing"],
      });

      expect(skillStore.listAgentSkills(seat.id)).toContain("qa-testing");
    });

    it("matches the REST route's seat to the shared function's seat", async () => {
      const { app, agentStore, skillStore } = setup();
      const lead = provisionSubAgent(agentStore, skillStore, {
        slug: "parity-lead",
        name: "Parity Lead",
        responsibilities: "Lead",
        systemPrompt: "You lead.",
      });

      const response = await app.request("/api/v1/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "rest-seat",
          name: "Rest Seat",
          responsibilities: "Own something",
          parent_slug: lead.slug,
        }),
      });
      expect(response.status).toBe(201);

      const viaRoute = skillStore.listAgentSkills(
        agentStore.getAgentBySlugOrId("rest-seat")!.id,
      );
      const viaFunction = skillStore.listAgentSkills(lead.id);

      // The comparison is the point: not a magic number, but that one entry point does not produce a
      // less capable seat than another.
      expect(viaRoute.length).toBeGreaterThan(0);
      expect(viaRoute.sort()).toEqual(viaFunction.sort());
    });

    it("nests the seat under the parent it was given", async () => {
      const { app, agentStore, skillStore } = setup();
      const lead = provisionSubAgent(agentStore, skillStore, {
        slug: "nest-lead",
        name: "Nest Lead",
        responsibilities: "Lead",
        systemPrompt: "You lead.",
      });

      await app.request("/api/v1/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "nest-child", name: "Child", parent_slug: lead.slug }),
      });

      const child = agentStore.getAgentBySlugOrId("nest-child")!;
      // The suite's "specialists are nested under the lead" bullet, checked on the stored parent id rather
      // than on the prose of a reply.
      expect(child.parentId).toBe(lead.id);
    });
  });

  /** Staffing opens seats. It does not start work, which is the suite's third suite-specific bullet. */
  it("starts no work when the desk staffs", async () => {
    const { app, pmStore, store } = setup();

    await app.request("/api/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "staffing-seat", name: "Staffing Seat" }),
    });

    expect(pmStore.listAllWorkItems()).toHaveLength(0);
    expect(store.listGoals()).toHaveLength(0);
  });

  /**
   * F-040, and it is a surface-parity lock rather than a refusal lock.
   *
   * `eval-refusal-durability.test.ts` proves the recording works when the tool context has the store. This
   * proves the **chat** route supplies it — the one surface the operator actually uses for a refusal, and
   * the one that was silently missing it, so a refusal read as classified and was never recorded.
   */
  describe("records a refusal made from chat", () => {
    it("writes the refusal the chat turn classified", async () => {
      const { postMessage, refusalStore } = setup();
      mockBroker.chatWithTools
        .mockResolvedValueOnce({
          model: "test-model",
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call-triage",
                    type: "function",
                    function: {
                      name: "triage_intent",
                      arguments: JSON.stringify({
                        intent: "Write me marketing copy for the launch.",
                        category: "out_of_scope",
                        boundary: "creative_writing",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          model: "test-model",
          choices: [
            {
              message: {
                content: "That is creative writing, so it is out of scope.",
                tool_calls: undefined,
              },
            },
          ],
        });

      await postMessage("Write me marketing copy for the launch.");

      const recorded = refusalStore.list();
      expect(recorded).toHaveLength(1);
      expect(recorded[0]!.boundary).toBe("creative_writing");
      // `agent` is the surface name the dispatch uses; the point is that a surface was recorded at all.
      expect(recorded[0]!.surface).toBe("agent");
    });
  });

  /**
   * The suite's F1 gate, at the level a prompt can be held to: the desk must ask rather than default when
   * a project's aspects are not obvious, and it must not treat one shape as every project's shape.
   *
   * The live run is what demonstrates the behaviour — a Terraform module was staffed with `-terraform` and
   * `-modules` while a Next.js app got `-frontend` and `-backend`. What this locks is that the prompt it
   * follows says so, because the behaviour is the model's and the instruction is ours.
   */
  describe("the roster follows the project, not a template", () => {
    it("requires the roles to follow the aspects the project actually has", () => {
      const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

      expect(prompt).toMatch(/follow the aspects the project actually has/i);
      expect(prompt).toMatch(/do not staff a fixed roster/i);
      expect(prompt).toMatch(/ask which aspects to cover/i);
    });

    it("keeps the marketing-copy refusal reachable as a tool", () => {
      // The suite's negative prompt expects a refusal or a boundary statement. `triage_intent` is how the
      // refusal becomes durable, so the front office has to hold it.
      expect(KAMPAKU_BUILTIN_DEFINITION.tools).toContain("triage_intent");
      expect(KAMPAKU_TOOLS.some((tool) => tool.function.name === "triage_intent")).toBe(true);
    });

    it("holds no tool that could start work, so staffing cannot begin execution", () => {
      // The suite: "No execution jobs start from a staffing request." The strongest form of that is that
      // the desk has no tool which starts one.
      const held = new Set(KAMPAKU_BUILTIN_DEFINITION.tools);
      for (const jobStarter of [
        "execute_work_item",
        "retry_work_item",
        "play_project",
        "step_project",
      ]) {
        expect(held.has(jobStarter), `the front office holds ${jobStarter}`).toBe(false);
      }
      // And the floor: the desk keeps the tool that opens a container and the one that creates a seat.
      expect(held.has("create_project")).toBe(true);
      expect(held.has("create_sub_agent")).toBe(true);
      expect(KAMPAKU_BUILTIN_ID).toBeTruthy();
    });
  });

  /**
   * **BOARD F-006 — a roster that says six and creates five, and a capability that was substituted.**
   *
   * The measured defect was not that stations were missing. On `s03r3` five stations were proposed and
   * five were created, and the tree agreed with both returns — what did not agree was the *skill* list:
   *
   * > The lead's proposal named skill slugs that do not exist in this factory's catalog
   * > (`nextjs-app-router`, `react-components`, …). I did not create agents with dangling skills — I
   * > mapped each station to skills that exist.
   *
   * The substitution was real and defensible. The defect is that the only record of it was that sentence:
   * `create_sub_agent` answered `{id, slug, name}`, so nothing in the turn's own results could tell it
   * what the seat it had just made actually held. The row's original shape — a proposal of six with a
   * dedicated owner for the hard subsystem, five created, and a role absorbed into another — is the same
   * silence over a station instead of a skill.
   *
   * So the lock asserts both halves, at the point where the silence was: after the create call, the roster
   * comes from the stores, and every difference from the proposal is named. Verified **red without the
   * fix**: the pre-fix `provisionSubAgent` threw `Skill "nextjs-app-router" not found.` *after* writing the
   * agent row, so the station existed and the caller was told the call failed — and no result carried a
   * roster at all.
   */
  describe("F-006 — the roster is the tree, and every difference is named", () => {
    function lead(slug = "s3-infra-lead") {
      const { agentStore, skillStore } = setup();
      const seat = provisionSubAgent(agentStore, skillStore, {
        slug,
        name: "S3 Infra Lead",
        responsibilities: "Own the work order",
        systemPrompt: "You lead.",
      });
      return { agentStore, skillStore, lead: seat };
    }

    it("names a station that was not created, with the store's reason, and reports the seats that exist", () => {
      const { agentStore, skillStore, lead: linked } = lead();

      const storage = executeCreateSubAgent(agentStore, skillStore, {
        slug: "s3-infra-storage",
        name: "Storage",
        responsibilities: "Own object storage",
        system_prompt: "You own storage.",
        parent_slug: linked.slug,
        skill_slugs: ["security-review"],
      });
      expect(storage.created).toBe(true);

      // A reserved slug: the store refuses it, and the refusal has to reach the reply as a refusal of a
      // *station*, not as a failed call with the team left undescribed.
      const refused = executeCreateSubAgent(agentStore, skillStore, {
        slug: "kampaku",
        name: "A Second Front Office",
        responsibilities: "Nothing",
        system_prompt: "Nothing.",
        parent_slug: linked.slug,
      });

      expect(refused.created).toBe(false);
      expect(refused.seat).toBeUndefined();
      expect(refused.error).toMatch(/reserved/i);
      const finding = refused.roster.findings.find((entry) => entry.station === "kampaku");
      expect(finding?.kind).toBe("seat_not_created");
      expect(finding?.detail).toMatch(/reserved/i);

      // **And the tree agrees with what it reported.** The roster is not a copy of the proposal: it is the
      // lead plus the one station that exists, each with the skills the store holds for it.
      const seats = staffingSeats(agentStore, skillStore, linked.slug);
      expect(refused.roster.seats).toEqual(seats);
      expect(refused.roster.seats.map((seat) => seat.slug)).toEqual(["s3-infra-lead", "s3-infra-storage"]);
      expect(refused.roster.seats.find((seat) => seat.slug === "s3-infra-lead")?.parentSlug).toBe("kampaku");
      expect(refused.roster.summary).toMatch(/Roster check/);
      expect(refused.roster.summary).toMatch(/s3-infra-storage/);
      expect(refused.roster.summary).not.toMatch(/A Second Front Office/);
    });

    it("names a skill that was not granted, and says what the seat holds instead", () => {
      const { agentStore, skillStore, lead: linked } = lead("s3-webapp-lead");

      const created = executeCreateSubAgent(agentStore, skillStore, {
        slug: "s3-webapp-ui",
        name: "UI",
        responsibilities: "Own the renderer",
        system_prompt: "You own the renderer.",
        parent_slug: linked.slug,
        // The measured shape: one slug that exists, one the catalog has never held.
        skill_slugs: ["nextjs-app-router", "qa-testing"],
      });

      // The station exists — a substitution is not a refusal to staff (F-022 is the row that authors the
      // missing skill), and the seat is not created with a dangling grant either.
      expect(created.created).toBe(true);
      expect(created.seat?.slug).toBe("s3-webapp-ui");
      expect(created.seat?.skills).toContain("qa-testing");
      expect(created.seat?.skills).not.toContain("nextjs-app-router");

      const findings = created.roster.findings.filter((entry) => entry.kind === "skill_not_granted");
      expect(findings).toHaveLength(1);
      expect(findings[0]!.station).toBe("s3-webapp-ui");
      expect(findings[0]!.detail).toMatch(/nextjs-app-router/);
      // Both halves of the finding: what was asked for and what the seat actually holds.
      expect(findings[0]!.detail).toMatch(/qa-testing/);
      expect(findings[0]!.detail).toMatch(/catalog does not hold/);

      // The seat the result reports and the seat the store holds are the same seat, skill for skill.
      const stored = skillStore.listAgentSkills(agentStore.getAgentBySlugOrId("s3-webapp-ui")!.id).sort();
      expect(created.seat?.skills).toEqual(stored);
      expect(created.roster.seats.find((seat) => seat.slug === "s3-webapp-ui")?.skills).toEqual(stored);
    });

    it("states a partial staffing as partial: one of five refused, four created, and the difference named", () => {
      const { agentStore, skillStore, lead: linked } = lead();
      const proposal = [
        { slug: "s3-infra-storage" },
        { slug: "s3-infra-network" },
        { slug: "s3-infra-verification" },
        { slug: "s3-infra-audit" },
        // The station that cannot exist: a name the store reserves.
        { slug: "kampaku" },
      ];
      // The reasons come from the create calls themselves — a refusal the store wrote, carried into the
      // reconciliation rather than paraphrased by the turn that read it.
      const refused: Record<string, string> = {};
      for (const station of proposal) {
        const result = executeCreateSubAgent(agentStore, skillStore, {
          slug: station.slug,
          name: station.slug,
          responsibilities: `Own ${station.slug}`,
          system_prompt: `You own ${station.slug}.`,
          parent_slug: linked.slug,
          skill_slugs: ["qa-testing"],
        });
        if (!result.created && result.error) refused[station.slug] = result.error;
      }
      expect(Object.keys(refused)).toEqual(["kampaku"]);

      const assessment = assessStaffingRoster(agentStore, skillStore, {
        leadSlug: linked.slug,
        proposal: proposal.map((station) => ({ slug: station.slug, skillSlugs: ["qa-testing"] })),
        refused,
      });

      // Four stations and the lead exist; the fifth does not, and it is named as the difference rather
      // than dropped from a reply that then presents four as the proposal.
      expect(assessment.seats.map((seat) => seat.slug)).toEqual([
        "s3-infra-lead",
        "s3-infra-storage",
        "s3-infra-network",
        "s3-infra-verification",
        "s3-infra-audit",
      ]);
      expect(assessment.findings).toHaveLength(1);
      expect(assessment.findings[0]!.kind).toBe("seat_not_created");
      expect(assessment.summary).toMatch(/reserved/i);
      expect(assessment.summary).toMatch(/and nothing else was created/);

      // And a clean staffing of the same four stations reports no findings at all — the check is not a
      // paragraph every reply has to carry.
      const clean = assessStaffingRoster(agentStore, skillStore, {
        leadSlug: linked.slug,
        proposal: proposal.slice(0, 4).map((station) => ({ slug: station.slug, skillSlugs: ["qa-testing"] })),
      });
      expect(clean.findings).toEqual([]);
      expect(clean.summary).toBeUndefined();
    });
  });
});
