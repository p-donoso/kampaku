import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteSkillFromCatalog,
  parseSkillMarkdown,
  readSkillFromCatalog,
  renameSkillInCatalog,
  serializeSkillMarkdown,
  writeSkillToCatalog,
} from "../../src/persistence/skill-catalog.js";
import type { SkillRecord } from "../../src/persistence/skill-store.js";

const skill: SkillRecord = {
  slug: "qa-testing",
  name: "QA Testing",
  description: "Test applications. Use when verifying behavior or preventing regressions.",
  capabilities: ["code.agent", "quality.review"],
  tools: ["code-agent", "submit_peer_review"],
  promptFragment: "# QA Testing\n\nRun the relevant checks and report concrete evidence.",
  default: true,
};

describe("Agent Skills catalog codec", () => {
  let workspaceRoot: string;

  afterEach(() => {
    if (workspaceRoot) rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("round-trips the Kampaku runtime record through standard SKILL.md", () => {
    const markdown = serializeSkillMarkdown(skill);

    expect(markdown).toMatch(/^---\nname: qa-testing\n/);
    expect(markdown).toContain("allowed-tools: code-agent submit_peer_review");
    expect(markdown).toContain("\n---\n\n# QA Testing\n");
    expect(parseSkillMarkdown(markdown, skill.slug)).toEqual(skill);
  });

  it("requires the standard name to match its parent directory", () => {
    const markdown = serializeSkillMarkdown(skill);

    expect(() => parseSkillMarkdown(markdown, "different-name")).toThrow(
      /must match directory/,
    );
  });

  it("writes, renames, and deletes a skill directory without dropping resources", () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "kampaku-skill-catalog-"));
    writeSkillToCatalog(workspaceRoot, skill);
    const oldDirectory = join(workspaceRoot, "packages/contracts/skills/qa-testing");
    mkdirSync(join(oldDirectory, "references"));
    writeFileSync(join(oldDirectory, "references/checklist.md"), "Checklist\n");

    renameSkillInCatalog(workspaceRoot, "qa-testing", "quality-testing");
    const newDirectory = join(workspaceRoot, "packages/contracts/skills/quality-testing");
    const renamed = { ...skill, slug: "quality-testing" };
    writeSkillToCatalog(workspaceRoot, renamed);

    expect(readSkillFromCatalog(workspaceRoot, "quality-testing")).toEqual(renamed);
    expect(readFileSync(join(newDirectory, "references/checklist.md"), "utf8")).toBe(
      "Checklist\n",
    );
    expect(existsSync(oldDirectory)).toBe(false);

    deleteSkillFromCatalog(workspaceRoot, "quality-testing");
    expect(existsSync(newDirectory)).toBe(false);
  });
});
