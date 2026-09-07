import { describe, it, expect } from "vitest";
import { formatJobStatus, formatWorkItemPhase } from "../../src/cli/output.js";

describe("formatJobStatus", () => {
  it("formats queued status", () => {
    expect(formatJobStatus("queued")).toBe("Queued");
  });

  it("formats running status", () => {
    expect(formatJobStatus("running")).toBe("Running");
  });

  it("formats completed status", () => {
    expect(formatJobStatus("completed")).toBe("Completed");
  });

  it("formats failed status", () => {
    expect(formatJobStatus("failed")).toBe("Failed");
  });

  it("formats cancelled status", () => {
    expect(formatJobStatus("cancelled")).toBe("Cancelled");
  });

  it("returns unknown status as-is", () => {
    expect(formatJobStatus("unknown-status")).toBe("unknown-status");
  });

  it("handles empty string", () => {
    expect(formatJobStatus("")).toBe("");
  });
});

describe("formatWorkItemPhase", () => {
  it("formats idle phase", () => {
    expect(formatWorkItemPhase("idle")).toBe("Idle");
  });

  it("formats queued phase", () => {
    expect(formatWorkItemPhase("queued")).toBe("Queued");
  });

  it("formats running phase", () => {
    expect(formatWorkItemPhase("running")).toBe("Running");
  });

  it("formats done phase", () => {
    expect(formatWorkItemPhase("done")).toBe("Done");
  });

  it("formats failed phase", () => {
    expect(formatWorkItemPhase("failed")).toBe("Failed");
  });

  it("handles undefined phase", () => {
    expect(formatWorkItemPhase(undefined)).toBe("—");
  });

  it("returns unknown phase as-is", () => {
    expect(formatWorkItemPhase("unknown")).toBe("unknown");
  });
});
