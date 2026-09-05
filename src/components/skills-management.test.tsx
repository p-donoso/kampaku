import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsManagement } from "./skills-management";

const { listSkills } = vi.hoisted(() => ({
  listSkills: vi.fn(),
}));

const openSkill = vi.fn();

vi.mock("@/components/panel-provider", () => ({
  usePanels: () => ({ openSkill, openAgent: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  listSkills,
  createSkill: vi.fn(),
}));

const sampleSkills = [
  {
    slug: "qa-testing",
    name: "QA Testing",
    description: "Test planning",
    capabilities: ["code.agent"],
    tools: ["code-agent"],
    promptFragment: "QA",
    assignedAgentSlugs: ["qa"],
  },
  {
    slug: "docs-writer",
    name: "Docs Writer",
    description: "Write docs",
    capabilities: ["code.agent"],
    tools: ["code-agent"],
    promptFragment: "Docs",
    assignedAgentSlugs: [],
  },
];

describe("SkillsManagement", () => {
  beforeEach(() => {
    listSkills.mockReset();
    openSkill.mockReset();
    listSkills.mockResolvedValue({ skills: sampleSkills });
  });

  it("renders skills from initial data", () => {
    render(<SkillsManagement initialSkills={sampleSkills} />);
    expect(screen.getByText("QA Testing")).toBeInTheDocument();
    expect(screen.getByText("Docs Writer")).toBeInTheDocument();
    expect(screen.getByText("qa")).toBeInTheDocument();
  });

  it("filters skills by search", async () => {
    const user = userEvent.setup();
    render(<SkillsManagement initialSkills={sampleSkills} />);

    await user.type(screen.getByPlaceholderText("Search skills…"), "docs");
    expect(screen.queryByText("QA Testing")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Docs Writer/i })).toBeInTheDocument();
  });

  it("opens skill panel on row click", async () => {
    const user = userEvent.setup();
    render(<SkillsManagement initialSkills={sampleSkills} />);

    await user.click(screen.getByRole("button", { name: /QA Testing/i }));
    expect(openSkill).toHaveBeenCalledWith("qa-testing");
  });

  it("shows error when refresh fails", async () => {
    listSkills.mockRejectedValue(new Error("Core offline"));
    render(<SkillsManagement initialSkills={[]} />);

    await waitFor(() => {
      expect(screen.getByText("Core offline")).toBeInTheDocument();
    });
  });
});
