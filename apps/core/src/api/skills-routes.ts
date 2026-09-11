import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import {
  createSkill,
  deleteSkill,
  getSkill,
  listSkills,
  SkillStoreError,
  updateSkill,
} from "../application/skills.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { SkillStore } from "../persistence/skill-store.js";

export function registerSkillsRoutes(
  app: Hono,
  skillStore: SkillStore,
  agentStore: AgentStore,
  config: AppConfig,
) {
  app.get("/api/v1/skills", (c) => {
    return c.json({ skills: listSkills(skillStore, agentStore) });
  });

  app.get("/api/v1/skills/:slug", (c) => {
    const slug = c.req.param("slug");
    const skill = getSkill(skillStore, agentStore, slug);
    if (!skill) return c.body(null, 404);
    return c.json(skill);
  });

  app.post("/api/v1/skills", async (c) => {
    const body = await c.req.json<{
      slug?: string;
      name?: string;
      description?: string;
      capabilities?: string[];
      tools?: string[];
      prompt_fragment?: string;
      promptFragment?: string;
      default?: boolean;
    }>();

    const instructions = body.prompt_fragment ?? body.promptFragment;
    if (
      !body.slug?.trim() ||
      !body.name?.trim() ||
      !body.description?.trim() ||
      !instructions?.trim()
    ) {
      return c.json({ error: "slug, name, description, and instructions are required" }, 400);
    }

    try {
      const skill = createSkill(skillStore, agentStore, config.workspaceRoot, {
        slug: body.slug.trim(),
        name: body.name.trim(),
        description: body.description.trim(),
        capabilities: body.capabilities ?? [],
        tools: body.tools ?? [],
        promptFragment: instructions.trim(),
        default: body.default,
      });
      return c.json(skill, 201);
    } catch (error) {
      if (error instanceof SkillStoreError) {
        const status = error.code === "CONFLICT" ? 409 : error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      if (error instanceof Error && error.name === "ZodError") {
        return c.json({ error: error.message, code: "VALIDATION" }, 400);
      }
      throw error;
    }
  });

  app.patch("/api/v1/skills/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json<{
      slug?: string;
      name?: string;
      description?: string;
      capabilities?: string[];
      tools?: string[];
      prompt_fragment?: string;
      promptFragment?: string;
      default?: boolean;
    }>();

    try {
      const skill = updateSkill(skillStore, agentStore, config.workspaceRoot, slug, {
        slug: body.slug,
        name: body.name,
        description: body.description,
        capabilities: body.capabilities,
        tools: body.tools,
        promptFragment: body.prompt_fragment ?? body.promptFragment,
        default: body.default,
      });
      return c.json(skill);
    } catch (error) {
      if (error instanceof SkillStoreError) {
        const status = error.code === "CONFLICT" ? 409 : error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      if (error instanceof Error && error.name === "ZodError") {
        return c.json({ error: error.message, code: "VALIDATION" }, 400);
      }
      throw error;
    }
  });

  app.delete("/api/v1/skills/:slug", (c) => {
    const slug = c.req.param("slug");
    try {
      deleteSkill(skillStore, config.workspaceRoot, slug);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof SkillStoreError) {
        const status = error.code === "CONFLICT" ? 409 : error.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });
}
