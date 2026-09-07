// @ts-nocheck
import { describe, it, expect } from "vitest";
import { getWorkItemDisplayStatus } from "@/lib/work-item-status";

describe("getWorkItemDisplayStatus", () => {
  it("returns queued status with pulse", () => {
    const result = getWorkItemDisplayStatus({
      status: "todo",
      executionPhase: "queued",
      jobStatus: "leased",
    });

    expect(result.label).toBe("Queued");
    expect(result.tone).toBe("warning");
    expect(result.pulse).toBe(true);
    expect(result.title).toBe("Job: leased");
  });

  it("returns running status with pulse", () => {
    const result = getWorkItemDisplayStatus({
      status: "in_progress",
      executionPhase: "running",
      jobStatus: "executing",
    });

    expect(result.label).toBe("Running");
    expect(result.tone).toBe("info");
    expect(result.pulse).toBe(true);
    expect(result.title).toBe("Job: executing");
  });

  it("returns failed status for failed phase", () => {
    const result = getWorkItemDisplayStatus({
      status: "in_progress",
      executionPhase: "failed",
      jobStatus: "error",
    });

    expect(result.label).toBe("Failed");
    expect(result.tone).toBe("error");
    expect(result.title).toBe("Job: error");
  });

  it("returns failed status for blocked status", () => {
    const result = getWorkItemDisplayStatus({
      status: "blocked",
      executionPhase: "idle",
    });

    expect(result.label).toBe("Failed");
    expect(result.tone).toBe("error");
  });

  it("returns done status", () => {
    const result = getWorkItemDisplayStatus({
      status: "done",
      executionPhase: "done",
    });

    expect(result.label).toBe("Done");
    expect(result.tone).toBe("success");
  });

  it("returns done for done phase even if status is not done", () => {
    const result = getWorkItemDisplayStatus({
      status: "in_progress",
      executionPhase: "done",
    });

    expect(result.label).toBe("Done");
    expect(result.tone).toBe("success");
  });

  it("returns workflow label for todo status", () => {
    const result = getWorkItemDisplayStatus({
      status: "todo",
      executionPhase: "idle",
    });

    expect(result.label).toBe("Todo");
    expect(result.tone).toBe("default");
  });

  it("returns workflow label for backlog status", () => {
    const result = getWorkItemDisplayStatus({
      status: "backlog",
      executionPhase: "idle",
    });

    expect(result.label).toBe("Backlog");
    expect(result.tone).toBe("default");
  });

  it("returns workflow label for cancelled status", () => {
    const result = getWorkItemDisplayStatus({
      status: "cancelled",
      executionPhase: "idle",
    });

    expect(result.label).toBe("Cancelled");
    expect(result.tone).toBe("default");
  });

  it("returns status as-is for unknown status", () => {
    const result = getWorkItemDisplayStatus({
      status: "unknown_status",
      executionPhase: "idle",
    });

    expect(result.label).toBe("unknown_status");
    expect(result.tone).toBe("default");
  });

  it("handles queued without jobStatus", () => {
    const result = getWorkItemDisplayStatus({
      status: "todo",
      executionPhase: "queued",
    });

    expect(result.label).toBe("Queued");
    expect(result.title).toBeUndefined();
  });

  it("handles running without jobStatus", () => {
    const result = getWorkItemDisplayStatus({
      status: "in_progress",
      executionPhase: "running",
    });

    expect(result.label).toBe("Running");
    expect(result.title).toBeUndefined();
  });
});
