import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import type { Store } from "../persistence/store.js";

export function bootstrapKampakuProject(store: Store, config: AppConfig) {
  const existing = store.getBootstrapState<{ projectId: string }>("default_project");
  if (existing?.projectId) {
    const project = store.getProject(existing.projectId);
    if (project) return { project, created: false };
  }

  const workspace = config.workspaceRoot;
  const now = new Date().toISOString();
  const project = {
    id: uuidv4(),
    slug: "kampaku",
    name: "Kampaku",
    description: "Self-improvement project for the Kampaku platform repositories.",
    status: "active" as const,
    repositories: [
      { url: `file://${join(workspace, "apps/core")}`, role: "core", defaultBranch: "main" },
      { url: `file://${join(workspace, "apps/worker")}`, role: "worker", defaultBranch: "main" },
      {
        url: `file://${join(workspace, "packages/contracts")}`,
        role: "contracts",
        defaultBranch: "main",
      },
      { url: `file://${join(workspace, "docs")}`, role: "docs", defaultBranch: "main" },
    ],
    createdAt: now,
    updatedAt: now,
  };

  store.createProject(project);
  store.setBootstrapState("default_project", { projectId: project.id });

  return { project, created: true };
}
