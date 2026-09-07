import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  listAgents,
  getAgentsRoster,
  getAgent,
  getAgentDashboard,
  getAgentMemories,
  updateAgent,
  deleteAgent,
} from "../../../src/lib/api/agents";

describe("agents API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listAgents fetches agent tree", async () => {
    const mockTree = [{ slug: "kampaku", children: [] }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ tree: mockTree }),
    });

    const result = await listAgents();
    expect(result.tree).toEqual(mockTree);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/agents?tree=true",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("getAgentsRoster fetches roster with metrics", async () => {
    const mockRoster = [{ slug: "kampaku", workload: 0 }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ tree: mockRoster }),
    });

    const result = await getAgentsRoster();
    expect(result.tree).toEqual(mockRoster);
  });

  it("getAgent fetches single agent by slug", async () => {
    const mockAgent = { slug: "test-agent", name: "Test Agent" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAgent,
    });

    const result = await getAgent("test-agent");
    expect(result).toEqual(mockAgent);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/agents/test-agent",
      expect.any(Object)
    );
  });

  it("getAgentDashboard fetches dashboard metrics", async () => {
    const mockDashboard = { activeJobs: 0, queuedJobs: 0 };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockDashboard,
    });

    const result = await getAgentDashboard("test-agent");
    expect(result).toEqual(mockDashboard);
  });

  it("getAgentMemories fetches memories with limit", async () => {
    const mockMemories = { memories: [], counts: { logs: 0, learnings: 0 } };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockMemories,
    });

    const result = await getAgentMemories("test-agent");
    expect(result).toEqual(mockMemories);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/agents/test-agent/memories?limit=100",
      expect.any(Object)
    );
  });

  it("updateAgent sends PATCH request", async () => {
    const mockUpdated = { slug: "test-agent", name: "Updated Name" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    });

    const result = await updateAgent("test-agent", { name: "Updated Name" });
    expect(result).toEqual(mockUpdated);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/agents/test-agent",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("deleteAgent sends DELETE request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "",
    });

    await deleteAgent("test-agent");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/agents/test-agent",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("throws error on failed request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    await expect(getAgent("nonexistent")).rejects.toThrow();
  });
});
