import { describe, it, expect } from "vitest";
import {
  parseSubAgentRequest,
  buildStubSystemPrompt,
  isListAgentsRequest,
} from "../../src/agents/runtime/stub-agent.js";

describe("parseSubAgentRequest", () => {
  it("parses create sub-agent with slug and responsibilities", () => {
    const result = parseSubAgentRequest("create sub-agent test-agent that handles testing tasks");
    expect(result).toEqual({
      slug: "test-agent",
      name: "Test Agent",
      responsibilities: "handles testing tasks",
    });
  });

  it("parses create subagent without hyphen", () => {
    const result = parseSubAgentRequest("create subagent database-manager that manages database operations");
    expect(result).toEqual({
      slug: "database-manager",
      name: "Database Manager",
      responsibilities: "manages database operations",
    });
  });

  it("parses create with optional article 'a'", () => {
    const result = parseSubAgentRequest("create a sub-agent api-handler that processes API requests");
    expect(result).toEqual({
      slug: "api-handler",
      name: "Api Handler",
      responsibilities: "processes API requests",
    });
  });

  it("parses with 'named' keyword", () => {
    const result = parseSubAgentRequest("create sub-agent named logger that logs events");
    expect(result).toEqual({
      slug: "logger",
      name: "Logger",
      responsibilities: "logs events",
    });
  });

  it("parses with 'called' keyword", () => {
    const result = parseSubAgentRequest("create sub-agent called monitor that monitors system health");
    expect(result).toEqual({
      slug: "monitor",
      name: "Monitor",
      responsibilities: "monitors system health",
    });
  });

  it("parses with quotes around slug", () => {
    const result = parseSubAgentRequest('create sub-agent "file-processor" that processes files');
    expect(result).toEqual({
      slug: "file-processor",
      name: "File Processor",
      responsibilities: "processes files",
    });
  });

  it("strips trailing period from responsibilities", () => {
    const result = parseSubAgentRequest("create sub-agent reporter that generates reports.");
    expect(result).toEqual({
      slug: "reporter",
      name: "Reporter",
      responsibilities: "generates reports",
    });
  });

  it("generates default responsibilities when only slug provided", () => {
    const result = parseSubAgentRequest("create sub-agent analyzer");
    expect(result).toEqual({
      slug: "analyzer",
      name: "Analyzer",
      responsibilities: "Handle tasks related to Analyzer.",
    });
  });

  it("uses fallback pattern for sub-agent named without create", () => {
    const result = parseSubAgentRequest("sub-agent named helper that provides assistance");
    expect(result).toEqual({
      slug: "helper",
      name: "Helper",
      responsibilities: "provides assistance",
    });
  });

  it("uses fallback pattern with default responsibilities", () => {
    const result = parseSubAgentRequest("sub-agent called scheduler");
    expect(result).toEqual({
      slug: "scheduler",
      name: "Scheduler",
      responsibilities: "Responsibilities for Scheduler.",
    });
  });

  it("returns undefined for non-matching message", () => {
    const result = parseSubAgentRequest("just a random message");
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const result = parseSubAgentRequest("");
    expect(result).toBeUndefined();
  });

  it("handles whitespace in message", () => {
    const result = parseSubAgentRequest("  create sub-agent trimmed that does work  ");
    expect(result).toEqual({
      slug: "trimmed",
      name: "Trimmed",
      responsibilities: "does work",
    });
  });
});

describe("buildStubSystemPrompt", () => {
  it("builds system prompt with name and responsibilities", () => {
    const prompt = buildStubSystemPrompt("Test Agent", "Handle testing tasks");
    expect(prompt).toContain("You are Test Agent, a specialized Kampaku sub-agent.");
    expect(prompt).toContain("Responsibilities:");
    expect(prompt).toContain("Handle testing tasks");
    expect(prompt).toContain("Operate within your defined role. Report to the emperor through Kampaku when needed.");
  });

  it("formats prompt with proper line breaks", () => {
    const prompt = buildStubSystemPrompt("Monitor", "Track system metrics");
    const lines = prompt.split("\n");
    expect(lines[0]).toBe("You are Monitor, a specialized Kampaku sub-agent.");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("Responsibilities:");
    expect(lines[3]).toBe("Track system metrics");
    expect(lines[4]).toBe("");
    expect(lines[5]).toBe("Operate within your defined role. Report to the emperor through Kampaku when needed.");
  });
});

describe("isListAgentsRequest", () => {
  it("matches 'list agents'", () => {
    expect(isListAgentsRequest("list agents")).toBe(true);
  });

  it("matches 'list sub-agents'", () => {
    expect(isListAgentsRequest("list sub-agents")).toBe(true);
  });

  it("matches 'list subagents'", () => {
    expect(isListAgentsRequest("list subagents")).toBe(true);
  });

  it("matches 'show agents'", () => {
    expect(isListAgentsRequest("show agents")).toBe(true);
  });

  it("matches 'show the agents'", () => {
    expect(isListAgentsRequest("show the agents")).toBe(true);
  });

  it("matches 'list the sub-agents'", () => {
    expect(isListAgentsRequest("list the sub-agents")).toBe(true);
  });

  it("matches case insensitively", () => {
    expect(isListAgentsRequest("LIST AGENTS")).toBe(true);
    expect(isListAgentsRequest("Show Agents")).toBe(true);
  });

  it("matches with extra whitespace", () => {
    expect(isListAgentsRequest("  list agents  ")).toBe(true);
  });

  it("does not match unrelated messages", () => {
    expect(isListAgentsRequest("create an agent")).toBe(false);
    expect(isListAgentsRequest("delete agents")).toBe(false);
    expect(isListAgentsRequest("agents are running")).toBe(false);
  });

  it("does not match empty string", () => {
    expect(isListAgentsRequest("")).toBe(false);
  });
});
