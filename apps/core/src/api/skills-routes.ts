import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import {
  createProjectSkill,
  createSkill,
  deleteSkill,
  getSkill,
  listSkills,
  SkillStoreError,
  updateSkill,
} from "../application/skills.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { SkillStore } from "../persistence/skill-store.js";
import type { Store } from "../persistence/store.js";

export function registerSkillsRoutes(
  app: Hono,
  skillStore: SkillStore,
  agentStore: AgentStore,
  store: Store,
  config: AppConfig,
) {
  app.get("/api/v1/skills", (c) => {
    const skills = listSkills(skillStore, agentStore);
    const project = c.req.query("project");
    if (!project) return c.json({ skills });
    // A project's own catalog: the seed skills it may be given, plus the ones it authored. Its own
    // capabilities are visible here and nowhere else, which is what "scoped" means on this surface.
    return c.json({
      skills: skills.filter((skill) => !skill.projectSlug || skill.projectSlug === project),
    });
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
      project?: string;
      project_slug?: string;
      projectSlug?: string;
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

    const project = body.project ?? body.project_slug ?? body.projectSlug;

    try {
      /**
       * With a project named, this authors a capability for **that project alone** and writes no catalog
       * file (BOARD F-022). Without one it is a seed skill, written to the platform's own catalog.
       *
       * One route because it is one operation with one difference — where the record belongs — and two
       * routes would let the wrong one be the one a caller reaches. The same field the tool takes is the
       * field the route takes, in the spellings the route already tolerates.
       */
      const skill = project?.trim()
        ? createProjectSkill(skillStore, agentStore, store, project.trim(), {
            slug: body.slug.trim(),
            name: body.name.trim(),
            description: body.description.trim(),
            capabilities: body.capabilities ?? [],
            tools: body.tools ?? [],
            promptFragment: instructions.trim(),
            default: body.default,
          })
        : createSkill(skillStore, agentStore, config.workspaceRoot, {
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
