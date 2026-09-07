import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentDetailContent } from "@/components/agents/agent-detail-panel";
import { ApiError } from "@/lib/api-errors";

const { onEntityNotFound, getAgent } = vi.hoisted(() => ({
  onEntityNotFound: vi.fn(),
  getAgent: vi.fn(),
}));

vi.mock("@/components/panels/panel-provider", () => ({
  usePanels: () => ({ close: vi.fn(), onEntityNotFound }),
}));
vi.mock("@/components/panels/detail-panel-context", () => ({
  useDetailPanel: () => ({ editing: false, registerHandlers: vi.fn() }),
}));
vi.mock("@/components/agents/agent-detail-tabs", () => ({
  AgentDetailTabs: () => <div>tabs</div>,
}));
vi.mock("@/lib/api", () => ({
  getAgent,
  getAgentDashboard: vi.fn().mockResolvedValue({ total: 0, byStatus: {} }),
  getAgentMemories: vi.fn().mockResolvedValue({ memories: [], counts: { logs: 0, learnings: 0 } }),
  updateAgent: vi.fn(),
}));

describe("AgentDetailContent", () => {
  beforeEach(() => {
    onEntityNotFound.mockReset();
    getAgent.mockReset();
  });

  it("closes the panel when the agent was deleted", async () => {
    getAgent.mockRejectedValue(new ApiError("missing", 404, "/api/v1/agents/web-lead"));
    render(<AgentDetailContent slug="web-lead" />);

    await waitFor(() => expect(onEntityNotFound).toHaveBeenCalledWith("agent", "web-lead"));
  });

  it("shows a friendly error instead of raw API paths", async () => {
    getAgent.mockRejectedValue(
      new ApiError("The server is unavailable right now. Try again in a few seconds.", 503, "/api/v1/agents/web-lead"),
    );
    render(<AgentDetailContent slug="web-lead" />);

    expect(
      await screen.findByText("The server is unavailable right now. Try again in a few seconds."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\/api\/v1\/agents/)).not.toBeInTheDocument();
  });
});
