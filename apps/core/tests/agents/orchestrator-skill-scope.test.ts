import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { KAMPAKU_AGENT_ID } from "../../src/agents/definitions.js";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";
import { KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import { seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * What the orchestrator's prompt may carry, locked against the tools it actually holds.
 *
 * Measured on a live run-3 instance with the real 36-skill catalog:
 *
 *   builtin systemPrompt            4 643 chars   11.5%
 *   buildDefaultSkillsPrompt       12 198 chars   30.2%   <- the 11 `workflow-*` skills
 *   buildKampakuSystemSkillsPrompt 15 341 chars   38.0%
 *   tool schemas                    8 220 chars   20.3%
 *
 * 68% of the front office's own context was skill fragments, and the largest removable share was a set
 * of fragments that instruct the reader to call `execute_work_item`, `report_blocker`, `recall`,
 * `propose_wiki_edit` and roughly forty more tools **that the front office does not hold**. The store
 * already refused to assign those skills to the built-in; only the prompt disagreed.
 *
 * This file locks the scope in both directions, so neither half can drift back:
 *
 * - the orchestrator prompt names **no tool outside the front-office allowlist**;
 * - a sub-agent that executes work **still receives** the `workflow-*` fragments it needs.
 */

/** Tools the runtime actually registers, so "names a tool" can be checked rather than assumed. */
const registeredTools = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
const frontOfficeTools = new Set(KAMPAKU_BUILTIN_DEFINITION.tools);

/**
 * Tool names a prompt fragment instructs the reader to call.
 *
 * Anchored on the imperative the catalog actually uses (`Use <tool>`, `Call <tool>`) rather than on a
 * list of tool names, so a new fragment cannot slip a forbidden tool past the lock by being written
 * after this test was.
 */
function instructedTools(prompt: string): string[] {
  const found = new Set<string>();
  for (const match of prompt.matchAll(/\b(?:Use|Call)\s+([a-z][a-z0-9_]{3,})\b/g)) {
    found.add(match[1]);
  }
  return [...found];
}

/** The repo root, found by walking up rather than assuming a cwd. */
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

  it("carries the operator skills and withholds the executor skills", () => {
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
      slug: "workflow-execution",
      name: "Work item execution",
      description: "Run leaf tasks.",
      capabilities: [],
      tools: ["execute_work_item"],
      promptFragment: "Use execute_work_item to start a leaf task.",
      default: true,
    });

    const prompt = skillStore.buildOrchestratorSkillsPrompt();

    // The skill the front office can act on is present.
    expect(prompt).toContain("Refuse out-of-scope work and name the boundary.");
    // The skill that tells the reader to run work is not, and neither is its tool.
    expect(prompt).not.toContain("Use execute_work_item to start a leaf task.");
    expect(prompt).not.toContain("execute_work_item");
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

    // Withholding it from the orchestrator must not have withheld it from the worker: this is the half
    // that would turn a context fix into a capability regression.
    expect(appendix).toContain("Use execute_work_item to start a leaf task.");
    expect(skillStore.getAgentToolNames(worker.id)).toContain("execute_work_item");
    // And the operator skill is not pushed onto the worker.
    expect(appendix).not.toContain("Refuse out-of-scope work and name the boundary.");
  });

  /**
   * The decision, locked by fragment identity rather than by keyword.
   *
   * A substring check on tool names cannot tell instruction from mention — `system-plan-quality`
   * mentions `execute_work_item` in a sequencing note and `system-chat-format` mentions `ask_superior`
   * while describing formatting. Those are real findings, but they belong in the inventory test below,
   * not here. What this locks is the split itself: every `default` fragment is out, every `system-`
   * fragment is in.
   */
  it("carries every operator fragment and no executor fragment, from the real catalog", () => {
    const { skillStore } = freshContext();
    const root = repoRoot();
    if (!root) return;
    // The real catalog, not a fixture: the defect was in what the catalog actually says.
    seedSkillsFromCatalog(skillStore, root);

    const prompt = skillStore.buildOrchestratorSkillsPrompt();
    const all = skillStore.listSkills();
    const operators = all.filter((skill) => skill.slug.startsWith("system-"));
    // `default` and `system-` overlap: two fragments carry both flags. The executor set is the
    // defaults that are **not** operator skills, which is the group that describes running work. The
    // two that carry both flags used to be injected twice in one prompt — a second, quieter defect
    // this split fixes, because the operator branch now carries them once.
    const executors = all.filter(
      (skill) => skill.default === true && !skill.slug.startsWith("system-"),
    );
    expect(all.filter((s) => s.default === true && s.slug.startsWith("system-")).length).toBe(2);

    // Guard against a vacuous pass: an empty prompt or an empty catalog would satisfy everything.
    expect(prompt.length).toBeGreaterThan(1000);
    expect(operators.length).toBeGreaterThan(5);
    expect(executors.length).toBeGreaterThan(5);

    // A fragment is "carried" when its own first line of substance appears in the prompt.
    const carried = (slug: string) => {
      const skill = all.find((s) => s.slug === slug);
      if (!skill) return false;
      const marker = skill.promptFragment.trim().slice(0, 60);
      return marker.length > 0 && prompt.includes(marker);
    };

    const missingOperators = operators.map((s) => s.slug).filter((slug) => !carried(slug));
    const leakedExecutors = executors.map((s) => s.slug).filter(carried);

    expect(missingOperators).toEqual([]);
    expect(leakedExecutors).toEqual([]);
  });

  /**
   * What is still wrong with the operator set, stated as an inventory instead of an aspiration.
   *
   * Removing the `workflow-*` fragments took out roughly forty references to tools the front office
   * cannot call. What remains is four fragments that are plausibly not the orchestrator's at all:
   *
   * - `system-skill-admin` -> `assign_skill`, `unassign_skill` (the skillmaster's job)
   * - `system-audit` -> `propose_audit_improvement` (the auditor's job)
   * - `system-plan-quality` -> `submit_intent` (the planner's job; the front office delegates planning)
   * - `system-chat-format` -> mentions `ask_superior`, which is a sub-agent's channel, not the front
   *   office's
   *
   * Asserted as an exact inventory rather than an empty list, because the honest claim is "these four,
   * tracked" and not "none". A new leak fails this test, and so does a fix that removes one of these
   * without deciding where the fragment belongs.
   */
  it("tracks the operator fragments that still name a tool the front office does not hold", () => {
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

    expect(forbidden).toEqual(["assign_skill", "propose_audit_improvement", "unassign_skill"]);

    // The two fragments that mention a foreign tool without instructing it, recorded separately so
    // the distinction survives. Neither is a refusal to fix; both need a decision about the fragment.
    expect(prompt).toContain("execute_work_item");
    expect(prompt).toContain("ask_superior");
  });

  /**
   * The executor set is gone; the operator set is not yet clean, and this records exactly how unclean.
   *
   * Removing the `workflow-*` fragments took out ~40 references to tools the front office cannot call.
   * Three remain, in two fragments that are plausibly not the orchestrator's at all: `system-audit`
   * (`propose_audit_improvement`) and `system-skill-admin` (`assign_skill`, `unassign_skill`) describe
   * the auditor's and the skillmaster's job, not the front office's.
   *
   * Asserted as an exact inventory rather than as an empty list, because the honest claim is "these
   * three, tracked" and not "none". Any new leak fails this test, and so does a fix that hides one of
   * these without deciding where the fragment belongs — which is the point.
   *
   * Owned by roadmap 04 with the fragment-scope decision, and BOARD F-031.
   */
  it("tracks the operator fragments that still name a tool the front office does not hold", () => {
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

    expect(forbidden).toEqual([
      "assign_skill",
      "propose_audit_improvement",
      "unassign_skill",
    ]);
  });

  it("names no unregistered tool in an operator skill, so no fragment promises a capability that does not exist", () => {
    const { skillStore } = freshContext();
    const root = repoRoot();
    if (!root) return;
    seedSkillsFromCatalog(skillStore, root);

    const systemSkills = skillStore.listSkills().filter((s) => s.slug.startsWith("system-"));
    expect(systemSkills.length).toBeGreaterThan(0);
    const unknown = systemSkills.flatMap((skill) =>
      skill.tools.filter((tool) => !registeredTools.has(tool)).map((tool) => `${skill.slug}:${tool}`),
    );

    // `system-architect` declares `code-agent`, which is registered nowhere. Recorded as BOARD F-031
    // and owned by roadmap 11 § Part A, which already names the `code.agent` spec as one of the three
    // user-visible vendor leaks. Listed here rather than asserted empty so the day it is fixed, this
    // test is the one that says so.
    expect(unknown).toEqual(["system-architect:code-agent"]);
  });
});
