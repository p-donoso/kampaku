import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenWorkOrderForm } from "@/components/projects/open-work-order-form";

/**
 * Suite 16, journey 5, on the form itself:
 *
 * > Intake: open a work order from the UI (create a container) and confirm chat and CLI see it.
 *
 * Before this form the projects page rendered a roster and nothing that could open a container, so the journey
 * could not be driven at all from the browser — the operator's own page could not do the one thing intake is.
 *
 * Two properties are locked, and both are requirements rather than conveniences: the owner is **required** (a
 * container with no accountable lead is not an acceptable intake outcome), and the record rendered after the
 * create is **the one the store returned** — a form that printed its own success sentence could report a create
 * that the platform refused.
 */
const { createProject, notifyRosterSync } = vi.hoisted(() => ({
  createProject: vi.fn(),
  notifyRosterSync: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, createProject };
});
vi.mock("@/lib/roster-sync", () => ({ notifyRosterSync }));

describe("OpenWorkOrderForm", () => {
  beforeEach(() => {
    createProject.mockReset();
    notifyRosterSync.mockReset();
  });

  it("opens the container with the lead and the repository path, and renders the record the store returned", async () => {
    const user = userEvent.setup();
    createProject.mockResolvedValue({
      id: "0b0d0f00-0000-4000-8000-000000000000",
      slug: "textstats",
      name: "Text statistics",
      status: "planning",
      projectLeadAgentId: "lead-1",
      repositories: [],
    });
    const onCreated = vi.fn();
    render(<OpenWorkOrderForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Name", { exact: true }), "Text statistics");
    await user.type(screen.getByLabelText("Slug", { exact: true }), "textstats");
    await user.type(screen.getByLabelText("Project lead slug", { exact: true }), "textstats-lead");
    await user.type(
      screen.getByLabelText("Repository (absolute path or file:// url)", { exact: true }),
      "/home/you/projects/textstats",
    );
    await user.click(screen.getByRole("button", { name: "Open work order" }));

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "Text statistics",
        slug: "textstats",
        repositories: [{ url: "/home/you/projects/textstats", role: "web" }],
        project_lead_slug: "textstats-lead",
      }),
    );
    // The reply is the store's record: its slug and its id, and the fact that the lead was linked.
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("textstats");
    expect(status).toHaveTextContent("0b0d0f00-0000-4000-8000-000000000000");
    expect(status).toHaveTextContent("with its lead linked");
    expect(onCreated).toHaveBeenCalledOnce();
    expect(notifyRosterSync).toHaveBeenCalledWith({ action: "refresh" });
  });

  it("cannot submit without an owner — a container with no accountable lead is not an intake outcome", async () => {
    const user = userEvent.setup();
    render(<OpenWorkOrderForm />);

    await user.type(screen.getByLabelText("Name", { exact: true }), "Text statistics");
    expect(screen.getByRole("button", { name: "Open work order" })).toBeDisabled();

    await user.type(screen.getByLabelText("Project lead slug", { exact: true }), "textstats-lead");
    expect(screen.getByRole("button", { name: "Open work order" })).toBeEnabled();
  });

  it("shows the server's explanation when the create is refused, and keeps the values", async () => {
    const user = userEvent.setup();
    createProject.mockRejectedValue(new Error('Project "textstats" already exists.'));
    render(<OpenWorkOrderForm />);

    await user.type(screen.getByLabelText("Name", { exact: true }), "Text statistics");
    await user.type(screen.getByLabelText("Slug", { exact: true }), "textstats");
    await user.type(screen.getByLabelText("Project lead slug", { exact: true }), "textstats-lead");
    await user.click(screen.getByRole("button", { name: "Open work order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('Project "textstats" already exists.');
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
