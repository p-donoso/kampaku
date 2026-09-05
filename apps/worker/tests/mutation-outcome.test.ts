import { describe, expect, it } from "vitest";
import {
  evaluateWorkerCompletion,
  isMutationTool,
  parseToolMutationOk,
  shouldFailIncompleteMutations,
  shouldFailMissingDeliverables,
  WORKER_INCOMPLETE_MUTATIONS_CODE,
  WORKER_NO_DELIVERABLES_CODE,
} from "../src/tools/mutation-outcome.js";

describe("mutation-outcome", () => {
  it("detects failed mutation-only jobs", () => {
    expect(isMutationTool("write_file")).toBe(true);
    expect(parseToolMutationOk('{"ok":false,"error":"ENOENT"}')).toBe(false);
    expect(parseToolMutationOk('{"ok":true,"path":"ci.yml"}')).toBe(true);
    expect(parseToolMutationOk("file list output")).toBeUndefined();
    expect(shouldFailIncompleteMutations(3, 0)).toBe(true);
    expect(shouldFailIncompleteMutations(1, 1)).toBe(false);
    expect(shouldFailIncompleteMutations(0, 0)).toBe(false);
  });

  it("detects jobs that finish without repository deliverables", () => {
    expect(shouldFailMissingDeliverables(true, 0)).toBe(true);
    expect(shouldFailMissingDeliverables(true, 1)).toBe(false);
    expect(shouldFailMissingDeliverables(false, 0)).toBe(false);
    expect(evaluateWorkerCompletion({ requiresDeliverables: true, failedMutations: 0, successfulMutations: 0 })?.code).toBe(
      WORKER_NO_DELIVERABLES_CODE,
    );
    expect(evaluateWorkerCompletion({ requiresDeliverables: true, failedMutations: 2, successfulMutations: 0 })?.code).toBe(
      WORKER_INCOMPLETE_MUTATIONS_CODE,
    );
  });
});
