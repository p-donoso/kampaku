import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPanelProvider } from "@/components/panels/detail-panel-context";
import { DetailPanelHeaderActions } from "@/components/panels/detail-panel-header-actions";

const { refresh, close, markEntityDeleted, deleteAgent } = vi.hoisted(() => ({
  refresh: vi.fn(),
  close: vi.fn(),
  markEntityDeleted: vi.fn(),
  deleteAgent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/panels/panel-provider", () => ({
  usePanels: () => ({ close, markEntityDeleted }),
}));
vi.mock("@/lib/api", () => ({ deleteAgent, deleteProject: vi.fn() }));

function renderActions() {
  return render(
    <DetailPanelProvider entityType="agent" slug="web-lead">
      <DetailPanelHeaderActions />
    </DetailPanelProvider>,
  );
}

describe("DetailPanelHeaderActions", () => {
  beforeEach(() => {
    refresh.mockReset();
    close.mockReset();
    markEntityDeleted.mockReset();
    deleteAgent.mockReset();
    vi.stubGlobal("alert", vi.fn());
  });

  it("deletes, marks the entity as removed, closes the panel and refreshes rosters", async () => {
    const user = userEvent.setup();
    // The gate is two steps inside the client: the call is handed the confirmer, and it asks with the
    // **server's** consequence. Approving it here is what the operator does in the browser.
    deleteAgent.mockImplementation(async (_slug: string, confirm: (consequence: string) => boolean) => {
      confirm("This deletes agent \"web-lead\" and removes it from every hierarchy it belongs to.");
    });
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    renderActions();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteAgent).toHaveBeenCalled());
    expect(deleteAgent.mock.calls[0]?.[0]).toBe("web-lead");
    // BOARD F-043: the operator is asked with the server's recorded consequence, not a generic sentence.
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('deletes agent "web-lead"'),
    );
    expect(markEntityDeleted).toHaveBeenCalledWith("agent", "web-lead");
    expect(close).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows a spinner while deletion is in progress", async () => {
    const user = userEvent.setup();
    let resolveDelete: (() => void) | undefined;
    deleteAgent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderActions();

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteButton);
    expect(deleteButton).toBeDisabled();

    resolveDelete?.();
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
