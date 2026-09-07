import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { notifyRosterSync, useRosterSyncListener, ROSTER_SYNC_EVENT } from "@/lib/roster-sync";
import { renderHook } from "@testing-library/react";

describe("notifyRosterSync", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches custom event with deleted action", () => {
    const detail = { action: "deleted" as const, entityType: "agent" as const, slug: "test-agent" };
    notifyRosterSync(detail);

    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ROSTER_SYNC_EVENT,
        detail,
      })
    );
  });

  it("dispatches custom event with refresh action", () => {
    const detail = { action: "refresh" as const };
    notifyRosterSync(detail);

    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ROSTER_SYNC_EVENT,
        detail,
      })
    );
  });

  it("dispatches event for project deletion", () => {
    const detail = { action: "deleted" as const, entityType: "project" as const, slug: "test-project" };
    notifyRosterSync(detail);

    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ROSTER_SYNC_EVENT,
        detail,
      })
    );
  });

  it("dispatches event for skill deletion", () => {
    const detail = { action: "deleted" as const, entityType: "skill" as const, slug: "test-skill" };
    notifyRosterSync(detail);

    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ROSTER_SYNC_EVENT,
        detail,
      })
    );
  });

  it("dispatches event for task deletion", () => {
    const detail = { action: "deleted" as const, entityType: "task" as const, slug: "test-task" };
    notifyRosterSync(detail);

    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ROSTER_SYNC_EVENT,
        detail,
      })
    );
  });

  it("does nothing when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    const detail = { action: "refresh" as const };

    expect(() => notifyRosterSync(detail)).not.toThrow();
  });
});

describe("useRosterSyncListener", () => {
  let eventListeners: Record<string, EventListener[]>;

  beforeEach(() => {
    eventListeners = {};
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: EventListener) => {
        if (eventListeners[event]) {
          eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
        }
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers event listener on mount", () => {
    const onSync = vi.fn();
    renderHook(() => useRosterSyncListener(onSync));

    expect(window.addEventListener).toHaveBeenCalledWith(ROSTER_SYNC_EVENT, expect.any(Function));
  });

  it("removes event listener on unmount", () => {
    const onSync = vi.fn();
    const { unmount } = renderHook(() => useRosterSyncListener(onSync));

    const handler = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1];
    unmount();

    expect(window.removeEventListener).toHaveBeenCalledWith(ROSTER_SYNC_EVENT, handler);
  });

  it("calls onSync when event is dispatched", () => {
    const onSync = vi.fn();
    renderHook(() => useRosterSyncListener(onSync));

    const detail = { action: "refresh" as const };
    const event = new CustomEvent(ROSTER_SYNC_EVENT, { detail });
    eventListeners[ROSTER_SYNC_EVENT][0](event);

    expect(onSync).toHaveBeenCalledWith(detail);
  });

  it("calls onSync with deleted action detail", () => {
    const onSync = vi.fn();
    renderHook(() => useRosterSyncListener(onSync));

    const detail = { action: "deleted" as const, entityType: "agent" as const, slug: "test" };
    const event = new CustomEvent(ROSTER_SYNC_EVENT, { detail });
    eventListeners[ROSTER_SYNC_EVENT][0](event);

    expect(onSync).toHaveBeenCalledWith(detail);
  });
});
