import { describe, it, expect } from "vitest";
import {
  WORKER_INCOMPLETE_MUTATIONS_CODE,
  WORKER_NO_DELIVERABLES_CODE,
  isMutationTool,
  parseToolMutationOk,
  resolveRequiresDeliverables,
  shouldFailIncompleteMutations,
  shouldFailMissingDeliverables,
  evaluateWorkerCompletion,
} from "../src/tools/mutation-outcome.js";

describe("mutation outcome utilities", () => {
  describe("error codes", () => {
    it("defines incomplete mutations code", () => {
      expect(WORKER_INCOMPLETE_MUTATIONS_CODE).toBe("WORKER_INCOMPLETE_MUTATIONS");
    });

    it("defines no deliverables code", () => {
      expect(WORKER_NO_DELIVERABLES_CODE).toBe("WORKER_NO_DELIVERABLES");
    });
  });

  describe("isMutationTool", () => {
    it("returns true for write_file", () => {
      expect(isMutationTool("write_file")).toBe(true);
    });

    it("returns true for replace_in_file", () => {
      expect(isMutationTool("replace_in_file")).toBe(true);
    });

    it("returns false for read-only tools", () => {
      expect(isMutationTool("read_file")).toBe(false);
      expect(isMutationTool("list_files")).toBe(false);
      expect(isMutationTool("check")).toBe(false);
    });
  });

  describe("parseToolMutationOk", () => {
    it("parses successful tool output", () => {
      expect(parseToolMutationOk('{"ok": true}')).toBe(true);
    });

    it("parses failed tool output", () => {
      expect(parseToolMutationOk('{"ok": false}')).toBe(false);
    });

    it("returns undefined for non-JSON output", () => {
      expect(parseToolMutationOk("plain text")).toBeUndefined();
    });

    it("returns undefined when ok field is missing", () => {
      expect(parseToolMutationOk('{"status": "success"}')).toBeUndefined();
    });

    it("returns undefined when ok is not boolean", () => {
      expect(parseToolMutationOk('{"ok": "yes"}')).toBeUndefined();
    });
  });

  describe("resolveRequiresDeliverables", () => {
    it("returns true when requiresDeliverables is undefined", () => {
      expect(resolveRequiresDeliverables({})).toBe(true);
    });

    it("returns true when requiresDeliverables is explicitly true", () => {
      expect(resolveRequiresDeliverables({ requiresDeliverables: true })).toBe(true);
    });

    it("returns false when requiresDeliverables is explicitly false", () => {
      expect(resolveRequiresDeliverables({ requiresDeliverables: false })).toBe(false);
    });
  });

  describe("shouldFailIncompleteMutations", () => {
    it("returns true when all mutations failed", () => {
      expect(shouldFailIncompleteMutations(3, 0)).toBe(true);
    });

    it("returns false when at least one mutation succeeded", () => {
      expect(shouldFailIncompleteMutations(2, 1)).toBe(false);
    });

    it("returns false when no mutations were attempted", () => {
      expect(shouldFailIncompleteMutations(0, 0)).toBe(false);
    });
  });

  describe("shouldFailMissingDeliverables", () => {
    it("returns true when deliverables required but none written", () => {
      expect(shouldFailMissingDeliverables(true, 0)).toBe(true);
    });

    it("returns false when deliverables not required", () => {
      expect(shouldFailMissingDeliverables(false, 0)).toBe(false);
    });

    it("returns false when deliverables exist", () => {
      expect(shouldFailMissingDeliverables(true, 1)).toBe(false);
    });
  });

  describe("evaluateWorkerCompletion", () => {
    it("returns incomplete mutations error when all mutations failed", () => {
      const result = evaluateWorkerCompletion({
        failedMutations: 3,
        successfulMutations: 0,
      });

      expect(result?.code).toBe("WORKER_INCOMPLETE_MUTATIONS");
      expect(result?.message).toContain("All file write/replace attempts failed");
    });

    it("returns no deliverables error when none written", () => {
      const result = evaluateWorkerCompletion({
        requiresDeliverables: true,
        failedMutations: 0,
        successfulMutations: 0,
      });

      expect(result?.code).toBe("WORKER_NO_DELIVERABLES");
      expect(result?.message).toContain("without writing or updating any files");
    });

    it("returns undefined when mutations succeeded", () => {
      const result = evaluateWorkerCompletion({
        failedMutations: 1,
        successfulMutations: 2,
      });

      expect(result).toBeUndefined();
    });

    it("returns undefined when deliverables not required and none written", () => {
      const result = evaluateWorkerCompletion({
        requiresDeliverables: false,
        failedMutations: 0,
        successfulMutations: 0,
      });

      expect(result).toBeUndefined();
    });
  });
});

