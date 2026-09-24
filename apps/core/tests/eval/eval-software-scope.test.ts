import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";
import { executeTriageIntent } from "../../src/agents/runtime/tools/triage-intent.js";
import { KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import { DEFAULT_GLOBAL_SYSTEM_PROMPT } from "../../src/application/settings/global-system-prompt.js";

/**
 * The deterministic half of gate F1 (software scope) from the evaluation lab.
 *
 * The live oracle is suite 04: a real non-technical request must be refused with the boundary named
 * and no degraded artifact produced. That oracle needs a model. What this file locks is the contract
 * underneath it, so a change that quietly drops the software-only scope from any surface a person or
 * agent reads fails the build instead of shipping:
 *
 * - the front-office prompt (what it builds, what it refuses)
 * - the prompt every agent and the planner inherit (`DEFAULT_GLOBAL_SYSTEM_PROMPT`)
 * - the intake skill (the scope check precedes the category check)
 * - the skill that governs a project lead's scope
 * - the tool surface advertised to the model
 */

const repositoryRoot = resolve(process.cwd(), "../..");
const intakeSkill = readFileSync(
  resolve(repositoryRoot, "packages/contracts/skills/system-intake/SKILL.md"),
  "utf8",
);

const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

const leadSkill = readFileSync(
  resolve(repositoryRoot, "packages/contracts/skills/system-delegation/SKILL.md"),
  "utf8",
);

describe("software scope and the refusal boundary", () => {
  it("states that software is the deliverable of a factory", () => {
    expect(prompt).toMatch(/software factory/i);
    expect(prompt).toMatch(/software is the deliverable/i);
  });

  it("names the out-of-scope categories and refuses them instead of degrading them", () => {
    expect(prompt).toMatch(/out of scope/i);
    expect(prompt).toMatch(/creative writing/i);
    expect(prompt).toMatch(/non-technical research/i);
    expect(prompt).toMatch(/non-technical documents/i);
    expect(prompt).toMatch(/standalone design/i);
    expect(prompt).toMatch(/name the boundary/i);
  });

  it("keeps the three agnosticism invariants explicit in the front-office prompt", () => {
    expect(prompt).toMatch(/language-agnostic/i);
    expect(prompt).toMatch(/project-type-agnostic/i);
    expect(prompt).toMatch(/architecture-agnostic/i);
  });

  it("does not promise arbitrary non-software work", () => {
    expect(prompt).not.toMatch(/any domain/i);
    expect(prompt).not.toMatch(/domain[- ]agnostic/i);
  });

  it("keeps every advertised tool inside software scope", () => {
    const surface = JSON.stringify(KAMPAKU_TOOLS.map((tool) => tool.function));

    expect(surface).not.toMatch(/any domain|any kind of human work|domain[- ]agnostic/i);
    expect(surface).not.toMatch(/screenplay|novel writing|market research/i);

    const triage = KAMPAKU_TOOLS.find((tool) => tool.function.name === "triage_intent");
    expect(triage?.function.description).toMatch(/software request/i);
    expect(triage?.function.description).toMatch(/out of scope/i);
  });

  it("routes every in-scope intake category to work on software", () => {
    const result = executeTriageIntent({
      intent: "Investigate why the parser build fails on the linked repository.",
      category: "research",
    });

    expect(result.routing).toMatch(/software/i);
    expect(result.routing).not.toMatch(/domain specialist/i);
  });

  it("names the scope boundary in the intake result", () => {
    const result = executeTriageIntent({
      intent: "Update the dependency and re-run the existing regression suite.",
      category: "maintenance",
    });

    expect(result.message).toMatch(/Only software/i);
    expect(result.message).toMatch(/refused with the boundary named/i);
  });

  it("keeps the boundary in the intake skill contract", () => {
    expect(intakeSkill).toMatch(/Kampaku is a software factory/i);
    expect(intakeSkill).toMatch(/Refuse creative writing/i);
    expect(intakeSkill).toMatch(/Name the boundary/i);
    expect(intakeSkill).toMatch(/technical investigation|reduces uncertainty about software/i);
  });

  /**
   * `DEFAULT_GLOBAL_SYSTEM_PROMPT` is prepended to the front office, to every project lead and
   * specialist session, and to the planner. Stating the deliverable only in the front-office prompt
   * left the line — the agents that actually plan and write — free to accept an out-of-scope
   * objective in good faith, which is how a refusal becomes a degraded artifact.
   */
  it("states the deliverable and the boundary in the prompt every agent inherits", () => {
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/deliverable is software/i);
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/outside its scope/i);
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/creative writing/i);
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/non-technical research/i);
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/non-technical documents/i);
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/standalone deliverable/i);
    // The refusal must be a refusal, not a silent attempt.
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/name the boundary/i);
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/do not produce a degraded substitute/i);
    // And the boundary test must be the evidence, so the rule is usable rather than a slogan.
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(
      /acceptance evidence can be executed, inspected, or measured/i,
    );
    // The invariant statement travels with it, since this prompt reaches every role.
    expect(DEFAULT_GLOBAL_SYSTEM_PROMPT).toMatch(/read the project's language, toolchain/i);
  });

  it("states the deliverable in the skill that governs scope for a project lead", () => {
    expect(leadSkill).toMatch(/The deliverable is software and the technical artifacts/i);
    expect(leadSkill).toMatch(/do not plan it/i);
    expect(leadSkill).toMatch(/refuse/i);
  });

  /**
   * A refusal spoken and forgotten cannot be seen by the operator or audited. The front office and the
   * intake skill must therefore tell the agent to **record** the refusal, not only to speak it —
   * otherwise the boundary lives in a reply and is lost when the chat closes, which is the
   * BOARD F-007 shape.
   */
  it("requires the refusal to be recorded, not only spoken", () => {
    expect(prompt).toMatch(/triage_intent/);
    expect(prompt).toMatch(/out_of_scope/);
    expect(prompt).toMatch(/recorded durably|recorded/i);

    expect(intakeSkill).toMatch(/out_of_scope/);
    expect(intakeSkill).toMatch(/Record the refusal/i);
    expect(intakeSkill).toMatch(/boundary/i);
  });

  it("exposes an out_of_scope category whose boundary is what makes it usable", () => {
    const triage = KAMPAKU_TOOLS.find((tool) => tool.function.name === "triage_intent");
    const parameters = triage?.function.parameters as {
      properties?: Record<string, { enum?: string[] }>;
    };

    // The category must exist, or the agent has no way to say "this is out of scope".
    expect(parameters.properties?.category?.enum).toContain("out_of_scope");
    // And the boundary must be part of the contract, or the refusal is a generic apology.
    expect(parameters.properties?.boundary?.enum?.length).toBeGreaterThan(0);
  });
});
