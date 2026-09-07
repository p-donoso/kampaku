import { describe, it, expect } from "vitest";
import type { AgentTreeNode, AgentRecord, ProjectOverview, AgentDashboard } from "@/lib/types";
import {
  flattenAgentTree,
  collectProjectAgents,
  collectAgentProjects,
} from "@/lib/agent-project-links";

describe("agent-project-links", () => {
  const mockAgent = (overrides: Partial<AgentRecord> = {}): AgentRecord => ({
    id: "agent-1",
    slug: "test-agent",
    name: "Test Agent",
    parentId: null,
    source: "generated",
    status: "active",
    responsibilities: "Testing",
    skills: ["test"],
    systemPrompt: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe("flattenAgentTree", () => {
    it("flattens empty tree", () => {
      expect(flattenAgentTree([])).toEqual([]);
    });

    it("flattens single agent", () => {
      const tree: AgentTreeNode[] = [{ agent: mockAgent({ slug: "a1" }), children: [] }];
      const flat = flattenAgentTree(tree);
      expect(flat).toHaveLength(1);
      expect(flat[0].slug).toBe("a1");
    });

    it("flattens nested tree", () => {
      const tree: AgentTreeNode[] = [
        {
          agent: mockAgent({ id: "1", slug: "parent" }),
          children: [
            { agent: mockAgent({ id: "2", slug: "child1" }), children: [] },
            { agent: mockAgent({ id: "3", slug: "child2" }), children: [] },
          ],
        },
      ];
      const flat = flattenAgentTree(tree);
      expect(flat).toHaveLength(3);
      expect(flat[0].slug).toBe("parent");
      expect(flat[1].slug).toBe("child1");
      expect(flat[2].slug).toBe("child2");
    });
  });

  describe("collectProjectAgents", () => {
    it("returns empty for project without lead or assignees", () => {
      const overview: ProjectOverview = {
        project: {
          id: "proj-1",
          slug: "proj",
          name: "Project",
          description: "",
          status: "active",
          projectLeadAgentId: null,
          repositories: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workItems: [],
        documents: [],
        milestones: [],
      };
      const agentsById = new Map<string, AgentRecord>();
      expect(collectProjectAgents(overview, agentsById)).toEqual([]);
    });

    it("includes project lead", () => {
      const leadAgent = mockAgent({ id: "lead-1", slug: "lead" });
      const overview: ProjectOverview = {
        project: {
          id: "proj-1",
          slug: "proj",
          name: "Project",
          description: "",
          status: "active",
          projectLeadAgentId: "lead-1",
          repositories: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workItems: [],
        documents: [],
        milestones: [],
      };
      const agentsById = new Map([["lead-1", leadAgent]]);
      const entries = collectProjectAgents(overview, agentsById);
      expect(entries).toHaveLength(1);
      expect(entries[0].agent.slug).toBe("lead");
      expect(entries[0].role).toBe("lead");
    });

    it("includes task assignees", () => {
      const agent1 = mockAgent({ id: "a1", slug: "agent1" });
      const agent2 = mockAgent({ id: "a2", slug: "agent2" });
      const overview: ProjectOverview = {
        project: {
          id: "proj-1",
          slug: "proj",
          name: "Project",
          description: "",
          status: "active",
          projectLeadAgentId: null,
          repositories: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workItems: [
          {
            item: {
              id: "wi1",
              projectId: "proj-1",
              title: "Task 1",
              status: "todo",
              assigneeAgentId: "a1",
              priority: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            children: [],
          },
          {
            item: {
              id: "wi2",
              projectId: "proj-1",
              title: "Task 2",
              status: "todo",
              assigneeAgentId: "a2",
              priority: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            children: [],
          },
        ],
        documents: [],
        milestones: [],
      };
      const agentsById = new Map([
        ["a1", agent1],
        ["a2", agent2],
      ]);
      const entries = collectProjectAgents(overview, agentsById);
      expect(entries).toHaveLength(2);
    });

    it("counts tasks per agent", () => {
      const agent1 = mockAgent({ id: "a1", slug: "agent1" });
      const overview: ProjectOverview = {
        project: {
          id: "proj-1",
          slug: "proj",
          name: "Project",
          description: "",
          status: "active",
          projectLeadAgentId: null,
          repositories: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workItems: [
          {
            item: {
              id: "wi1",
              projectId: "proj-1",
              title: "Task 1",
              status: "todo",
              assigneeAgentId: "a1",
              priority: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            children: [],
          },
          {
            item: {
              id: "wi2",
              projectId: "proj-1",
              title: "Task 2",
              status: "todo",
              assigneeAgentId: "a1",
              priority: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            children: [],
          },
        ],
        documents: [],
        milestones: [],
      };
      const agentsById = new Map([["a1", agent1]]);
      const entries = collectProjectAgents(overview, agentsById);
      expect(entries).toHaveLength(1);
      expect(entries[0].taskCount).toBe(2);
    });

    it("sorts lead before assignees", () => {
      const leadAgent = mockAgent({ id: "lead-1", slug: "lead" });
      const agent1 = mockAgent({ id: "a1", slug: "agent1" });
      const overview: ProjectOverview = {
        project: {
          id: "proj-1",
          slug: "proj",
          name: "Project",
          description: "",
          status: "active",
          projectLeadAgentId: "lead-1",
          repositories: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workItems: [
          {
            item: {
              id: "wi1",
              projectId: "proj-1",
              title: "Task 1",
              status: "todo",
              assigneeAgentId: "a1",
              priority: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            children: [],
          },
        ],
        documents: [],
        milestones: [],
      };
      const agentsById = new Map([
        ["lead-1", leadAgent],
        ["a1", agent1],
      ]);
      const entries = collectProjectAgents(overview, agentsById);
      expect(entries[0].role).toBe("lead");
      expect(entries[0].agent.slug).toBe("lead");
    });
  });

  describe("collectAgentProjects", () => {
    it("returns empty for null dashboard", () => {
      expect(collectAgentProjects(null)).toEqual([]);
    });

    it("collects projects from dashboard", () => {
      const dashboard: AgentDashboard = {
        agentSlug: "test-agent",
        agentName: "Test Agent",
        includeSubordinates: false,
        total: 0,
        byStatus: {
          todo: [
            {
              id: "wi1",
              title: "Task 1",
              status: "todo",
              projectSlug: "proj-a",
              projectName: "Project A",
              assigneeSlug: "test-agent",
            },
          ],
          in_progress: [
            {
              id: "wi2",
              title: "Task 2",
              status: "in_progress",
              projectSlug: "proj-b",
              projectName: "Project B",
              assigneeSlug: "test-agent",
            },
          ],
        },
      };
      const projects = collectAgentProjects(dashboard);
      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.slug === "proj-a")).toBe(true);
      expect(projects.some((p) => p.slug === "proj-b")).toBe(true);
    });

    it("groups tasks by project", () => {
      const dashboard: AgentDashboard = {
        agentSlug: "test-agent",
        agentName: "Test Agent",
        includeSubordinates: false,
        total: 0,
        byStatus: {
          todo: [
            {
              id: "wi1",
              title: "Task 1",
              status: "todo",
              projectSlug: "proj-a",
              projectName: "Project A",
              assigneeSlug: "test-agent",
            },
            {
              id: "wi2",
              title: "Task 2",
              status: "todo",
              projectSlug: "proj-a",
              projectName: "Project A",
              assigneeSlug: "test-agent",
            },
          ],
        },
      };
      const projects = collectAgentProjects(dashboard);
      expect(projects).toHaveLength(1);
      expect(projects[0].tasks).toHaveLength(2);
    });

    it("sorts projects by task count descending", () => {
      const dashboard: AgentDashboard = {
        agentSlug: "test-agent",
        agentName: "Test Agent",
        includeSubordinates: false,
        total: 0,
        byStatus: {
          todo: [
            {
              id: "wi1",
              title: "Task 1",
              status: "todo",
              projectSlug: "proj-a",
              projectName: "Project A",
              assigneeSlug: "test-agent",
            },
            {
              id: "wi2",
              title: "Task 2",
              status: "todo",
              projectSlug: "proj-b",
              projectName: "Project B",
              assigneeSlug: "test-agent",
            },
            {
              id: "wi3",
              title: "Task 3",
              status: "todo",
              projectSlug: "proj-b",
              projectName: "Project B",
              assigneeSlug: "test-agent",
            },
          ],
        },
      };
      const projects = collectAgentProjects(dashboard);
      expect(projects[0].slug).toBe("proj-b");
      expect(projects[0].tasks).toHaveLength(2);
    });
  });
});
