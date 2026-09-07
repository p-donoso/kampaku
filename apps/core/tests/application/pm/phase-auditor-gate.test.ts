import { describe, it, expect } from "vitest";
import {
  buildPhaseGateRoutingReason,
  parsePhaseGateRoutingReason,
  isPhaseGateWorkItem,
  isStubAuditText,
  PHASE_GATE_ROUTING_PREFIX,
} from "../../../src/application/pm/phase-auditor-gate.js";
import type { WorkItemRecord } from "../../../src/persistence/pm-store.js";

describe("phase-auditor-gate", () => {
  const mockItem = (overrides: Partial<WorkItemRecord> = {}): WorkItemRecord => ({
    id: "item-1",
    projectId: "proj-1",
    title: "Test Item",
    status: "todo",
    priority: 1,
    dependsOn: [],
    complexity: "M",
    acceptanceCriteria: [],
    parentId: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  describe("buildPhaseGateRoutingReason", () => {
    it("builds routing reason with prefix", () => {
      const reason = buildPhaseGateRoutingReason("phase-123");
      expect(reason).toBe(`${PHASE_GATE_ROUTING_PREFIX}phase-123`);
    });
  });

  describe("parsePhaseGateRoutingReason", () => {
    it("parses valid routing reason", () => {
      const reason = `${PHASE_GATE_ROUTING_PREFIX}phase-456`;
      const result = parsePhaseGateRoutingReason(reason);
      expect(result).toEqual({ phaseWorkItemId: "phase-456" });
    });

    it("returns null for non-phase-gate reason", () => {
      expect(parsePhaseGateRoutingReason("other_reason")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(parsePhaseGateRoutingReason(undefined)).toBeNull();
    });

    it("returns null for empty phase ID", () => {
      const reason = PHASE_GATE_ROUTING_PREFIX;
      expect(parsePhaseGateRoutingReason(reason)).toBeNull();
    });

    it("trims whitespace from phase ID", () => {
      const reason = `${PHASE_GATE_ROUTING_PREFIX}  phase-789  `;
      const result = parsePhaseGateRoutingReason(reason);
      expect(result?.phaseWorkItemId).toBe("phase-789");
    });
  });

  describe("isPhaseGateWorkItem", () => {
    it("returns true for phase gate work item", () => {
      const item = mockItem({
        routingReason: buildPhaseGateRoutingReason("phase-1"),
      });
      expect(isPhaseGateWorkItem(item)).toBe(true);
    });

    it("returns false for non-phase-gate item", () => {
      const item = mockItem({ routingReason: "other_reason" });
      expect(isPhaseGateWorkItem(item)).toBe(false);
    });

    it("returns false when routingReason undefined", () => {
      const item = mockItem();
      expect(isPhaseGateWorkItem(item)).toBe(false);
    });
  });

  describe("isStubAuditText", () => {
    it("returns true for short text", () => {
      expect(isStubAuditText("Short audit text")).toBe(true);
    });

    it("returns true for text under 400 chars", () => {
      const text = "A".repeat(300);
      expect(isStubAuditText(text)).toBe(true);
    });

    it("returns true when verdict missing", () => {
      const text = "A".repeat(500) + "\nScore: 8/10";
      expect(isStubAuditText(text)).toBe(true);
    });

    it("returns true when score missing", () => {
      const text = "A".repeat(500) + "\nVerdict: Approved";
      expect(isStubAuditText(text)).toBe(true);
    });

    it("returns false for complete audit", () => {
      const text = "A".repeat(500) + "\nVerdict: Approved\nScore: 8/10";
      expect(isStubAuditText(text)).toBe(false);
    });

    it("returns true for status:ready without verdict/score", () => {
      const text = JSON.stringify({ status: "ready" }) + "A".repeat(400);
      expect(isStubAuditText(text)).toBe(true);
    });

    it("is case insensitive for verdict/score", () => {
      const text = "A".repeat(500) + "\nVERDICT: pass\nSCORE: 9";
      expect(isStubAuditText(text)).toBe(false);
    });

    it("trims whitespace before checking length", () => {
      const text = "  \n  " + "A".repeat(300) + "  \n  ";
      expect(isStubAuditText(text)).toBe(true);
    });
  });
});
