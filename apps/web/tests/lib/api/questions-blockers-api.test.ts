import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  listQuestions,
  listBlockers,
} from "../../../src/lib/api/questions-blockers";

describe("questions-blockers API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listQuestions fetches all questions", async () => {
    const mockQuestions = [{ id: "q-1", question: "Test?" }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ questions: mockQuestions }),
    });

    const result = await listQuestions();
    expect(result.questions).toEqual(mockQuestions);
  });

  it("listBlockers fetches all blockers", async () => {
    const mockBlockers = [{ id: "b-1", reason: "Blocked" }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ blockers: mockBlockers }),
    });

    const result = await listBlockers();
    expect(result.blockers).toEqual(mockBlockers);
  });
});
