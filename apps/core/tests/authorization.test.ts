import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import {
  assertSubAgentMutationTargetScope,
  assertSubAgentParentScope,
} from "../src/agents/runtime/tools/authorization.js";

describe("agent mutation authorization", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("allows a specialist to create under its own hierarchy", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-authorization-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const agents = new AgentStore(db);
    const lead = agents.createSubAgent({
      slug: "project-lead",
      name: "Project Lead",
      responsibilities: "Lead the project",
      systemPrompt: "Lead",
      parentId: "kampaku",
    });
    const specialist = agents.createSubAgent({
      slug: "project-qa",
      name: "Project QA",
      responsibilities: "Own QA",
      systemPrompt: "QA",
      parentId: lead.id,
    });

    expect(() => assertSubAgentParentScope(agents, specialist.id, specialist.id)).not.toThrow();
    expect(() => assertSubAgentParentScope(agents, specialist.id, lead.id)).toThrow(/hierarchy/);
  });

  it("does not allow an agent to create under an unrelated branch", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-authorization-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const agents = new AgentStore(db);
    const first = agents.createSubAgent({
      slug: "first-lead",
      name: "First Lead",
      responsibilities: "Lead the first project",
      systemPrompt: "Lead",
      parentId: "kampaku",
    });
    const second = agents.createSubAgent({
      slug: "second-lead",
      name: "Second Lead",
      responsibilities: "Lead the second project",
      systemPrompt: "Lead",
      parentId: "kampaku",
    });

    expect(() => assertSubAgentParentScope(agents, first.id, second.id)).toThrow(/hierarchy/);
  });

  it("allows lead to mutate specialists under itself and denies sibling-branch deletes", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-authorization-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const agents = new AgentStore(db);
    const lead = agents.createSubAgent({
      slug: "project-lead",
      name: "Project Lead",
      responsibilities: "Lead the project",
      systemPrompt: "Lead",
      parentId: "kampaku",
    });
    const specialist = agents.createSubAgent({
      slug: "project-qa",
      name: "Project QA",
      responsibilities: "Own QA",
      systemPrompt: "QA",
      parentId: lead.id,
    });
    const otherLead = agents.createSubAgent({
      slug: "other-lead",
      name: "Other Lead",
      responsibilities: "Other",
      systemPrompt: "Other",
      parentId: "kampaku",
    });

    expect(() => assertSubAgentMutationTargetScope(agents, lead.id, specialist.slug)).not.toThrow();
    expect(() => assertSubAgentMutationTargetScope(agents, specialist.id, lead.slug)).toThrow(/hierarchy/);
    expect(() => assertSubAgentMutationTargetScope(agents, otherLead.id, specialist.slug)).toThrow(/hierarchy/);
    expect(() => assertSubAgentMutationTargetScope(agents, lead.id, "kampaku")).toThrow(/kampaku/i);
  });
});
