import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolveProjectJobContext, constrainPlanToProject, getRepositoryStackHints } from "../../src/application/pm/project-repository.js";
import type { ProjectRecord } from "../../src/persistence/store.js";

describe("resolveProjectJobContext", () => {
  const learnJapanese: ProjectRecord = {
    id: "proj-1",
    slug: "sample-project",
    name: "sample-project",
    status: "active",
    repositories: [
      {
        url: "file:///home/pdonoso/projects/sample-project",
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
    expect(context.repositoryPath).toBe("/home/pdonoso/projects/sample-project");
    expect(context.workspaceDir).toBe("sample-project");
  });

  it("forces external project plans to stay in the project repository", () => {
    const repoPath = mkdtempSync(join(tmpdir(), "kampaku-external-next-"));
    try {
      writeFileSync(join(repoPath, "package.json"), JSON.stringify({ dependencies: { next: "16.0.0" } }));
      const project = {
        ...learnJapanese,
        repositories: [{ ...learnJapanese.repositories[0]!, url: pathToFileURL(repoPath).href }],
      };
      const context = resolveProjectJobContext(project);
      const plan = constrainPlanToProject(
      {
        title: "Define API contracts",
        prompt: "Create OpenAPI specs in packages/contracts.",
        repositoryRole: "contracts",
        acceptanceCriteria: [],
      },
      project,
      context,
      );

      expect(plan.repositoryRole).toBe("web");
      expect(plan.prompt).toContain("sample-project");
      expect(plan.prompt).toContain(repoPath);
      expect(plan.prompt).toContain("Do not modify apps/core");
      expect(plan.prompt).toContain("App Router");
      expect(plan.acceptanceCriteria.length).toBeGreaterThan(0);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
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
