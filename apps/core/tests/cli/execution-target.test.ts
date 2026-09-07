import { describe, it, expect, vi } from "vitest";
import { isUuid, resolveExecutionTarget } from "../../src/cli/execution-target.js";
import type { CoreClient } from "../../src/client/core-client.js";

describe("isUuid", () => {
  it("returns true for valid UUIDs", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
    expect(isUuid("6ba7b814-9dad-21d1-80b4-00c04fd430c8")).toBe(true);
    expect(isUuid("6ba7b815-9dad-31d1-80b4-00c04fd430c8")).toBe(true);
    expect(isUuid("6ba7b816-9dad-41d1-80b4-00c04fd430c8")).toBe(true);
    expect(isUuid("6ba7b817-9dad-51d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("returns true for UUIDs with uppercase", () => {
    expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(isUuid("6BA7B810-9DAD-11D1-80B4-00C04FD430C8")).toBe(true);
  });

  it("returns true for UUIDs with whitespace", () => {
    expect(isUuid("  550e8400-e29b-41d4-a716-446655440000  ")).toBe(true);
    expect(isUuid("\n6ba7b810-9dad-11d1-80b4-00c04fd430c8\n")).toBe(true);
  });

  it("returns false for invalid UUIDs", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("550e8400-e29b-41d4-a716")).toBe(false);
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000-extra")).toBe(false);
    expect(isUuid("")).toBe(false);
  });

  it("returns false for UUIDs with wrong version digit", () => {
    expect(isUuid("550e8400-e29b-61d4-a716-446655440000")).toBe(false);
    expect(isUuid("550e8400-e29b-71d4-a716-446655440000")).toBe(false);
  });

  it("returns false for UUIDs with wrong variant digit", () => {
    expect(isUuid("550e8400-e29b-41d4-0716-446655440000")).toBe(false);
    expect(isUuid("550e8400-e29b-41d4-c716-446655440000")).toBe(false);
    expect(isUuid("550e8400-e29b-41d4-f716-446655440000")).toBe(false);
  });

  it("returns false for UUIDs with non-hex characters", () => {
    expect(isUuid("550e8400-e29g-41d4-a716-446655440000")).toBe(false);
    expect(isUuid("550e8400-e29b-41d4-a716-44665544000z")).toBe(false);
  });

  it("returns false for UUIDs with wrong format", () => {
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
    expect(isUuid("550e8400-e29b41d4-a716-446655440000")).toBe(false);
  });
});

describe("resolveExecutionTarget", () => {
  it("resolves job when job exists", async () => {
    const mockClient = {
      getJob: vi.fn().mockResolvedValue({ id: "job-123", status: "queued" }),
      getGoalAudit: vi.fn(),
    } as unknown as CoreClient;

    const result = await resolveExecutionTarget(mockClient, "job-123");

    expect(result).toEqual({ kind: "job", jobId: "job-123" });
    expect(mockClient.getJob).toHaveBeenCalledWith("job-123");
    expect(mockClient.getGoalAudit).not.toHaveBeenCalled();
  });

  it("resolves goal when job not found but goal exists", async () => {
    const mockClient = {
      getJob: vi.fn().mockRejectedValue(new Error("Not found")),
      getGoalAudit: vi.fn().mockResolvedValue({ id: "goal-456", status: "approved" }),
    } as unknown as CoreClient;

    const result = await resolveExecutionTarget(mockClient, "goal-456");

    expect(result).toEqual({ kind: "goal", goalId: "goal-456" });
    expect(mockClient.getJob).toHaveBeenCalledWith("goal-456");
    expect(mockClient.getGoalAudit).toHaveBeenCalledWith("goal-456");
  });

  it("resolves unknown when neither job nor goal exists", async () => {
    const mockClient = {
      getJob: vi.fn().mockRejectedValue(new Error("Not found")),
      getGoalAudit: vi.fn().mockRejectedValue(new Error("Not found")),
    } as unknown as CoreClient;

    const result = await resolveExecutionTarget(mockClient, "unknown-789");

    expect(result).toEqual({ kind: "unknown", id: "unknown-789" });
    expect(mockClient.getJob).toHaveBeenCalledWith("unknown-789");
    expect(mockClient.getGoalAudit).toHaveBeenCalledWith("unknown-789");
  });

  it("trims whitespace from id", async () => {
    const mockClient = {
      getJob: vi.fn().mockResolvedValue({ id: "job-123" }),
      getGoalAudit: vi.fn(),
    } as unknown as CoreClient;

    const result = await resolveExecutionTarget(mockClient, "  job-123  ");

    expect(result.jobId).toBe("job-123");
    expect(mockClient.getJob).toHaveBeenCalledWith("job-123");
  });

  it("prioritizes job over goal when both exist", async () => {
    const mockClient = {
      getJob: vi.fn().mockResolvedValue({ id: "id-123", status: "queued" }),
      getGoalAudit: vi.fn().mockResolvedValue({ id: "id-123", status: "approved" }),
    } as unknown as CoreClient;

    const result = await resolveExecutionTarget(mockClient, "id-123");

    expect(result).toEqual({ kind: "job", jobId: "id-123" });
    expect(mockClient.getGoalAudit).not.toHaveBeenCalled();
  });
});
