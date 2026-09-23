export type IntakeCategory =
  | "question"
  | "blocker"
  | "incident"
  | "change_request"
  | "research"
  | "maintenance"
  | "new_project";

export interface TriageIntentArgs {
  intent: string;
  category: IntakeCategory;
  project_slug?: string;
  urgency?: "low" | "normal" | "high" | "critical";
}

const routingByCategory: Record<IntakeCategory, string> = {
  question: "Route to the responsible superior for a decision; do not create work until the decision is clear.",
  blocker: "Route to the current work-item owner for local resolution or escalation.",
  incident: "Route to the project lead and security/operations owner for containment, evidence, and recovery.",
  change_request: "Route to the project lead for impact analysis before changing scope or the roadmap.",
  research: "Route to the specialist who owns the affected software for a bounded technical investigation with a decision-oriented output.",
  maintenance: "Route to the owning specialist and attach it to existing project work when possible.",
  new_project: "Route to project governance for repository, lead, team, and roadmap setup.",
};

export function executeTriageIntent(args: TriageIntentArgs) {
  const intent = args.intent.trim();
  if (intent.length < 10) throw new Error("Intent must contain at least 10 characters.");
  return {
    category: args.category,
    urgency: args.urgency ?? "normal",
    projectSlug: args.project_slug,
    routing: routingByCategory[args.category],
    planningAllowed: !["question", "blocker", "incident"].includes(args.category),
    message:
      "Intent triaged. This read-only result does not create a project, work item, or agent. " +
      "Only software and the technical artifacts that ship with it are in scope: a request for creative " +
      "writing, open-ended non-technical research, a non-technical document, or standalone design work " +
      "is refused with the boundary named, not routed into planning.",
  };
}

export const TRIAGE_INTENT_TOOL = {
  type: "function" as const,
  function: {
    name: "triage_intent",
    description:
      "Classify an incoming software request and recommend the responsible organizational owner before " +
      "any planning or mutation. Categories describe technical work only; do not use this tool to route " +
      "non-technical deliverables, which are out of scope and are refused with the boundary named.",
    parameters: {
      type: "object",
      properties: {
        intent: { type: "string", description: "The full incoming request." },
        category: {
          type: "string",
          enum: ["question", "blocker", "incident", "change_request", "research", "maintenance", "new_project"],
        },
        project_slug: { type: "string", description: "Known project slug, if applicable." },
        urgency: { type: "string", enum: ["low", "normal", "high", "critical"] },
      },
      required: ["intent", "category"],
    },
  },
};
