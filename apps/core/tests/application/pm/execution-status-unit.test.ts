import { describe, it, expect, vi } from "vitest";
import {
  getRuntimeStatus,
  resolveExecutionPhase,
  executionPhaseLabel,
  enrichWorkItemExecution,
} from "../../../src/application/pm/execution-status.js";
import type { Store } from "../../../src/persistence/store.js";
import type { WorkItemRecord } from "../../../src/persistence/pm-store.js";
import type { JobRecord } from "../../../src/persistence/store.js";

describe("execution-status", () => {
  describe("getRuntimeStatus", () => {
    it("aggregates all status counts", () => {
      const mockStore = {
        listWorkers: vi.fn().mockReturnValue([{ id: "w1" }, { id: "w2" }]),
        countJobsByStatus: vi.fn((status) => {
          if (status === "queued") return 5;
          if (status === "running") return 2;
          if (status === "leased") return 3;
          if (status === "expired") return 1;
          return 0;
        }),
        listExpiredActiveJobs: vi.fn().mockReturnValue([{ id: "j1" }]),
      } as unknown as Store;

      const status = getRuntimeStatus(mockStore);

      expect(status).toEqual({
        workersOnline: 2,
        queuedJobs: 5,
        runningJobs: 5,
        zombieJobs: 2,
      });
    });

    it("handles no workers", () => {
      const mockStore = {
        listWorkers: vi.fn().mockReturnValue([]),
        countJobsByStatus: vi.fn().mockReturnValue(0),
        listExpiredActiveJobs: vi.fn().mockReturnValue([]),
      } as unknown as Store;

      const status = getRuntimeStatus(mockStore);

      expect(status.workersOnline).toBe(0);
    });

    it("sums running and leased for runningJobs", () => {
      const mockStore = {
        listWorkers: vi.fn().mockReturnValue([]),
        countJobsByStatus: vi.fn((status) => {
          if (status === "running") return 3;
          if (status === "leased") return 7;
          return 0;
        }),
        listExpiredActiveJobs: vi.fn().mockReturnValue([]),
      } as unknown as Store;

      const status = getRuntimeStatus(mockStore);

      expect(status.runningJobs).toBe(10);
    });

    it("sums expired active and expired status for zombieJobs", () => {
      const mockStore = {
        listWorkers: vi.fn().mockReturnValue([]),
        countJobsByStatus: vi.fn((status) => (status === "expired" ? 4 : 0)),
        listExpiredActiveJobs: vi.fn().mockReturnValue([{}, {}]),
      } as unknown as Store;

      const status = getRuntimeStatus(mockStore);

      expect(status.zombieJobs).toBe(6);
    });
  });

  describe("resolveExecutionPhase", () => {
    const mockWorkItem = (overrides: Partial<WorkItemRecord> = {}): WorkItemRecord => ({
      id: "wi-1",
      projectId: "proj-1",
      title: "Test",
      status: "todo",
      priority: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    });

    const mockJob = (status: JobRecord["status"]): JobRecord => ({
      id: "job-1",
      taskId: "task-1",
      status,
      capabilities: [],
      input: {},
      idempotencyKey: "key-1",
      createdAt: new Date().toISOString(),
    });

    it("returns done when work item status is done", () => {
      const result = resolveExecutionPhase(mockWorkItem({ status: "done" }));
      expect(result).toBe("done");
    });

    it("returns failed when work item status is blocked", () => {
      const result = resolveExecutionPhase(mockWorkItem({ status: "blocked" }));
      expect(result).toBe("failed");
    });

    it("returns idle when no jobId and status not in_progress", () => {
      const result = resolveExecutionPhase(mockWorkItem({ status: "todo", jobId: undefined }));
      expect(result).toBe("idle");
    });

    it("returns queued when status is in_progress but no job provided", () => {
      const result = resolveExecutionPhase(mockWorkItem({ status: "in_progress", jobId: "job-1" }));
      expect(result).toBe("queued");
    });

    it("returns idle when status is not in_progress and no job provided", () => {
      const result = resolveExecutionPhase(mockWorkItem({ status: "todo", jobId: "job-1" }));
      expect(result).toBe("idle");
    });

    it("returns queued when job status is queued", () => {
      const result = resolveExecutionPhase(
        mockWorkItem({ jobId: "job-1" }),
        mockJob("queued")
      );
      expect(result).toBe("queued");
    });

    it("returns running when job status is leased", () => {
      const result = resolveExecutionPhase(
        mockWorkItem({ jobId: "job-1" }),
        mockJob("leased")
      );
      expect(result).toBe("running");
    });

    it("returns running when job status is running", () => {
      const result = resolveExecutionPhase(
        mockWorkItem({ jobId: "job-1" }),
        mockJob("running")
      );
      expect(result).toBe("running");
    });

    it("returns done when job status is succeeded", () => {
      const result = resolveExecutionPhase(
        mockWorkItem({ jobId: "job-1" }),
        mockJob("succeeded")
      );
      expect(result).toBe("done");
    });

    it("returns failed when job status is expired", () => {
      const result = resolveExecutionPhase(
        mockWorkItem({ jobId: "job-1" }),
        mockJob("expired")
      );
      expect(result).toBe("failed");
    });

    it("returns failed when job status is failed", () => {
      const result = resolveExecutionPhase(
        mockWorkItem({ jobId: "job-1" }),
        mockJob("failed")
      );
      expect(result).toBe("failed");
    });
  });

  describe("executionPhaseLabel", () => {
    it("returns Queued for queued", () => {
      expect(executionPhaseLabel("queued")).toBe("Queued");
    });

    it("returns Running for running", () => {
      expect(executionPhaseLabel("running")).toBe("Running");
    });

    it("returns Done for done", () => {
      expect(executionPhaseLabel("done")).toBe("Done");
    });

    it("returns Failed for failed", () => {
      expect(executionPhaseLabel("failed")).toBe("Failed");
    });

    it("returns empty string for idle", () => {
      expect(executionPhaseLabel("idle")).toBe("");
    });
  });

  describe("enrichWorkItemExecution", () => {
    const mockWorkItem: WorkItemRecord = {
      id: "wi-1",
      projectId: "proj-1",
      title: "Test",
      status: "in_progress",
      priority: 1,
      jobId: "job-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("enriches work item with execution data when job exists", () => {
      const mockJob = {
        id: "job-1",
        status: "running",
      };

      const mockStore = {
        getJob: vi.fn().mockReturnValue(mockJob),
      } as unknown as Store;

      const result = enrichWorkItemExecution(mockWorkItem, mockStore);

      expect(result).toMatchObject({
        id: "wi-1",
        jobStatus: "running",
        executionPhase: "running",
        executionLabel: "Running",
      });
      expect(mockStore.getJob).toHaveBeenCalledWith("job-1");
    });

    it("enriches work item without job when jobId is null", () => {
      const workItem = { ...mockWorkItem, jobId: undefined };

      const mockStore = {
        getJob: vi.fn(),
      } as unknown as Store;

      const result = enrichWorkItemExecution(workItem, mockStore);

      expect(result).toMatchObject({
        id: "wi-1",
        executionPhase: "queued",
        executionLabel: "Queued",
      });
      expect(result.jobStatus).toBeUndefined();
      expect(mockStore.getJob).not.toHaveBeenCalled();
    });

    it("enriches work item when job not found", () => {
      const mockStore = {
        getJob: vi.fn().mockReturnValue(undefined),
      } as unknown as Store;

      const result = enrichWorkItemExecution(mockWorkItem, mockStore);

      expect(result.executionPhase).toBe("queued");
      expect(result.jobStatus).toBeUndefined();
    });
  });
});
