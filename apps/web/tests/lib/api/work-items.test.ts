import { describe, it, expect, vi, beforeEach } from "vitest";
import * as workItemsApi from "@/lib/api/work-items";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  fetchJson: vi.fn(),
  getBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

describe("work-items API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getReportingStatus fetches reporting status", async () => {
    const mockData = { needsReport: true };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.getReportingStatus("w1", { agentSlug: "test" });

    expect(client.fetchJson).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/work-items/w1/reporting-status"),
    );
    expect(result).toEqual(mockData);
  });

  it("createWorkItem creates new work item", async () => {
    const mockData = { id: "w2", title: "New Work" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.createWorkItem("proj1", {
      title: "New Work",
      description: "Description",
    });

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/projects/proj1/work-items",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("getWorkItemDetail fetches work item detail", async () => {
    const mockData = { id: "w1", title: "Work 1", status: "backlog" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.getWorkItemDetail("w1");

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/work-items/w1");
    expect(result).toEqual(mockData);
  });

  it("updateWorkItem updates work item", async () => {
    const mockData = { id: "w1", title: "Updated" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.updateWorkItem("w1", { title: "Updated" });

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/work-items/w1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(result).toEqual(mockData);
  });

  it("deleteWorkItem deletes work item", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);

    await workItemsApi.deleteWorkItem("w1");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/work-items/w1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("executeWorkItem dispatches work item", async () => {
    const mockData = { workItemId: "w1", goalId: "g1", jobId: "j1", objective: "test", repositoryRole: "primary" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.executeWorkItem("w1");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/work-items/w1/execute",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("retryWorkItem retries failed work item", async () => {
    const mockData = { workItemId: "w1", goalId: "g1", jobId: "j2", objective: "retry", repositoryRole: "primary" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.retryWorkItem("w1");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/work-items/w1/retry",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("pauseJobRun pauses job", async () => {
    const mockData = { id: "j1", status: "paused" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.pauseJobRun("j1");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/jobs/j1/pause",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("resumeJobRun resumes job", async () => {
    const mockData = { id: "j1", status: "running" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.resumeJobRun("j1");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/jobs/j1/resume",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("cancelJobRun cancels job", async () => {
    const mockData = { jobId: "j1", status: "cancelled" };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.cancelJobRun("j1");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/jobs/j1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockData);
  });

  it("getWorkItemJournal fetches journal", async () => {
    const mockData = { entries: [{ id: "e1", type: "comment" }] };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await workItemsApi.getWorkItemJournal("w1");

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/work-items/w1/journal");
    expect(result).toEqual(mockData);
  });
});
