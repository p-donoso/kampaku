import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkItemEvidencePanel } from "@/components/work-items/work-item-detail-tabs";
import type { WorkItemEvidence } from "@/lib/types";

/**
 * Suite 16, journey 7, on the panel itself:
 *
 * > A done item exposes its evidence, and at least one evidence record names the criterion it covers.
 *
 * The panel is the surface that journey is driven on, so the lock is on what it renders from the record Core
 * returns — the criterion **id** (the handle every clearing surface takes), the record's own `subject` (for a
 * check, the check's name), the tool that produced it, and how the record got to that criterion. The last one
 * matters and is why this file exists: `recorded` is the job's own claim and `matched` is Core's reading, and a
 * panel that showed one as the other would be more confident than the product.
 */
describe("WorkItemEvidencePanel", () => {
  const matched: WorkItemEvidence = {
    criteria: [
      {
        id: "ac-1",
        text: "make check exits 0 and the output lists the report path",
        records: [
          {
            jobId: "1234abcd-0000-4000-8000-000000000000",
            kind: "check",
            subject: "make check",
            passed: true,
            observedAt: "2026-11-04T12:00:00.000Z",
            sourceTool: "run_check",
            attribution: "matched",
          },
        ],
      },
      { id: "ac-2", text: "The report names every statistic it prints", records: [] },
    ],
    unkeyed: [],
    jobs: [
      {
        id: "1234abcd-0000-4000-8000-000000000000",
        status: "succeeded",
        checks: [{ name: "test", passed: true }],
        filesChanged: ["report.md"],
        finishedAt: "2026-11-04T12:00:01.000Z",
      },
    ],
  };

  it("renders each criterion with its id, and the record that evidences it with the check that produced it", () => {
    render(<WorkItemEvidencePanel evidence={matched} />);

    expect(screen.getByTestId("work-item-evidence")).toBeInTheDocument();
    // The criterion's own id, beside its text: the axis the closure and verification commands take.
    expect(screen.getByText("ac-1")).toBeInTheDocument();
    expect(screen.getByText(/make check exits 0/)).toBeInTheDocument();
    // The record: the check's name, the tool, and how it got here.
    expect(screen.getByTestId("criterion-ac-1")).toHaveTextContent("make check");
    expect(screen.getByTestId("criterion-ac-1")).toHaveTextContent("via run_check");
    expect(screen.getByTestId("attribution-matched")).toHaveTextContent("matched by check");
    // The job's own check outcome and the file it wrote.
    expect(screen.getByTestId("job-check-test")).toHaveTextContent("passed");
    expect(screen.getByText("report.md")).toBeInTheDocument();
  });

  it("says so when a criterion has no evidence, instead of rendering it as met", () => {
    render(<WorkItemEvidencePanel evidence={matched} />);
    expect(screen.getByTestId("criterion-ac-2")).toHaveTextContent("No evidence record names this criterion.");
  });

  it("reports the job's own link as the job's, not as Core's reading", () => {
    render(
      <WorkItemEvidencePanel
        evidence={{
          ...matched,
          criteria: [
            {
              ...matched.criteria[0]!,
              records: [{ ...matched.criteria[0]!.records[0]!, attribution: "recorded" }],
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("attribution-recorded")).toHaveTextContent("named by the job");
    expect(screen.queryByTestId("attribution-matched")).not.toBeInTheDocument();
  });

  it("keeps a record that names no criterion visible rather than dropping it", () => {
    render(
      <WorkItemEvidencePanel
        evidence={{
          ...matched,
          unkeyed: [
            {
              jobId: "1234abcd-0000-4000-8000-000000000001",
              kind: "artifact",
              subject: "deploy to production",
              passed: true,
              observedAt: "2026-11-04T12:00:02.000Z",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Evidence naming no criterion")).toBeInTheDocument();
    expect(screen.getByText("deploy to production")).toBeInTheDocument();
  });

  it("says there is no read at all when the item carries none", () => {
    render(<WorkItemEvidencePanel />);
    expect(screen.getByText("No evidence read for this item.")).toBeInTheDocument();
  });
});
