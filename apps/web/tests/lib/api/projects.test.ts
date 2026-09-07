import { describe, it, expect, vi, beforeEach } from "vitest";
import * as projectsApi from "@/lib/api/projects";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  fetchJson: vi.fn(),
  getBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

describe("projects API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listProjects fetches all projects", async () => {
    const mockData = { projects: [{ id: "p1", slug: "test" }] };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.listProjects();

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/projects");
    expect(result).toEqual(mockData);
  });

  it("getProjectsRoster fetches roster tree", async () => {
    const mockData = { projects: [{ id: "p1", children: [] }] };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.getProjectsRoster();

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/projects/roster");
    expect(result).toEqual(mockData);
  });

  it("getProjectOverview fetches project details", async () => {
    const mockData = { project: { id: "p1", slug: "test" }, workItems: [] };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.getProjectOverview("test");

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/projects/test");
    expect(result).toEqual(mockData);
  });

  it("playProject starts execution", async () => {
    const mockData = { autoExecute: true, nextWorkItemId: "w1" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.playProject("test");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/projects/test/play",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("pauseProject pauses execution", async () => {
    const mockData = { autoExecute: false };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.pauseProject("test");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/projects/test/pause",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("getProjectExecution checks execution status", async () => {
    const mockData = {
      autoExecute: true,
      gated: false,
      gate: { gated: false },
    };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.getProjectExecution("test");

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/projects/test/execution");
    expect(result).toEqual(mockData);
  });

  it("updateProject updates project metadata", async () => {
    const mockData = { id: "p1", name: "Updated Name" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.updateProject("test", { name: "Updated Name" });

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/projects/test",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Updated Name" }),
      }),
    );
    expect(result).toEqual(mockData);
  });

  it("getProjectJournal fetches journal entries", async () => {
    const mockData = { entries: [{ id: "j1", summary: "Event" }] };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.getProjectJournal("p1", "?limit=10");

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/projects/p1/journal?limit=10");
    expect(result).toEqual(mockData);
  });

  it("getGoalAudit fetches goal audit log", async () => {
    const mockData = { goal: { id: "g1" }, jobs: [] };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.getGoalAudit("g1");

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/goals/g1");
    expect(result).toEqual(mockData);
  });

  it("submitIntent submits decomposition intent", async () => {
    const mockData = { workItemId: "w1" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await projectsApi.submitIntent({
      intent: "Add feature",
      projectSlug: "test",
      granularity: "standard",
    });

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/intents",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          intent: "Add feature",
          projectSlug: "test",
          granularity: "standard",
        }),
      }),
    );
    expect(result).toEqual(mockData);
  });
});
