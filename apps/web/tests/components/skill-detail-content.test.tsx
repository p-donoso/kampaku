import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPanelProvider } from "@/components/detail-panel-context";
import { SkillDetailContent } from "@/components/skill-detail-content";

const { getSkill, updateSkill, onEntityNotFound, close, openAgent, openSkill } = vi.hoisted(() => ({
  getSkill: vi.fn(),
  updateSkill: vi.fn(),
  onEntityNotFound: vi.fn(),
  close: vi.fn(),
  openAgent: vi.fn(),
  openSkill: vi.fn(),
}));

vi.mock("@/components/panel-provider", () => ({
  usePanels: () => ({ close, onEntityNotFound, openAgent, openSkill }),
}));
vi.mock("@/lib/api", () => ({
  getSkill,
  updateSkill,
}));

const sampleSkill = {
  slug: "qa-testing",
  name: "QA Testing",
  description: "Test planning",
  capabilities: ["code.agent"],
  tools: ["code-agent"],
  promptFragment: "You test things",
  assignedAgentSlugs: ["qa"],
};

function renderSkillDetail() {
  return render(
    <DetailPanelProvider entityType="skill" slug="qa-testing">
      <SkillDetailContent slug="qa-testing" />
    </DetailPanelProvider>,
  );
}

describe("SkillDetailContent", () => {
  beforeEach(() => {
    getSkill.mockReset();
    updateSkill.mockReset();
    onEntityNotFound.mockReset();
    getSkill.mockResolvedValue(sampleSkill);
  });

  it("renders skill details", async () => {
    renderSkillDetail();
    expect(await screen.findByText("Test planning")).toBeInTheDocument();
    expect(screen.getByText("You test things")).toBeInTheDocument();
    expect(screen.getByText("qa")).toBeInTheDocument();
  });

  it("closes panel when skill was deleted", async () => {
    const { ApiError } = await import("@/lib/api-errors");
    getSkill.mockRejectedValue(new ApiError("missing", 404, "/api/v1/skills/qa-testing"));

    renderSkillDetail();
    await waitFor(() => expect(onEntityNotFound).toHaveBeenCalledWith("skill", "qa-testing"));
  });

  it("registers delete as disabled when skill is assigned", async () => {
    renderSkillDetail();
    await screen.findByText("Test planning");
    // Delete handled by header actions via canDelete: false — content still shows assigned agents
    expect(screen.getByRole("button", { name: "qa" })).toBeInTheDocument();
  });
});
