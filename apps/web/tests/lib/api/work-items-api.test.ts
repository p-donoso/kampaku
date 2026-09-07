import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getReportingStatus,
  createWorkItem,
  getWorkItemDetail,
  updateWorkItem,
  deleteWorkItem,
  executeWorkItem,
  retryWorkItem,
  pauseJobRun,
  resumeJobRun,
  cancelJobRun,
  getWorkItemJournal,
} from "../../../src/lib/api/work-items";

describe("work-items API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getReportingStatus fetches reporting obligations", async () => {
    const mockStatus = { requiresReport: true };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const result = await getReportingStatus("item-1");
    expect(result).toEqual(mockStatus);
  });

  it("createWorkItem posts new work item", async () => {
    const mockItem = { id: "item-new", title: "New Task" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockItem,
    });

    const result = await createWorkItem("proj-1", { title: "New Task" });
    expect(result).toEqual(mockItem);
  });

  it("getWorkItemDetail fetches work item details", async () => {
    const mockDetail = { id: "item-1", title: "Test", status: "pending" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockDetail,
    });

    const result = await getWorkItemDetail("item-1");
    expect(result).toEqual(mockDetail);
  });

  it("updateWorkItem sends PATCH request", async () => {
    const mockUpdated = { id: "item-1", title: "Updated" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    });

    const result = await updateWorkItem("item-1", { title: "Updated" });
    expect(result).toEqual(mockUpdated);
  });

  it("deleteWorkItem sends DELETE request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    await deleteWorkItem("item-1");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/work-items/item-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("executeWorkItem dispatches work item", async () => {
    const mockExecution = { workItemId: "item-1", goalId: "goal-1", jobId: "job-1" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockExecution,
    });

    const result = await executeWorkItem("item-1");
    expect(result.workItemId).toBe("item-1");
  });

  it("retryWorkItem retries failed item", async () => {
    const mockRetry = { workItemId: "item-1", goalId: "goal-1", jobId: "job-2" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockRetry,
    });

    const result = await retryWorkItem("item-1");
    expect(result.jobId).toBe("job-2");
  });

  it("pauseJobRun pauses running job", async () => {
    const mockPaused = { id: "job-1", status: "paused" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockPaused,
    });

    const result = await pauseJobRun("job-1");
    expect(result.status).toBe("paused");
  });

  it("resumeJobRun resumes paused job", async () => {
    const mockResumed = { id: "job-1", status: "running" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResumed,
    });

    const result = await resumeJobRun("job-1");
    expect(result.status).toBe("running");
  });

  it("cancelJobRun cancels job", async () => {
    const mockCancelled = { jobId: "job-1", status: "cancelled" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockCancelled,
    });

    const result = await cancelJobRun("job-1");
    expect(result.status).toBe("cancelled");
  });

  it("getWorkItemJournal fetches journal entries", async () => {
    const mockJournal = { entries: [{ id: "entry-1", message: "Test" }] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockJournal,
    });

    const result = await getWorkItemJournal("item-1");
    expect(result.entries).toHaveLength(1);
  });
});
