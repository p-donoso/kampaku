import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const previousPlanner = process.env.KAMPAKU_PLANNER;
  const previousPlannerModel = process.env.KAMPAKU_PLANNER_MODEL;

  afterEach(() => {
    if (previousPlanner === undefined) delete process.env.KAMPAKU_PLANNER;
    else process.env.KAMPAKU_PLANNER = previousPlanner;
    if (previousPlannerModel === undefined) delete process.env.KAMPAKU_PLANNER_MODEL;
    else process.env.KAMPAKU_PLANNER_MODEL = previousPlannerModel;
  });

  it("uses the real FreeLLMApi planner by default", () => {
    delete process.env.KAMPAKU_PLANNER;
    process.env.KAMPAKU_PLANNER_MODEL = "auto";

    const config = loadConfig();

    expect(config.plannerMode).toBe("llm");
    expect(config.plannerModel).toBe("auto");
  });
});
