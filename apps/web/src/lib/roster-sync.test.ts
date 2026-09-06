import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyRosterSync, ROSTER_SYNC_EVENT } from "./roster-sync";

describe("roster-sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("notifies listeners when an entity is deleted", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(ROSTER_SYNC_EVENT, handler);

    notifyRosterSync({ action: "deleted", entityType: "agent", slug: "web-lead" });

    await waitFor(() =>
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { action: "deleted", entityType: "agent", slug: "web-lead" },
        }),
      ),
    );

    window.removeEventListener(ROSTER_SYNC_EVENT, handler);
    expect(user).toBeDefined();
  });
});
