import { describe, it, expect, vi } from "vitest";
import {
  executionPhaseLabel,
  resolveExecutionPhase,
  getRuntimeStatus,
} from "../../../src/application/pm/execution-status.js";
import type { WorkItemRecord } from "../../../src/persistence/pm-store.js";
import type { JobRecord, Store } from "../../../src/persistence/store.js";

describe("execution-status", () => {
  const mockItem = (overrides: Partial<WorkItemRecord> = {}): WorkItemRecord => ({
    id: "item-1",
    projectId: "proj-1",
    title: "Test Item",
    status: "todo",
    priority: 1,
    dependsOn: [],
    complexity: "M",
    acceptanceCriteria: [],
    parentId: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
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

    it("returns empty for idle", () => {
      expect(executionPhaseLabel("idle")).toBe("");
    });
  });

  describe("resolveExecutionPhase", () => {
    it("returns done for done status", () => {
      expect(resolveExecutionPhase(mockItem({ status: "done" }))).toBe("done");
    });

    it("returns failed for blocked status", () => {
      expect(resolveExecutionPhase(mockItem({ status: "blocked" }))).toBe("failed");
    });

    it("returns idle when no job and not in_progress", () => {
      expect(resolveExecutionPhase(mockItem({ status: "todo", jobId: undefined }))).toBe("idle");
    });

    it("returns queued when in_progress without job", () => {
      expect(resolveExecutionPhase(mockItem({ status: "in_progress", jobId: "job-1" }))).toBe("queued");
    });

    it("returns queued for queued job", () => {
      const job: JobRecord = {
        id: "job-1",
        workItemId: "item-1",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(resolveExecutionPhase(mockItem({ jobId: "job-1" }), job)).toBe("queued");
    });

    it("returns running for leased job", () => {
      const job: JobRecord = {
        id: "job-1",
        workItemId: "item-1",
        status: "leased",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(resolveExecutionPhase(mockItem({ jobId: "job-1" }), job)).toBe("running");
    });

    it("returns running for running job", () => {
      const job: JobRecord = {
        id: "job-1",
        workItemId: "item-1",
        status: "running",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(resolveExecutionPhase(mockItem({ jobId: "job-1" }), job)).toBe("running");
    });

    it("returns done for succeeded job", () => {
      const job: JobRecord = {
        id: "job-1",
        workItemId: "item-1",
        status: "succeeded",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(resolveExecutionPhase(mockItem({ jobId: "job-1" }), job)).toBe("done");
    });

    it("returns failed for failed job", () => {
      const job: JobRecord = {
        id: "job-1",
        workItemId: "item-1",
        status: "failed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(resolveExecutionPhase(mockItem({ jobId: "job-1" }), job)).toBe("failed");
    });
  });

  describe("getRuntimeStatus", () => {
    it("computes runtime status from store", () => {
      const mockStore: Partial<Store> = {
        listWorkers: vi.fn().mockReturnValue([{ id: "w1" }, { id: "w2" }]),
        countJobsByStatus: vi.fn((status: string) => {
          if (status === "queued") return 5;
          if (status === "running") return 2;
          if (status === "leased") return 1;
          if (status === "expired") return 0;
          return 0;
        }),
        listExpiredActiveJobs: vi.fn().mockReturnValue([]),
      };

      const status = getRuntimeStatus(mockStore as Store);

      expect(status.workersOnline).toBe(2);
      expect(status.queuedJobs).toBe(5);
      expect(status.runningJobs).toBe(3);
      expect(status.zombieJobs).toBe(0);
    });

    it("counts zombie jobs", () => {
      const mockStore: Partial<Store> = {
        listWorkers: vi.fn().mockReturnValue([]),
        countJobsByStatus: vi.fn((status: string) => {
          if (status === "expired") return 2;
          return 0;
        }),
        listExpiredActiveJobs: vi.fn().mockReturnValue([{ id: "j1" }, { id: "j2" }]),
      };

      const status = getRuntimeStatus(mockStore as Store);

      expect(status.zombieJobs).toBe(4);
    });
  });
});
