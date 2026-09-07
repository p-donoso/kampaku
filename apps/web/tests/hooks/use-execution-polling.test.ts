// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useExecutionPolling } from "@/hooks/use-execution-polling";
import type { WorkItemTreeNode, ProjectOverview, RuntimeStatus } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getProjectOverview: vi.fn(),
  getRuntimeStatus: vi.fn(),
}));

describe("useExecutionPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const mockItem = (overrides = {}): WorkItemTreeNode => ({
    item: {
      id: "item-1",
      title: "Test",
      status: "todo",
      executionPhase: "idle",
      ...overrides,
    },
    children: [],
  });

  it("does not poll when disabled", () => {
    const onUpdate = vi.fn();
    const items = [mockItem()];

    renderHook(() =>
      useExecutionPolling({
        projectSlug: "test-project",
        items,
        onUpdate,
        enabled: false,
      })
    );

    vi.advanceTimersByTime(5000);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not poll when no projectSlug provided", () => {
    const onUpdate = vi.fn();
    const items = [mockItem({ executionPhase: "running" })];

    renderHook(() =>
      useExecutionPolling({
        items,
        onUpdate,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(5000);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not poll when no active executions", () => {
    const onUpdate = vi.fn();
    const items = [mockItem({ executionPhase: "idle", status: "done" })];

    renderHook(() =>
      useExecutionPolling({
        projectSlug: "test-project",
        items,
        onUpdate,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(5000);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("polls when item is queued", async () => {
    const { getProjectOverview, getRuntimeStatus } = await import("@/lib/api");
    const mockOverview = { slug: "test", name: "Test" } as ProjectOverview;
    const mockRuntime = { workers: [] } as RuntimeStatus;

    vi.mocked(getProjectOverview).mockResolvedValue(mockOverview);
    vi.mocked(getRuntimeStatus).mockResolvedValue(mockRuntime);

    const onUpdate = vi.fn();
    const items = [mockItem({ executionPhase: "queued" })];

    renderHook(() =>
      useExecutionPolling({
        projectSlug: "test-project",
        items,
        onUpdate,
        enabled: true,
        intervalMs: 1000,
      })
    );

    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(getProjectOverview).toHaveBeenCalledWith("test-project");
    });
  });

  it("polls when item is running", async () => {
    const { getProjectOverview, getRuntimeStatus } = await import("@/lib/api");
    const mockOverview = { slug: "test", name: "Test" } as ProjectOverview;
    const mockRuntime = { workers: [] } as RuntimeStatus;

    vi.mocked(getProjectOverview).mockResolvedValue(mockOverview);
    vi.mocked(getRuntimeStatus).mockResolvedValue(mockRuntime);

    const onUpdate = vi.fn();
    const items = [mockItem({ executionPhase: "running" })];

    renderHook(() =>
      useExecutionPolling({
        projectSlug: "test-project",
        items,
        onUpdate,
        enabled: true,
        intervalMs: 1000,
      })
    );

    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(getRuntimeStatus).toHaveBeenCalled();
    });
  });

  it("polls when item status is in_progress", async () => {
    const { getProjectOverview, getRuntimeStatus } = await import("@/lib/api");
    const mockOverview = { slug: "test", name: "Test" } as ProjectOverview;
    const mockRuntime = { workers: [] } as RuntimeStatus;

    vi.mocked(getProjectOverview).mockResolvedValue(mockOverview);
    vi.mocked(getRuntimeStatus).mockResolvedValue(mockRuntime);

    const onUpdate = vi.fn();
    const items = [mockItem({ status: "in_progress" })];

    renderHook(() =>
      useExecutionPolling({
        projectSlug: "test-project",
        items,
        onUpdate,
        enabled: true,
        intervalMs: 1000,
      })
    );

    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("ignores API errors silently", async () => {
    const { getProjectOverview } = await import("@/lib/api");
    vi.mocked(getProjectOverview).mockRejectedValue(new Error("Network error"));

    const onUpdate = vi.fn();
    const items = [mockItem({ executionPhase: "running" })];

    renderHook(() =>
      useExecutionPolling({
        projectSlug: "test-project",
        items,
        onUpdate,
        enabled: true,
        intervalMs: 1000,
      })
    );

    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      expect(getProjectOverview).toHaveBeenCalled();
    });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("cleans up interval on unmount", () => {
    const onUpdate = vi.fn();
    const items = [mockItem({ executionPhase: "running" })];

    const { unmount } = renderHook(() =>
      useExecutionPolling({
        projectSlug: "test-project",
        items,
        onUpdate,
        enabled: true,
      })
    );

    unmount();
    vi.advanceTimersByTime(5000);
  });
});
