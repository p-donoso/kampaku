import { describe, expect, it } from "vitest";
import { getWorkItemDisplayStatus } from "./work-item-status";

describe("getWorkItemDisplayStatus", () => {
  it("prefers running execution over in_progress workflow status", () => {
    const display = getWorkItemDisplayStatus({
      status: "in_progress",
      executionPhase: "running",
      jobStatus: "running",
    });
    expect(display.label).toBe("Running");
  });

  it("shows failed when blocked", () => {
    expect(
      getWorkItemDisplayStatus({
        status: "blocked",
        executionPhase: "failed",
        jobStatus: "failed",
      }).label,
    ).toBe("Failed");
  });

  it("shows workflow status when idle", () => {
    expect(
      getWorkItemDisplayStatus({
        status: "todo",
        executionPhase: "idle",
      }).label,
    ).toBe("Todo");
  });
});
