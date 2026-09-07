import { describe, it, expect } from "vitest";
import { getToolLabel } from "../../../src/agents/runtime/tool-labels.js";

describe("tool-labels", () => {
  describe("getToolLabel", () => {
    it("returns label for known tools", () => {
      expect(getToolLabel("submit_intent")).toBe("Planning and delegating");
      expect(getToolLabel("get_project")).toBe("Loading project");
      expect(getToolLabel("create_sub_agent")).toBe("Creating sub-agent");
      expect(getToolLabel("list_agents")).toBe("Listing agents");
      expect(getToolLabel("ask_superior")).toBe("Asking superior");
    });

    it("returns label for blocker tools", () => {
      expect(getToolLabel("report_blocker")).toBe("Reporting blocker");
      expect(getToolLabel("resolve_blocker")).toBe("Resolving blocker");
      expect(getToolLabel("escalate_blocker")).toBe("Escalating blocker");
      expect(getToolLabel("delegate_blocker")).toBe("Delegating blocker");
    });

    it("returns label for wiki tools", () => {
      expect(getToolLabel("get_wiki_tree")).toBe("Loading wiki tree");
      expect(getToolLabel("get_wiki_page")).toBe("Loading wiki page");
      expect(getToolLabel("propose_wiki_edit")).toBe("Proposing wiki edit");
      expect(getToolLabel("approve_wiki_edit")).toBe("Approving wiki edit");
    });

    it("returns label for work item tools", () => {
      expect(getToolLabel("execute_work_item")).toBe("Executing work item");
      expect(getToolLabel("retry_work_item")).toBe("Retrying work item");
    });

    it("returns label for skill tools", () => {
      expect(getToolLabel("list_skills")).toBe("Listing skills");
      expect(getToolLabel("assign_skill")).toBe("Assigning skill");
      expect(getToolLabel("unassign_skill")).toBe("Unassigning skill");
    });

    it("returns label for review/audit tools", () => {
      expect(getToolLabel("request_peer_review")).toBe("Requesting peer review");
      expect(getToolLabel("submit_peer_review")).toBe("Submitting peer review");
      expect(getToolLabel("propose_audit_improvement")).toBe("Proposing audit improvement");
    });

    it("returns label for memory tools", () => {
      expect(getToolLabel("recall")).toBe("Recalling memories");
    });

    it("returns label for system prompt tools", () => {
      expect(getToolLabel("get_global_system_prompt")).toBe("Reading global system prompt");
      expect(getToolLabel("update_global_system_prompt")).toBe("Updating global system prompt");
    });

    it("generates label for unknown tools", () => {
      const label = getToolLabel("custom_tool_name");
      expect(label).toBe("Running custom tool name");
    });

    it("replaces underscores with spaces for unknown tools", () => {
      const label = getToolLabel("my_custom_tool");
      expect(label).toBe("Running my custom tool");
    });
  });
});
