import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const previousPlanner = process.env.KAMPAKU_PLANNER;
  const previousPlannerModel = process.env.KAMPAKU_PLANNER_MODEL;
  const previousWorkspace = process.env.KAMPAKU_WORKSPACE;

  afterEach(() => {
    if (previousPlanner === undefined) delete process.env.KAMPAKU_PLANNER;
    else process.env.KAMPAKU_PLANNER = previousPlanner;
    if (previousPlannerModel === undefined) delete process.env.KAMPAKU_PLANNER_MODEL;
    else process.env.KAMPAKU_PLANNER_MODEL = previousPlannerModel;
    if (previousWorkspace === undefined) delete process.env.KAMPAKU_WORKSPACE;
    else process.env.KAMPAKU_WORKSPACE = previousWorkspace;
  });

  it("uses the real FreeLLMApi planner by default", () => {
    delete process.env.KAMPAKU_PLANNER;
    process.env.KAMPAKU_PLANNER_MODEL = "auto";

    const config = loadConfig();

    expect(config.plannerMode).toBe("llm");
    expect(config.plannerModel).toBe("auto");
  });

  it("treats blank workspace env as unset", () => {
    process.env.KAMPAKU_WORKSPACE = "   ";

    const config = loadConfig();

    expect(config.workspaceRoot.length).toBeGreaterThan(0);
    expect(config.workspaceRoot.trim()).toBe(config.workspaceRoot);
  });
});
