import {
  pauseProject,
  playProject,
  stepProject,
} from "../../../application/pm/execute-project.js";
import type { KampakuToolContext } from "./index.js";

export interface ProjectExecutionArgs {
  project_slug_or_id: string;
}

export function executePlayProject(ctx: KampakuToolContext, args: ProjectExecutionArgs) {
  return playProject(ctx, args.project_slug_or_id);
}

export function executePauseProject(ctx: KampakuToolContext, args: ProjectExecutionArgs) {
  return pauseProject(ctx.store, args.project_slug_or_id);
}

export function executeStepProject(ctx: KampakuToolContext, args: ProjectExecutionArgs) {
  return stepProject(ctx, args.project_slug_or_id);
}

const parameters = {
  type: "object",
  properties: {
    project_slug_or_id: { type: "string", description: "Project slug or UUID." },
  },
  required: ["project_slug_or_id"],
};

export const PLAY_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "play_project",
    description: "Start or resume durable project execution until a gate, blocker, or completion is reached.",
    parameters,
  },
};

export const PAUSE_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "pause_project",
    description: "Pause automatic project execution without cancelling active evidence.",
    parameters,
  },
};

export const STEP_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "step_project",
    description: "Execute the next eligible project step while leaving automatic execution paused.",
    parameters,
  },
};
