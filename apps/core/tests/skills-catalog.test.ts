import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KAMPAKU_TOOLS } from "../src/agents/runtime/tools/index.js";

const catalogDirectory = resolve(process.cwd(), "../../packages/contracts/skills");
const externalToolNames = new Set(["code-agent", "github"]);
const kampakuDefinition = JSON.parse(
  readFileSync(resolve(process.cwd(), "agents/kampaku.agent.json"), "utf8"),
) as { tools: string[]; systemPrompt: string };

function readCatalogSkills() {
  return readdirSync(catalogDirectory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(resolve(catalogDirectory, file), "utf8")) as {
      slug: string;
      tools: string[];
      promptFragment: string;
    });
}

describe("skill catalog runtime contract", () => {
  it("exposes every internal skill tool to autonomous sessions", () => {
    const runtimeTools = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
    const missing = readCatalogSkills().flatMap((skill) =>
      skill.tools
        .filter((tool) => !externalToolNames.has(tool) && !runtimeTools.has(tool))
        .map((tool) => `${skill.slug}:${tool}`),
    );

    expect(missing).toEqual([]);
  });

  it("does not advertise duplicate tools inside a skill", () => {
    const duplicates = readCatalogSkills().flatMap((skill) => {
      const seen = new Set<string>();
      return skill.tools
        .filter((tool) => seen.has(tool))
        .map((tool) => `${skill.slug}:${tool}`);
    });

    expect(duplicates).toEqual([]);
  });

  it("teaches the three journaling channels explicitly", () => {
    const skills = new Map(readCatalogSkills().map((skill) => [skill.slug, skill.promptFragment]));

    expect(skills.get("workflow-memory")).toMatch(/private agent memory/i);
    expect(skills.get("workflow-memory")).toMatch(/superior journal/i);
    expect(skills.get("workflow-wiki")).toMatch(/shared.*knowledge/i);
    expect(skills.get("workflow-wiki")).toMatch(/evidence-backed/i);
    expect(skills.get("workflow-questions")).toMatch(/operational handoff/i);
    expect(skills.get("workflow-blockers")).toMatch(/exact symptom/i);
    expect(skills.get("workflow-blockers")).toMatch(/verification/i);
  });

  it("keeps Kampaku advisory and grants decomposition to the specialist skill", () => {
    const forbiddenForKampaku = [
      "submit_intent",
      "update_project",
      "update_work_item",
      "create_sub_agent",
      "update_sub_agent",
      "delete_sub_agent",
    ];

    expect(kampakuDefinition.tools).not.toEqual(expect.arrayContaining(forbiddenForKampaku));
    expect(kampakuDefinition.systemPrompt).toMatch(/do not execute code|do not mutate/i);
    const specialist = readCatalogSkills().find((skill) => skill.slug === "workflow-specialist-delegation");
    expect(specialist?.tools).toEqual(expect.arrayContaining(["submit_intent", "update_work_item", "create_sub_agent"]));
  });
});
