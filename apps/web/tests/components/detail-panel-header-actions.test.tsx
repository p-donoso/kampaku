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
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("alert", vi.fn());
  });

  it("deletes, marks the entity as removed, closes the panel and refreshes rosters", async () => {
    const user = userEvent.setup();
    deleteAgent.mockResolvedValue(undefined);
    renderActions();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteAgent).toHaveBeenCalledWith("web-lead"));
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
    renderActions();

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteButton);
    expect(deleteButton).toBeDisabled();

    resolveDelete?.();
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
