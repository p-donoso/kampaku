import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";
import { executeTriageIntent } from "../../src/agents/runtime/tools/triage-intent.js";
import { KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";

/**
 * The deterministic half of gate F1 (software scope) from the evaluation lab.
 *
 * The live oracle is suite 04: a real non-technical request must be refused with the boundary named
 * and no degraded artifact produced. That oracle needs a model. What this file locks is the
 * contract underneath it, so a change that quietly drops the software-only scope from the front
 * office, its tool surface, or the intake skill fails the build instead of shipping.
 */

const repositoryRoot = resolve(process.cwd(), "../..");
const intakeSkill = readFileSync(
  resolve(repositoryRoot, "packages/contracts/skills/system-intake/SKILL.md"),
  "utf8",
);

const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

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
    expect(prompt).toMatch(/refuse them and name the boundary/i);
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
});
