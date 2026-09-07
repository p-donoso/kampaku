import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportingStatusPanel } from "@/components/work-item-detail-tabs";

const { getReportingStatus } = vi.hoisted(() => ({ getReportingStatus: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getReportingStatus };
});

describe("ReportingStatusPanel", () => {
  beforeEach(() => getReportingStatus.mockReset());

  it("renders ready reporting status and sends shared inputs", async () => {
    getReportingStatus.mockResolvedValue({ readyForClosure: true, missing: [] });
    render(<ReportingStatusPanel workItemId="item-1" projectId="project-1" agentSlug="lead" />);
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
    expect(getReportingStatus).toHaveBeenCalledWith("item-1", { projectId: "project-1", agentSlug: "lead" });
  });

  it("renders missing reporting evidence", async () => {
    getReportingStatus.mockResolvedValue({ readyForClosure: false, missing: ["wiki_sync", "superior_journal"] });
    render(<ReportingStatusPanel workItemId="item-1" projectId="project-1" />);
    await waitFor(() => expect(screen.getByText("Missing: wiki_sync, superior_journal")).toBeInTheDocument());
  });
});
