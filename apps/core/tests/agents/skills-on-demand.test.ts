import { describe, expect, it } from "vitest";
import {
  LIST_SKILLS_TOOL,
  executeListSkills,
} from "../../src/agents/runtime/tools/list-skills.js";
import { executeGetSkill } from "../../src/agents/runtime/tools/get-skill.js";
import { seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * `list_skills` at the size the decision needs, and `get_skill` so nothing is lost by it.
 *
 * Measured before this changed, on the real 36-skill catalog: `list_skills` returned 9 575 characters
 * containing `slug, name, description, capabilities, tools` per skill, and answering suite 01's
 * `what exists here?` made it **62% of all tool weight in the turn**. Its two heaviest fields,
 * `description` (3 288 chars) and `tools` (1 946), account for 5 234 of the 9 969 serialized characters,
 * and the only documented consumer of the result — `assign_skill`'s own description — asks for a **slug**.
 *
 * The compact form is 3 589 characters. That is a 64% cut, and it is a default rather than a loss
 * because `detail: "full"` returns exactly what this used to return and `get_skill` reaches any one of
 * them. A projection that cannot be reopened is not a projection, it is a deletion.
 */
describe("list_skills and get_skill", () => {
  let context: TestContext | undefined;

  function seeded() {
    context = createTestContext("kampaku-skills-tools-");
    const root = repoRoot();
    if (root) seedSkillsFromCatalog(context.skillStore, root);
    return context;
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

  it("defaults to the fields a choice needs", () => {
    const { skillStore } = seeded();
    const result = executeListSkills(skillStore);

    expect(result.detail).toBe("summary");
    expect(result.skills.length).toBe(36);
    for (const skill of result.skills) {
      expect(skill.slug).toBeTruthy();
      // The slug is what `assign_skill` takes, and the name is how a person reads the list.
      expect(skill.name).toBeTruthy();
      expect("description" in skill).toBe(false);
      expect("tools" in skill).toBe(false);
    }
  });

  it("is materially smaller than the full form, on the real catalog", () => {
    const { skillStore } = seeded();
    const summary = JSON.stringify(executeListSkills(skillStore));
    const full = JSON.stringify(executeListSkills(skillStore, { detail: "full" }));

    expect(summary.length).toBeLessThan(full.length * 0.5);
    expect(full.length).toBeGreaterThan(9_000);
  });

  it("returns everything on request, so the default is not a loss", () => {
    const { skillStore } = seeded();
    const full = executeListSkills(skillStore, { detail: "full" });
    const sample = full.skills.find((skill) => skill.slug === "system-agent-roster");

    expect(sample?.description).toBeTruthy();
    expect(sample?.tools?.length).toBeGreaterThan(0);
  });

  it("advertises the cheap default in its own description, so the model is told before it calls", () => {
    const description = LIST_SKILLS_TOOL.function.description;

    expect(description).toMatch(/slug, name, and capabilities/);
    expect(description).toContain('detail: "full"');
  });

  it("lets any role read one skill in full, which is what makes the projection safe", () => {
    const { skillStore } = seeded();
    const skill = executeGetSkill(skillStore, { slug: "system-post-action" });

    // A fragment kept out of the orchestrator's prompt is still reachable, instructions included.
    expect(skill.slug).toBe("system-post-action");
    expect(skill.promptFragment.length).toBeGreaterThan(500);
    expect(skill.tools.length).toBeGreaterThan(0);
  });

  it("points at the tool that lists the slugs when asked for one that does not exist", () => {
    const { skillStore } = seeded();

    expect(() => executeGetSkill(skillStore, { slug: "nope" })).toThrow(/No skill "nope"/);
    expect(() => executeGetSkill(skillStore, { slug: "nope" })).toThrow(/list_skills/);
    expect(() => executeGetSkill(skillStore, { slug: "  " })).toThrow(/slug is required/);
  });
});
