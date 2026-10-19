import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";
import { executeToolCall, KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import { toolsForAgent } from "../../src/agents/runtime/sub-agent-session.js";
import { readSkillFromCatalog } from "../../src/persistence/skill-catalog.js";
import { SkillStoreError, seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * F-022, suite 03's missed half: **a station whose aspect the catalog does not cover.**
 *
 * The suite's oracle bullet is *"Specialists receive a non-empty skill set **appropriate to their
 * station** — not zero skills because their suffix is not one of a small hardcoded list."* Measured on
 * run `s03r3`, a Terraform module was staffed with `s3-infra-network` (the station that owns
 * `modules/network` and the VPC wiring) holding **13 skills, every one of them a default**
 * (`workflow-*`, `system-chat-format`, `system-plan-quality`) and nothing about networks, Terraform or
 * providers — while `GET /api/v1/skills` held none of the 36 seeds that covered the aspect. The literal
 * non-empty half passed; the appropriate half did not, and the staffing turn was honest about it:
 *
 * > *"The skill catalog holds no Terraform or AWS skill. The grants are the real closest capabilities."*
 *
 * The defect underneath is a mechanism, not a missing entry (BOARD F-022): the runtime could list,
 * assign and unassign a skill but not **author** one, and nothing in the skill record could say *this
 * capability belongs to that project*. So an aspect with no seed skill could only ever be staffed with
 * defaults, which is how a catalog silently becomes a taxonomy.
 *
 * Three things are locked here, and the third is the one that keeps the first two honest:
 *
 * 1. **Authoring is a runtime operation with an owner.** A project's linked lead authoring a skill for
 *    its own project is the same authority that lets it create that project's seats (ADR-0006), the
 *    declared tools are admitted against the runtime registry, and a seat that leads nothing holds no
 *    such tool at all. Nothing here reaches for the platform's own repository: the skill is a row, not
 *    a `SKILL.md` written into `packages/contracts/skills`.
 * 2. **Scope is a property of the catalog, not a convention.** The record carries its project, the
 *    catalog surfaces it, the seat's roster reports it, and another project cannot be given it — by
 *    refusal at assignment, not by filter on read.
 * 3. **The degraded path is stated.** A seat staffed with no skill beyond the defaults gets a result
 *    that says so and names what it would take, because "shipped with defaults" is the exact failure
 *    this row was measured on and a silent one is indistinguishable from coverage.
 */

const repoRoot = (): string | undefined => {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, "packages/contracts/skills"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
};

/**
 * Tool names a prompt fragment connects to an action its reader takes.
 *
 * The same anchor `orchestrator-skill-scope.test.ts` uses, and for the same reason it was widened
 * there: a fragment that says *"open the module **via** `read_repository`"* is naming a tool, and a
 * lock that only reads `Use`/`Call` reports an empty inventory while the prompt instructs a tool the
 * reader may not hold.
 */
function instructedTools(prompt: string): string[] {
  const found = new Set<string>();
  for (const match of prompt.matchAll(
    /\b(?:Use|Call|via|using|through|with|then)\s+([a-z][a-z0-9_]{3,})\b/gi,
  )) {
    found.add(match[1]!.toLowerCase());
  }
  return [...found];
}

const TERRAFORM_SKILL = {
  project_slug: "s3-infra",
  slug: "terraform-module-network",
  name: "Terraform module: network",
  description:
    "Own a nested Terraform network module: its variables, its provider constraint, and the plan the checks prove.",
  capabilities: ["iac.terraform", "network.vpc"],
  tools: ["get_project", "read_repository", "submit_completion_report"],
  prompt_fragment: [
    "You own a nested Terraform module, not an application.",
    "- Use get_project to resolve the checkout you are allowed to read, and read it before you propose a path.",
    "- Use read_repository to open `versions.tf` and the module's own `variables.tf`; the provider constraint and",
    "  the variable contract are the interface you are accountable for.",
    "- `terraform validate` is not a plan and does not descend into `examples/`: say what a check proved and",
    "  never let a green check imply more than it measured.",
    "- Use submit_completion_report with the command you ran and its real output.",
  ].join("\n"),
};

interface RosterRecord {
  slug: string;
  skills?: string[];
  projectSkills?: string[];
  capability?: { covered: boolean; seed: string[]; project: string[]; note: string };
}

describe("eval 03 — a station whose aspect has no seed skill", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  /**
   * Two projects, each with an accountable lead and one station under it, plus the real seed catalog.
   *
   * The real catalog matters: the claim under test is that an authored skill is **not one of the
   * defaults**, so the defaults have to be the real ones (eleven `workflow-*` plus
   * `system-chat-format` and `system-plan-quality` on a seat).
   */
  function setup() {
    context = createTestContext("kampaku-project-skill-");
    const { store, agentStore, skillStore, config } = context;
    const root = repoRoot();
    if (root) seedSkillsFromCatalog(skillStore, root);

    const leadFor = (slug: string) =>
      agentStore.createSubAgent({
        slug,
        name: slug,
        parentId: agentStore.getKampakuAgent().id,
        responsibilities: `Lead ${slug}`,
        systemPrompt: `You lead ${slug}.`,
      });

    const infraLead = leadFor("s3-infra-lead");
    const webLead = leadFor("s3-webapp-lead");
    const now = new Date().toISOString();

    store.createProject({
      id: "project-infra",
      slug: "s3-infra",
      name: "S3 infra module",
      status: "active",
      projectLeadAgentId: infraLead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    store.createProject({
      id: "project-webapp",
      slug: "s3-webapp",
      name: "S3 web app",
      status: "active",
      projectLeadAgentId: webLead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });

    const app = createApp(
      store,
      config,
      agentStore,
      context.pmStore,
      context.conversationStore,
      skillStore,
      context.questionStore,
      context.memoryStore,
      context.blockageStore,
      context.journalStore,
      context.wikiStore,
      context.db,
      context.postActionStore,
      context.refusalStore,
    );

    const kampaku = agentStore.getKampakuAgent();

    /**
     * The tools a seat actually holds, and the grant label the dispatcher refuses with.
     *
     * The front office's grant is its own definition — `session.ts` filters the runtime registry by
     * `KAMPAKU_BUILTIN_DEFINITION.tools` — and a sub-agent's is what its skills grant plus what its
     * authority grants. Both are read from the same places the live paths read them, so a tool asserted
     * here as reachable is reachable there.
     */
    const grantFor = (agentSlugOrId: string) => {
      const agent = agentStore.getAgentBySlugOrId(agentSlugOrId);
      const names =
        agent?.slug === "kampaku"
          ? KAMPAKU_BUILTIN_DEFINITION.tools
          : toolsForAgent(context!.toolContext, agent?.id ?? agentSlugOrId).map(
              (tool) => tool.function.name,
            );
      return { allowed: new Set(names), label: "the tools this seat holds" };
    };

    const callTool = (
      agentSlugOrId: string,
      name: string,
      args: Record<string, unknown>,
      projectId?: string,
    ) =>
      executeToolCall(
        context!.toolContext,
        name,
        JSON.stringify(args),
        { agentId: agentStore.getAgentBySlugOrId(agentSlugOrId)!.id, projectId },
        grantFor(agentSlugOrId),
      );

    /**
     * A station, opened the way the staffing turn opens one: the front office creates the seat under a
     * project's lead, so the seat belongs to that project through its own hierarchy.
     *
     * The seat is then **read back off the public roster** rather than off the create call's own return
     * value, because the roster is the surface a staffing reply is written from and the surface suite 03
     * measured on `s03r3` (`GET /api/v1/agents` answered 13 skills for `s3-infra-network`).
     */
    const seatIn = async (lead: string, slug: string, skillSlugs?: string[]) => {
      const created = (
        await callTool("kampaku", "create_sub_agent", {
          slug,
          name: slug,
          responsibilities: `Own ${slug}`,
          system_prompt: `You own ${slug}.`,
          parent_slug: lead,
          ...(skillSlugs ? { skill_slugs: skillSlugs } : {}),
        })
      ).output as { id?: string };
      // The seat is read back **off the roster**, not off the create call's own return value, because a
      // receipt is the proposal's own account of itself. `id` is used only as the store's key for the
      // seat; what the assertions below read is the record the public surface answers.
      const record = await rosterRecord(slug);
      return { ...record, id: created.id ?? record.slug };
    };

    const rosterRecord = async (slug: string) => {
      const body = (await (await app.request("/api/v1/agents")).json()) as {
        agents: RosterRecord[];
      };
      const record = body.agents.find((agent) => agent.slug === slug);
      expect(record, `${slug} is not on the public roster`).toBeTruthy();
      return record!;
    };

    return { app, kampaku, infraLead, webLead, grantFor, callTool, seatIn };
  }

  /** The catalog entry the runtime can now author, and the row it becomes. */
  it("authors a project-scoped skill through the runtime, as the project's own lead", async () => {
    const { callTool } = setup();

    const result = await callTool("s3-infra-lead", "create_skill", TERRAFORM_SKILL, "project-infra");
    const authored = result.output as { skill: Record<string, unknown> };

    expect(authored.skill).toMatchObject({
      slug: "terraform-module-network",
      project_slug: "s3-infra",
      scope: "project",
    });

    const stored = context!.skillStore.getSkill("terraform-module-network");
    expect(stored?.projectSlug).toBe("s3-infra");
    expect(stored?.projectId).toBe("project-infra");
    // A seed skill is the other half of the distinction the roster has to be able to make.
    expect(context!.skillStore.getSkill("qa-testing")?.projectSlug ?? null).toBeNull();

    // **Not a shell into the platform repository.** Authoring through the runtime is a row in this
    // instance's catalog; it neither dirties the platform checkout nor gets re-seeded into every
    // project on the next boot, which is what would make it global again.
    expect(readSkillFromCatalog(context!.config.workspaceRoot, "terraform-module-network")).toBeUndefined();
  });

  it("holds the catalog on the public surface, with the project it belongs to", async () => {
    const { app, callTool } = setup();
    await callTool("s3-infra-lead", "create_skill", TERRAFORM_SKILL, "project-infra");

    const response = await app.request("/api/v1/skills");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      skills: Array<{ slug: string; projectSlug: string | null }>;
    };

    const authored = body.skills.find((skill) => skill.slug === "terraform-module-network");
    expect(authored?.projectSlug).toBe("s3-infra");
    expect(body.skills.find((skill) => skill.slug === "qa-testing")?.projectSlug ?? null).toBeNull();
  });

  /** The station the aspect needs, holding a capability that is not one of the defaults. */
  it("staffs a Terraform-aspect station with it, and the seat really holds it", async () => {
    const { app, callTool, seatIn } = setup();
    await callTool("s3-infra-lead", "create_skill", TERRAFORM_SKILL, "project-infra");

    const seat = await seatIn("s3-infra-lead", "s3-infra-network", ["terraform-module-network"]);
    expect(seat.projectSkills).toContain("terraform-module-network");
    expect(seat.capability?.project).toEqual(["terraform-module-network"]);
    expect(seat.capability?.covered).toBe(true);

    const defaults = new Set(context!.skillStore.listDefaultSkills().map((s) => s.slug));
    const held = context!.skillStore.listAgentSkills(seat.id);
    // The measurement `s03r3` produced: thirteen skills, every one a default.
    expect(held).toContain("terraform-module-network");
    expect(held.filter((slug) => !defaults.has(slug))).toEqual(["terraform-module-network"]);

    // Visible on the public surface **for that station**, not merely in the catalog.
    expect(seat.skills).toContain("terraform-module-network");

    // And a capability on paper would not be one: the grant reaches the toolset, the tools reach the
    // prompt, and the instruction reaches the session that executes.
    expect(context!.skillStore.getAgentToolNames(seat.id)).toContain("read_repository");
    expect(
      toolsForAgent(context!.toolContext, seat.id).map((tool) => tool.function.name),
    ).toContain("read_repository");
    expect(context!.skillStore.buildSkillPromptAppendix(seat.id)).toContain(
      "`terraform validate` is not a plan",
    );
  });

  /** Scope is enforced where the grant is made, so another project cannot be given the capability. */
  it("is absent from another project's roster, by refusal rather than by filter", async () => {
    const { callTool, seatIn, grantFor } = setup();
    await callTool("s3-infra-lead", "create_skill", TERRAFORM_SKILL, "project-infra");
    const otherSeat = await seatIn("s3-webapp-lead", "s3-webapp-frontend");

    expect(() => context!.skillStore.assignSkill(otherSeat.id, "terraform-module-network")).toThrow(
      /s3-infra/,
    );
    const refused = (() => {
      try {
        context!.skillStore.assignSkill(otherSeat.id, "terraform-module-network");
      } catch (error) {
        return error;
      }
      return undefined;
    })();
    expect(refused).toBeInstanceOf(SkillStoreError);
    expect(context!.skillStore.listAgentSkills(otherSeat.id)).not.toContain(
      "terraform-module-network",
    );

    // A lead may not author into a project it does not lead, and a seat that leads nothing does not
    // hold the authoring tool at all — the refusal is made before the handler runs.
    await expect(
      callTool("s3-webapp-lead", "create_skill", TERRAFORM_SKILL, "project-infra"),
    ).rejects.toThrow(/lead/i);
    expect(grantFor(otherSeat.id).allowed.has("create_skill")).toBe(false);
    await expect(
      callTool(otherSeat.id, "create_skill", TERRAFORM_SKILL, "project-webapp"),
    ).rejects.toThrow(/not executed|not in the tools/i);
  });

  /** The admission rule: the fragment names only tools its reader ends up holding. */
  it("admits the fragment's tool names against the runtime and the reader", async () => {
    const { callTool, seatIn } = setup();
    await callTool("s3-infra-lead", "create_skill", TERRAFORM_SKILL, "project-infra");
    const seat = await seatIn("s3-infra-lead", "s3-infra-network", ["terraform-module-network"]);

    const skill = context!.skillStore.getSkill("terraform-module-network")!;
    const registered = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
    const held = new Set(context!.skillStore.getAgentToolNames(seat.id));

    // Every declared tool exists, so the grant is a real grant and not a name the runtime dropped.
    expect(skill.tools.filter((tool) => !registered.has(tool))).toEqual([]);
    // Every tool the fragment connects to an action is one the reader holds — either granted by this
    // skill or already held through the defaults.
    const instructedAndRegistered = instructedTools(skill.promptFragment).filter((tool) =>
      registered.has(tool),
    );
    expect(instructedAndRegistered.length).toBeGreaterThan(0);
    expect(instructedAndRegistered.filter((tool) => !held.has(tool))).toEqual([]);

    // An unregistered tool is refused at authoring, which is the half the seed catalog fails (F-031:
    // nine fragments declare `code-agent`, which no runtime registers).
    await expect(
      callTool(
        "s3-infra-lead",
        "create_skill",
        { ...TERRAFORM_SKILL, slug: "terraform-unregistered", tools: ["code-agent"] },
        "project-infra",
      ),
    ).rejects.toThrow(/code-agent/);
  });

  /** The degraded path is stated, because a silent one reads as coverage. */
  it("says a seat is capability-short instead of shipping it with defaults", async () => {
    const { seatIn } = setup();
    const bare = await seatIn("s3-infra-lead", "s3-infra-storage");

    expect(bare.capability?.project).toEqual([]);
    expect(bare.capability?.seed).toEqual([]);
    expect(bare.capability?.covered).toBe(false);
    expect(bare.capability?.note).toMatch(/create_skill/);
    expect(bare.capability?.note).toMatch(/capability/i);
    // The seat's *list* is not empty and never was: thirteen defaults on `s03r3`. What was missing is a
    // surface that could tell thirteen-from-the-floor apart from thirteen-with-a-capability.
    expect(bare.skills!.length).toBeGreaterThan(0);
  });
});
