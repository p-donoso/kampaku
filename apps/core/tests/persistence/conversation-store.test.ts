import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/persistence/db.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";

/**
 * `listConversations` must apply the agent filter BEFORE the limit.
 *
 * This test fails against the original implementation, which ordered by `updatedAt`,
 * applied `limit`, and only then filtered by agent slug. With that order,
 * `{ agentSlug: "b", limit: 1 }` reads the single most recent conversation overall and
 * returns nothing when it belongs to another agent — so a caller asking for "the latest
 * conversation of b" is told there is none. `kampaku chat --continue` relies on this query.
 */
describe("ConversationStore.listConversations", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("returns the latest conversation of the requested agent, not the latest overall", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-conversations-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const conversations = new ConversationStore(db);

    const older = conversations.createConversation({ agentSlug: "b", projectId: undefined });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = conversations.createConversation({ agentSlug: "a", projectId: undefined });

    // "a" is the most recent conversation overall, so a naive implementation returns it
    // (or nothing) when asked for the latest of "b".
    const latestOfB = conversations.listConversations({ agentSlug: "b", limit: 1 });
    expect(latestOfB).toHaveLength(1);
    expect(latestOfB[0]?.id).toBe(older.id);

    const latestOfA = conversations.listConversations({ agentSlug: "a", limit: 1 });
    expect(latestOfA).toHaveLength(1);
    expect(latestOfA[0]?.id).toBe(newer.id);
  });

  it("still honours the limit and returns most-recent-first", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-conversations-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const conversations = new ConversationStore(db);

    const first = conversations.createConversation({ agentSlug: "kampaku", projectId: undefined });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = conversations.createConversation({ agentSlug: "kampaku", projectId: undefined });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = conversations.createConversation({ agentSlug: "kampaku", projectId: undefined });

    const all = conversations.listConversations({ agentSlug: "kampaku" });
    expect(all.map((item) => item.id)).toEqual([third.id, second.id, first.id]);

    const limited = conversations.listConversations({ agentSlug: "kampaku", limit: 2 });
    expect(limited.map((item) => item.id)).toEqual([third.id, second.id]);
  });
});
