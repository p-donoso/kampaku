import { describe, it, expect, vi } from "vitest";
import {
  expireZombieJobs,
  countZombieJobs,
  LEASE_EXPIRED_CODE,
} from "../../../src/application/pm/queue-hygiene.js";
import type { Store } from "../../../src/persistence/store.js";

describe("queue-hygiene", () => {
  describe("expireZombieJobs", () => {
    it("expires all expired active jobs", () => {
      const mockJobs = [
        { id: "job-1", leaseId: "lease-1", status: "running" },
        { id: "job-2", leaseId: "lease-2", status: "running" },
      ];

      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue(mockJobs),
        appendJobLog: vi.fn(),
        submitJobResult: vi.fn((result) => ({
          jobId: result.jobId,
          status: result.status,
          finishedAt: result.finishedAt,
        })),
      } as unknown as Store;

      const results = expireZombieJobs(mockStore);

      expect(results).toHaveLength(2);
      expect(mockStore.appendJobLog).toHaveBeenCalledTimes(2);
      expect(mockStore.submitJobResult).toHaveBeenCalledTimes(2);

      expect(mockStore.submitJobResult).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-1",
          status: "expired",
          error: {
            code: LEASE_EXPIRED_CODE,
            message: expect.stringContaining("lease expired"),
          },
        })
      );
    });

    it("uses fallback leaseId when null", () => {
      const mockJob = { id: "job-1", leaseId: null, status: "running" };

      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue([mockJob]),
        appendJobLog: vi.fn(),
        submitJobResult: vi.fn((result) => result),
      } as unknown as Store;

      expireZombieJobs(mockStore);

      expect(mockStore.submitJobResult).toHaveBeenCalledWith(
        expect.objectContaining({
          leaseId: "expired-job-1",
        })
      );
    });

    it("appends log message for each expired job", () => {
      const mockJobs = [
        { id: "job-1", leaseId: "lease-1" },
        { id: "job-2", leaseId: "lease-2" },
      ];

      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue(mockJobs),
        appendJobLog: vi.fn(),
        submitJobResult: vi.fn((result) => result),
      } as unknown as Store;

      expireZombieJobs(mockStore);

      expect(mockStore.appendJobLog).toHaveBeenCalledWith(
        "job-1",
        "Lease expired; zombie job cancelled."
      );
      expect(mockStore.appendJobLog).toHaveBeenCalledWith(
        "job-2",
        "Lease expired; zombie job cancelled."
      );
    });

    it("returns empty array when no expired jobs", () => {
      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue([]),
        appendJobLog: vi.fn(),
        submitJobResult: vi.fn(),
      } as unknown as Store;

      const results = expireZombieJobs(mockStore);

      expect(results).toEqual([]);
      expect(mockStore.appendJobLog).not.toHaveBeenCalled();
      expect(mockStore.submitJobResult).not.toHaveBeenCalled();
    });
  });

  describe("countZombieJobs", () => {
    it("counts active expired plus expired status jobs", () => {
      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue([
          { id: "job-1" },
          { id: "job-2" },
        ]),
        countJobsByStatus: vi.fn().mockReturnValue(3),
      } as unknown as Store;

      const count = countZombieJobs(mockStore);

      expect(count).toBe(5);
      expect(mockStore.countJobsByStatus).toHaveBeenCalledWith("expired");
    });

    it("returns 0 when no zombie jobs", () => {
      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue([]),
        countJobsByStatus: vi.fn().mockReturnValue(0),
      } as unknown as Store;

      const count = countZombieJobs(mockStore);

      expect(count).toBe(0);
    });

    it("counts only expired active when no expired status", () => {
      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue([{ id: "job-1" }]),
        countJobsByStatus: vi.fn().mockReturnValue(0),
      } as unknown as Store;

      const count = countZombieJobs(mockStore);

      expect(count).toBe(1);
    });

    it("counts only expired status when no expired active", () => {
      const mockStore = {
        listExpiredActiveJobs: vi.fn().mockReturnValue([]),
        countJobsByStatus: vi.fn().mockReturnValue(2),
      } as unknown as Store;

      const count = countZombieJobs(mockStore);

      expect(count).toBe(2);
    });
  });
});
