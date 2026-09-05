import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProjectForm } from "./create-project-form";

const { refresh, submitIntent } = vi.hoisted(() => ({
  refresh: vi.fn(),
  submitIntent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", () => ({ submitIntent }));

describe("CreateProjectForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    submitIntent.mockReset();
  });

  it("enables submission only after the user enters an intent and sends trimmed text", async () => {
    const user = userEvent.setup();
    submitIntent.mockResolvedValue({});
    render(<CreateProjectForm />);

    const input = screen.getByRole("textbox", { name: /new project/i });
    const submit = screen.getByRole("button", { name: /submit intent/i });
    expect(submit).toBeDisabled();

    await user.type(input, "  Build an accessible dashboard  ");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(submitIntent).toHaveBeenCalledWith({
        intent: "Build an accessible dashboard",
        createMissingAgents: true,
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(input).toHaveValue("");
  });

  it("shows the service error and keeps the intent so the user can retry", async () => {
    const user = userEvent.setup();
    submitIntent.mockRejectedValue(new Error("Core offline"));
    render(<CreateProjectForm />);

    const input = screen.getByRole("textbox", { name: /new project/i });
    await user.click(input);
    await user.paste("My project");
    await user.click(screen.getByRole("button", { name: /submit intent/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Core offline");
    expect(input).toHaveValue("My project");
    expect(refresh).not.toHaveBeenCalled();
  });
});
