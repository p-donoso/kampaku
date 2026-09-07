import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveProjectJobContext, constrainPlanToProject, getRepositoryStackHints } from "../../src/application/pm/project-repository.js";
import type { ProjectRecord } from "../../src/persistence/store.js";

describe("resolveProjectJobContext", () => {
  const learnJapanese: ProjectRecord = {
    id: "proj-1",
    slug: "learn-japanese",
    name: "learn-japanese",
    status: "active",
    repositories: [
      {
        url: "file:///home/pdonoso/projects/learn-japanese",
        role: "web",
        defaultBranch: "main",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("marks external repositories outside the kampaku monorepo", () => {
    const context = resolveProjectJobContext(learnJapanese, "task-1");
    expect(context.isExternal).toBe(true);
    expect(context.repositoryRole).toBe("web");
    expect(context.repositoryPath).toBe("/home/pdonoso/projects/learn-japanese");
    expect(context.workspaceDir).toBe("learn-japanese");
  });

  it("forces external project plans to stay in the project repository", () => {
    const context = resolveProjectJobContext(learnJapanese);
    const plan = constrainPlanToProject(
      {
        title: "Define API contracts",
        prompt: "Create OpenAPI specs in packages/contracts.",
        repositoryRole: "contracts",
        acceptanceCriteria: [],
      },
      learnJapanese,
      context,
    );

    expect(plan.repositoryRole).toBe("web");
    expect(plan.prompt).toContain("learn-japanese");
    expect(plan.prompt).toContain("/home/pdonoso/projects/learn-japanese");
    expect(plan.prompt).toContain("Do not modify apps/core");
    expect(plan.prompt).toContain("App Router");
    expect(plan.acceptanceCriteria.length).toBeGreaterThan(0);
  });

  it("detects Next.js stack hints from package.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-stack-hints-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ dependencies: { next: "16.0.0" } }),
        "utf8",
      );
      writeFileSync(join(dir, "AGENTS.md"), "# Agents", "utf8");
      const hints = getRepositoryStackHints(dir);
      expect(hints.some((hint) => hint.includes("Next.js"))).toBe(true);
      expect(hints.some((hint) => hint.includes("AGENTS.md"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
