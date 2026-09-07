import { describe, it, expect } from "vitest";
import { getWorkItemDisplayStatus } from "@/lib/work-item-status";
import type { WorkItemRecord } from "@/lib/types";

describe("getWorkItemDisplayStatus", () => {
  const mockItem = (overrides: Partial<Pick<WorkItemRecord, "status" | "executionPhase" | "jobStatus">> = {}): Pick<WorkItemRecord, "status" | "executionPhase" | "jobStatus"> => ({
    status: "todo",
    executionPhase: undefined,
    jobStatus: undefined,
    ...overrides,
  });

  describe("execution phase states", () => {
    it("returns queued status with pulse", () => {
      const result = getWorkItemDisplayStatus(mockItem({ executionPhase: "queued" }));
      expect(result).toEqual({
        label: "Queued",
        tone: "warning",
        pulse: true,
        title: undefined,
      });
    });

    it("returns queued status with job status title", () => {
      const result = getWorkItemDisplayStatus(mockItem({ executionPhase: "queued", jobStatus: "pending" }));
      expect(result).toEqual({
        label: "Queued",
        tone: "warning",
        pulse: true,
        title: "Job: pending",
      });
    });

    it("returns running status with pulse", () => {
      const result = getWorkItemDisplayStatus(mockItem({ executionPhase: "running" }));
      expect(result).toEqual({
        label: "Running",
        tone: "info",
        pulse: true,
        title: undefined,
      });
    });

    it("returns running status with job status title", () => {
      const result = getWorkItemDisplayStatus(mockItem({ executionPhase: "running", jobStatus: "active" }));
      expect(result).toEqual({
        label: "Running",
        tone: "info",
        pulse: true,
        title: "Job: active",
      });
    });

    it("returns failed status when phase is failed", () => {
      const result = getWorkItemDisplayStatus(mockItem({ executionPhase: "failed" }));
      expect(result).toEqual({
        label: "Failed",
        tone: "error",
        title: undefined,
      });
    });

    it("returns failed status with job status title", () => {
      const result = getWorkItemDisplayStatus(mockItem({ executionPhase: "failed", jobStatus: "error" }));
      expect(result).toEqual({
        label: "Failed",
        tone: "error",
        title: "Job: error",
      });
    });

    it("returns done status when phase is done", () => {
      const result = getWorkItemDisplayStatus(mockItem({ executionPhase: "done" }));
      expect(result).toEqual({
        label: "Done",
        tone: "success",
      });
    });
  });

  describe("workflow status states", () => {
    it("returns failed status when status is blocked", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "blocked" }));
      expect(result).toEqual({
        label: "Failed",
        tone: "error",
        title: undefined,
      });
    });

    it("returns failed status for blocked with job status", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "blocked", jobStatus: "blocked" }));
      expect(result).toEqual({
        label: "Failed",
        tone: "error",
        title: "Job: blocked",
      });
    });

    it("returns done status when status is done", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "done" }));
      expect(result).toEqual({
        label: "Done",
        tone: "success",
      });
    });

    it("returns backlog label", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "backlog" }));
      expect(result).toEqual({
        label: "Backlog",
        tone: "default",
      });
    });

    it("returns todo label", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "todo" }));
      expect(result).toEqual({
        label: "Todo",
        tone: "default",
      });
    });

    it("returns in_progress label", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "in_progress" }));
      expect(result).toEqual({
        label: "In progress",
        tone: "default",
      });
    });

    it("returns cancelled label with default tone", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "cancelled" }));
      expect(result).toEqual({
        label: "Cancelled",
        tone: "default",
      });
    });

    it("returns unknown status as-is", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "unknown-status" }));
      expect(result).toEqual({
        label: "unknown-status",
        tone: "default",
      });
    });
  });

  describe("priority between phase and status", () => {
    it("prefers done phase over in_progress status", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "in_progress", executionPhase: "done" }));
      expect(result.label).toBe("Done");
      expect(result.tone).toBe("success");
    });

    it("prefers failed phase over todo status", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "todo", executionPhase: "failed" }));
      expect(result.label).toBe("Failed");
      expect(result.tone).toBe("error");
    });

    it("prefers running phase over done status", () => {
      const result = getWorkItemDisplayStatus(mockItem({ status: "done", executionPhase: "running" }));
      expect(result.label).toBe("Running");
      expect(result.tone).toBe("info");
    });
  });
});
