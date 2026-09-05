import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDangerZone } from "./settings-danger-zone";

const { refresh, resetBootstrap, resetAllData } = vi.hoisted(() => ({
  refresh: vi.fn(),
  resetBootstrap: vi.fn(),
  resetAllData: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", () => ({ resetBootstrap, resetAllData }));

describe("SettingsDangerZone", () => {
  beforeEach(() => {
    refresh.mockReset();
    resetBootstrap.mockReset();
    resetAllData.mockReset();
  });

  it("keeps learnings by default when bootstrap is reset", async () => {
    resetBootstrap.mockResolvedValue({ createdAgents: ["manager"], inheritedLearnings: 2 });
    render(<SettingsDangerZone />);

    fireEvent.click(screen.getByRole("button", { name: "Reset bootstrap" }));
    expect(screen.getByRole("checkbox", { name: /Keep learnings/ })).toBeChecked();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "RESET BOOTSTRAP" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));

    await waitFor(() => expect(resetBootstrap).toHaveBeenCalledWith(true));
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("2 learnings were inherited");
  });

  it("requires the full confirmation phrase before resetting everything", () => {
    render(<SettingsDangerZone />);
    fireEvent.click(screen.getByRole("button", { name: "Reset everything" }));
    const confirm = screen.getByRole("button", { name: "Confirm reset" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "RESET" } });
    expect(confirm).toBeDisabled();
    expect(resetAllData).not.toHaveBeenCalled();
  });
});
