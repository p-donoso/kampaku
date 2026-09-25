import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { KAMPAKU_AGENT_ID } from "../../src/agents/definitions.js";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";
import { KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import {
  ORCHESTRATOR_RESIDENT_SKILLS,
  seedSkillsFromCatalog,
} from "../../src/persistence/skill-store.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * What the orchestrator's prompt may carry, locked against the tools it actually holds.
 *
 * Two rounds of narrowing are locked here.
 *
 * **First.** Measured on a live run-3 instance with the real 36-skill catalog, `system-` plus the
 * `default` group were **27.5 KB of a 40.4 KB turn — 68%** — and the builtin prompt that defines the
 * front office was 11.5% of its own context. The removably largest share was the eleven `workflow-*`
 * fragments, instructions to call `execute_work_item`, `report_blocker`, `recall`, `propose_wiki_edit`
 * and about forty more tools **the front office does not hold**. They were removed; a sub-agent that
 * really executes still receives them through its assignment.
 *
 * **Second.** Every remaining `system-` fragment was still included, and four of the twelve have **zero**
 * tools this role may call: `system-post-action` (1 701 chars), `system-skill-admin` (922),
 * `system-global-prompt-admin` (535), `system-architect` (89). The resident set is now named explicitly
 * and those four are outside it — which also emptied the inventory of foreign tools this file used to
 * track, because the fragments that named them are no longer read.
 *
 * The lock checks both directions, so neither half can drift back: the orchestrator carries its
 * projection and nothing else, and an agent that executes still gets what it needs.
 */

const registeredTools = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
const frontOfficeTools = new Set(KAMPAKU_BUILTIN_DEFINITION.tools);

/**
 * Tool names a prompt fragment connects to an action the reader takes.
 *
 * **The first version of this anchor missed the defect it was written for.** It matched only
 * `Use <tool>` and `Call <tool>`, and the fragment that produced F-038 says:
 *
 * > When linking a repository **via** `update_project`:
 *
 * So the lock reported an empty inventory while the resident prompt was telling its reader, every turn, to
 * reach for a tool the front office does not hold — and a live reply then told the operator the same thing.
 * The anchor now covers the connectives the catalog actually uses: `via`, `using`, `through`, `with`,
 * `then`. A lock is only as good as its reading of the text it guards, and this one was reading one of the
 * five ways the catalog says it.
 */
function instructedTools(prompt: string): string[] {
  const found = new Set<string>();
  for (const match of prompt.matchAll(
    /\b(?:Use|Call|via|using|through|with|then)\s+([a-z][a-z0-9_]{3,})\b/gi,
  )) {
    found.add(match[1]);
  }
  return [...found];
}

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

describe("orchestrator skill scope", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  function freshContext() {
    context = createTestContext("kampaku-orchestrator-skills-");
    return context;
  }

  it("carries the resident fragments and withholds everything else", () => {
    const { skillStore } = freshContext();
    skillStore.upsertSkill({
      slug: "system-intake",
      name: "Intake",
      description: "Decide software scope.",
      capabilities: [],
      tools: ["triage_intent"],
      promptFragment: "Refuse out-of-scope work and name the boundary.",
    });
    skillStore.upsertSkill({
      slug: "system-post-action",
      name: "Post action",
      description: "Project the outcome.",
      capabilities: [],
      tools: ["submit_completion_report"],
      promptFragment: "Use submit_completion_report when the work closes.",
    });
    skillStore.upsertSkill({
      slug: "workflow-execution",
      name: "Work item execution",
      description: "Run leaf tasks.",
      capabilities: [],
      tools: ["execute_work_item"],
      promptFragment: "Use execute_work_item to start a leaf task.",
      default: true,
    });

    const prompt = skillStore.buildOrchestratorSkillsPrompt();

    expect(prompt).toContain("Refuse out-of-scope work and name the boundary.");
    // A `system-` fragment the role cannot act on is now outside the projection, exactly like a
    // `workflow-` one. The prefix stopped being the criterion.
    expect(prompt).not.toContain("Use submit_completion_report");
    expect(prompt).not.toContain("Use execute_work_item to start a leaf task.");
  });

  it("leaves the executor skills available to an agent that really executes", () => {
    const { agentStore, skillStore } = freshContext();
    skillStore.upsertSkill({
      slug: "workflow-execution",
      name: "Work item execution",
      description: "Run leaf tasks.",
      capabilities: [],
      tools: ["execute_work_item"],
      promptFragment: "Use execute_work_item to start a leaf task.",
      default: true,
    });
    skillStore.upsertSkill({
      slug: "system-intake",
      name: "Intake",
      description: "Decide software scope.",
      capabilities: [],
      tools: ["triage_intent"],
      promptFragment: "Refuse out-of-scope work and name the boundary.",
    });
    const worker = agentStore.createSubAgent({
      slug: "demo-worker",
      name: "Demo Worker",
      parentId: KAMPAKU_AGENT_ID,
      responsibilities: "Execute work items",
      systemPrompt: "You execute work.",
    });
    skillStore.syncDefaultSkillsForAgent(worker.id);

    const appendix = skillStore.buildSkillPromptAppendix(worker.id);

    expect(appendix).toContain("Use execute_work_item to start a leaf task.");
    expect(skillStore.getAgentToolNames(worker.id)).toContain("execute_work_item");
    expect(appendix).not.toContain("Refuse out-of-scope work and name the boundary.");
  });

  it("carries exactly its projection, from the real catalog", () => {
    const { skillStore } = freshContext();
    const root = repoRoot();
    if (!root) return;
    seedSkillsFromCatalog(skillStore, root);

    const prompt = skillStore.buildOrchestratorSkillsPrompt();
    const all = skillStore.listSkills();

    expect(prompt.length).toBeGreaterThan(1000);
    expect(ORCHESTRATOR_RESIDENT_SKILLS.size).toBeGreaterThan(4);

    const carried = (slug: string) => {
      const skill = all.find((s) => s.slug === slug);
      if (!skill) return false;
      const marker = skill.promptFragment.trim().slice(0, 60);
      return marker.length > 0 && prompt.includes(marker);
    };

    const missing = [...ORCHESTRATOR_RESIDENT_SKILLS].filter((slug) => !carried(slug));
    const extra = all
      .filter((skill) => !ORCHESTRATOR_RESIDENT_SKILLS.has(skill.slug))
      .filter((skill) => carried(skill.slug))
      .map((skill) => skill.slug);

    // Every resident fragment is present, and nothing outside the set leaked in — including the
    // `workflow-*` group and the four `system-` fragments that do not belong to this role.
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    // The excluded ones, named, so a change to the set has to be deliberate. The last two were removed
    // with F-038 rather than from the start: both are another role's procedure, and both instructed tools
    // the front office does not hold — `submit_intent` and `update_work_item` in `system-plan-quality`,
    // `update_project` twice in `system-project-bootstrap`. `system-plan-quality` is also a `default`, so
    // executors still receive it through assignment and nothing was lost by taking it off this list.
    for (const slug of [
      "system-post-action",
      "system-skill-admin",
      "system-global-prompt-admin",
      "system-architect",
      "system-plan-quality",
      "system-project-bootstrap",
    ]) {
      expect(ORCHESTRATOR_RESIDENT_SKILLS.has(slug)).toBe(false);
      expect(carried(slug)).toBe(false);
    }
  });

  /**
   * The inventory this file used to track, now empty.
   *
   * It once asserted `["assign_skill", "propose_audit_improvement", "unassign_skill"]` — three tools the
   * front office was instructed to call and forbidden to call, from the fragments that are no longer
   * read. Asserted as an exact empty list rather than deleted, so that a re-introduced fragment which
   * names a foreign tool fails here.
   */
  it("instructs no tool outside the front-office allowlist", () => {
    const { skillStore } = freshContext();
    const root = repoRoot();
    if (!root) return;
    seedSkillsFromCatalog(skillStore, root);

    const prompt = skillStore.buildOrchestratorSkillsPrompt();
    const instructed = instructedTools(prompt);
    expect(instructed.length).toBeGreaterThan(0);
    const forbidden = instructed
      .filter((tool) => registeredTools.has(tool) && !frontOfficeTools.has(tool))
      .sort();

    expect(forbidden).toEqual([]);
  });

  /**
   * Nine of the thirty-six catalog fragments declare `code-agent`, which the runtime registers nowhere,
   * and one declares `github`, which it also does not.
   *
   * This started as a check on a single fragment. Filtering by the `system-` prefix hid the rest: the
   * tool is named by `api-integration`, `docs-writer`, `github-admin`, `kampaku-platform-dev`,
   * `nextjs-dev`, `qa-testing`, `security-review` and `skill-builder` as well. A `SKILL.md` is a claim
   * about capability, and nine of them promise a tool that does not exist.
   *
   * `code-agent` is the vendor-coupled spec that [roadmap 11 § Part A](../../../../docs/roadmap/11-multi-provider-routing.md)
   * already names as one of the three user-visible vendor leaks, so this is that defect's second
   * surface — and BOARD F-031's. Asserted as the exact sorted inventory rather than as a count, so that
   * fixing one of them, or adding a tenth, both fail here.
   */
  it("records every catalog fragment that names an unregistered tool", () => {
    const { skillStore } = freshContext();
    const root = repoRoot();
    if (!root) return;
    seedSkillsFromCatalog(skillStore, root);

    const unknown = skillStore
      .listSkills()
      .flatMap((skill) =>
        skill.tools
          .filter((tool) => !registeredTools.has(tool))
          .map((tool) => `${skill.slug}:${tool}`),
      )
      .sort();

    expect(unknown).toEqual([
      "ai-prompt-engineering:code-agent",
      "api-integration:code-agent",
      "docs-writer:code-agent",
      "github-admin:code-agent",
      "github-admin:github",
      "kampaku-platform-dev:code-agent",
      "nextjs-dev:code-agent",
      "qa-testing:code-agent",
      "security-review:code-agent",
      "skill-builder:code-agent",
      "system-architect:code-agent",
    ]);
  });
});
