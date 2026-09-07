import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/persistence/db.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("MemoryStore", () => {
  it("keeps logs and learnings scoped to an agent and searchable across sessions", () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-memory-"));
    dirs.push(dir);
    const { db, sqlite } = createDb(join(dir, "test.db"));
    const store = new MemoryStore(db);
    store.create({ agentId: "agent-a", kind: "log", title: "Deploy API", body: "Changed the health endpoint.", conversationId: "session-1" });
    store.create({ agentId: "agent-a", kind: "learning", title: "Run typecheck", body: "Typecheck before deployment.", relevance: 5, conversationId: "session-2" });
    store.create({ agentId: "agent-b", kind: "log", title: "Private", body: "Must stay isolated." });

    expect(store.list({ agentId: "agent-a" })).toHaveLength(2);
    expect(store.list({ agentId: "agent-a", kind: "learning" })[0]?.title).toBe("Run typecheck");
    expect(store.list({ agentId: "agent-a", query: "health" })[0]?.conversationId).toBe("session-1");
    expect(store.count("agent-a")).toEqual({ logs: 1, learnings: 1 });
    const recalled = store.list({ agentId: "agent-a", query: "health", recordAccess: true });
    expect(recalled[0]?.accessCount).toBe(1);
    expect(recalled[0]?.firstAccessedAt).toBeTruthy();
    expect(recalled[0]?.lastAccessedAt).toBe(recalled[0]?.firstAccessedAt);
    expect(store.list({ agentId: "agent-a", query: "health" })[0]?.accessCount).toBe(1);
    expect(store.list({ agentId: "agent-a", query: "health", recordAccess: true })[0]?.accessCount).toBe(2);
    sqlite.close();
  });
});
