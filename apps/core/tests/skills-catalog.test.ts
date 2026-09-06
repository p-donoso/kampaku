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

  it("allows Kampaku project metadata and staffing tools; keeps work/execution mutators off Kampaku", () => {
    const forbiddenForKampaku = [
      "submit_intent",
      "update_work_item",
      "create_sub_agent",
      "update_sub_agent",
      "delete_sub_agent",
      "execute_work_item",
    ];

    expect(kampakuDefinition.tools).toEqual(
      expect.arrayContaining([
        "update_project",
        "staff_project_team",
        "bootstrap_stranger_project",
        "propose_project_plan",
        "execute_hello_eval_plan",
        "publish_shared_knowledge",
        "ask_blocking_question",
        "get_wiki_tree",
        "get_wiki_page",
        "list_projects",
        "get_project",
      ]),
    );
    expect(kampakuDefinition.tools).not.toEqual(expect.arrayContaining(forbiddenForKampaku));
    expect(kampakuDefinition.systemPrompt).toMatch(/staff_project_team|standing team/i);
    expect(kampakuDefinition.systemPrompt).toMatch(/refuse|explicit emperor yes/i);
    expect(kampakuDefinition.systemPrompt).toMatch(/project_lead_slug|repositories/i);
    expect(kampakuDefinition.systemPrompt).toMatch(/vague improve|next intent|clarify/i);
    expect(kampakuDefinition.systemPrompt).toMatch(/bootstrap_stranger_project|stranger/i);
    expect(kampakuDefinition.systemPrompt).toMatch(/propose_project_plan|Hello Eval/i);
    expect(kampakuDefinition.systemPrompt).toMatch(/execute_hello_eval_plan|go-ahead/i);
    expect(kampakuDefinition.systemPrompt).toMatch(/publish_shared_knowledge|shared knowledge/i);
    expect(kampakuDefinition.tools).toEqual(expect.arrayContaining(["ask_blocking_question"]));
    expect(kampakuDefinition.systemPrompt).toMatch(/ask_blocking_question|credentials|vendor/i);
    expect(kampakuDefinition.tools).toEqual(expect.arrayContaining(["verify_and_close_work"]));
    expect(kampakuDefinition.systemPrompt).toMatch(/verify_and_close_work|silent green|checks pass/i);
    expect(kampakuDefinition.tools).toEqual(expect.arrayContaining(["request_scope_approval"]));
    expect(kampakuDefinition.systemPrompt).toMatch(/request_scope_approval|scope expansion|SaaS/i);
    const specialist = readCatalogSkills().find((skill) => skill.slug === "workflow-specialist-delegation");
    expect(specialist?.tools).toEqual(expect.arrayContaining(["submit_intent", "update_work_item", "create_sub_agent"]));
  });
});
