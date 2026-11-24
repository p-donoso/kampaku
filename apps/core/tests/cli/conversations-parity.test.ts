import { Command } from "commander";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  formatConversation,
  formatConversationDetail,
  registerConversationCommands,
  resumeCommandFor,
} from "../../src/cli/commands/conversations.js";

/**
 * **The two conversations in the store, without the REST API.**
 *
 * Measured on suite 16 (BOARD F-010): `GET /api/v1/conversations` was the only way to see a conversation, and the only
 * way to know its id — while `kampaku chat` already accepted `--conversation-id` and `--continue`. Listing and resuming
 * were one hand-written `curl` and one copy-paste away from each other, which is the shape of a parity gap: the read
 * exists, the command does not.
 *
 * Driven through a real `Command` against a stub client, not against a formatter alone: the surface that has to exist
 * is the CLI's, and a formatter test would stay green with the command unregistered.
 */
const CONVERSATION = {
  id: "conv-1",
  agentSlug: "kampaku",
  projectId: "project-1",
  title: "Repair the ledger",
  createdAt: "2026-11-23T20:00:00.000Z",
  updatedAt: "2026-11-23T20:10:00.000Z",
};

describe("conversation parity in the CLI (F-010)", () => {
  function programWith(client: Parameters<typeof registerConversationCommands>[1] extends () => infer T ? T : never) {
    const program = new Command();
    program.name("kampaku").exitOverride();
    registerConversationCommands(program, () => client);
    return program;
  }

  it("lists conversations with the command that resumes each one", async () => {
    const listConversations = vi.fn().mockResolvedValue({ conversations: [CONVERSATION] });
    const printed: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line: string) => void printed.push(String(line)));
    try {
      const program = programWith({ listConversations, getConversation: vi.fn() } as never);
      await program.parseAsync(["node", "kampaku", "conversations", "list", "--agent", "kampaku", "--limit", "5"]);
    } finally {
      log.mockRestore();
    }

    expect(listConversations).toHaveBeenCalledWith({ agentSlug: "kampaku", limit: 5 });
    const output = printed.join("\n");
    expect(output).toContain("conv-1");
    expect(output).toContain("Repair the ledger");
    // The id is not a dead end: the resume command is printed beside it.
    expect(output).toContain(`kampaku chat --conversation-id conv-1`);
  });

  it("shows a transcript, and says so when a conversation has no messages", async () => {
    const getConversation = vi.fn().mockResolvedValue({
      conversation: CONVERSATION,
      messages: [
        { id: "m1", role: "user", content: "Bring the ledger to a working state.", createdAt: "2026-11-23T20:01:00.000Z" },
        { id: "m2", role: "assistant", content: "Two defects.\nBoth repaired.", createdAt: "2026-11-23T20:02:00.000Z" },
      ],
    });
    const printed: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line: string) => void printed.push(String(line)));
    try {
      const program = programWith({ listConversations: vi.fn(), getConversation } as never);
      await program.parseAsync(["node", "kampaku", "conversations", "show", "conv-1"]);
    } finally {
      log.mockRestore();
    }

    expect(getConversation).toHaveBeenCalledWith("conv-1");
    const output = printed.join("\n");
    expect(output).toContain("2 message(s)");
    expect(output).toContain("user");
    expect(output).toContain("Bring the ledger to a working state.");
    // A multi-line message keeps its shape rather than being flattened.
    expect(output).toContain("  Both repaired.");
  });

  it("is wired into the kampaku program, so it is reachable as a command", () => {
    // The wiring is one line in `index.ts`, and nothing here can execute the assembled CLI without a build — so the line
    // is asserted where it lives. A module nobody registers is the parity gap this row is about, one level down.
    const index = readFileSync(new URL("../../src/cli/index.ts", import.meta.url), "utf8");
    expect(index).toContain('from "./commands/conversations.js"');
    expect(index).toContain("registerConversationCommands(program)");
  });

  it("names the resume command from the id alone, and does not invent one for an untitled conversation", () => {
    expect(resumeCommandFor("abc")).toBe("kampaku chat --conversation-id abc");
    const lines = formatConversation({ ...CONVERSATION, title: null, projectId: null });
    expect(lines.join("\n")).toContain("(untitled)");
    expect(lines.join("\n")).toContain("no project");
    expect(formatConversationDetail({ ...CONVERSATION, title: null }, []).join("\n")).toContain(
      "no messages recorded",
    );
  });
});
