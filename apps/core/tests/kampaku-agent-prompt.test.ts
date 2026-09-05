import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const agentPath = join(dirname(fileURLToPath(import.meta.url)), "../agents/kampaku.agent.json");

describe("kampaku agent prompt", () => {
  it("includes markdown formatting guidance and question protocol rules", () => {
    const definition = JSON.parse(readFileSync(agentPath, "utf8")) as { systemPrompt: string };
    const prompt = definition.systemPrompt;

    expect(prompt).toContain("<kampaku-question>");
    expect(prompt.toLowerCase()).toMatch(/markdown|github-flavored|headings|bullet/);
    expect(prompt).toContain("English");
  });
});
