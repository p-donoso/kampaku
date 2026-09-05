import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  buildRoadmapWikiMarkdown,
  ROADMAP_WIKI_SLUG,
  syncRoadmapWikiPage,
} from "../src/application/wiki/roadmap-sync.js";
import { createDb } from "../src/persistence/db.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { Store } from "../src/persistence/store.js";
import { WikiStore } from "../src/persistence/wiki-store.js";

describe("roadmap sync", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("builds markdown from milestones and coherence strategy", () => {
    const md = buildRoadmapWikiMarkdown("Keep UX and API aligned.", [
      {
        id: "m1",
        projectId: "p1",
        title: "MVP",
        description: "Ship first release",
        sortOrder: 0,
        status: "planned",
        successCriteria: ["Users can sign in"],
        executedBy: "ai_agents",
      },
    ]);

    expect(md).toContain("Coherence strategy");
    expect(md).toContain("MVP");
    expect(md).toContain("Users can sign in");
  });

  it("syncs roadmap wiki page", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-roadmap-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const store = new Store(db);
    const pm = new PmStore(db);
    const wiki = new WikiStore(db);
    const now = new Date().toISOString();
    const projectId = uuidv4();

    store.createProject({
      id: projectId,
      slug: "demo",
      name: "Demo",
      status: "active",
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    store.updateProjectPlanning(projectId, { coherenceStrategy: "Single owner reviews all changes." });

    pm.createMilestone({
      id: uuidv4(),
      projectId,
      title: "Launch",
      sortOrder: 0,
      status: "planned",
      successCriteria: ["Docs complete"],
      executedBy: "ai_agents",
    });

    const page = syncRoadmapWikiPage(store, pm, wiki, projectId);
    expect(page?.slug).toBe(ROADMAP_WIKI_SLUG);
    expect(page?.contentMd).toContain("Launch");

    pm.createMilestone({
      id: uuidv4(),
      projectId,
      title: "Scale",
      sortOrder: 1,
      status: "planned",
      successCriteria: [],
      executedBy: "ai_agents",
    });

    const updated = syncRoadmapWikiPage(store, pm, wiki, projectId);
    expect(updated?.contentMd).toContain("Scale");
  });
});
