import type { RefusalBoundary } from "../../../persistence/refusal-store.js";

/**
 * Intake classification.
 *
 * `out_of_scope` is deliberately a category, not an error. Refusing non-software work is a product
 * behaviour with its own oracle, and the intake step is where the decision is made. Making it a
 * category means the refusal travels the same path as every other classification and can be recorded
 * durably, instead of being a sentence in a reply that nothing can see afterwards.
 *
 * This is **not** an automatic classifier. The model decides; the tool records the decision and the
 * boundary it crossed. Deciding in/out of software scope from a request alone is roadmap 04's work.
 */

export type IntakeCategory =
  | "question"
  | "blocker"
  | "incident"
  | "change_request"
  | "research"
  | "maintenance"
  | "new_project"
  | "out_of_scope";

export interface TriageIntentArgs {
  intent: string;
  category: IntakeCategory;
  project_slug?: string;
  urgency?: "low" | "normal" | "high" | "critical";
  /**
   * Required when the category is `out_of_scope`: which boundary the request crossed. A refusal that
   * does not name its boundary is the "generic apology" this pipeline exists to avoid.
   */
  boundary?: RefusalBoundary;
}

const routingByCategory: Record<IntakeCategory, string> = {
  question: "Route to the responsible superior for a decision; do not create work until the decision is clear.",
  blocker: "Route to the current work-item owner for local resolution or escalation.",
  incident: "Route to the project lead and security/operations owner for containment, evidence, and recovery.",
  change_request: "Route to the project lead for impact analysis before changing scope or the roadmap.",
  research: "Route to the specialist who owns the affected software for a bounded technical investigation with a decision-oriented output.",
  maintenance: "Route to the owning specialist and attach it to existing project work when possible.",
  new_project: "Route to project governance for repository, lead, team, and roadmap setup.",
  out_of_scope:
    "Refuse, naming the boundary. Do not create a project, work item, or agent, and do not route the request into planning.",
};

/** Categories that must not open work. */
const NON_PLANNING_CATEGORIES: IntakeCategory[] = ["question", "blocker", "incident", "out_of_scope"];

export const REFUSAL_BOUNDARIES: RefusalBoundary[] = [
  "creative_writing",
  "non_technical_research",
  "non_technical_document",
  "standalone_design",
  "unverifiable_evidence",
];

export interface TriageIntentResult {
  category: IntakeCategory;
  urgency: string;
  projectSlug?: string;
  routing: string;
  planningAllowed: boolean;
  message: string;
  /** Present only for `out_of_scope`; the caller records it durably. */
  refusal?: { boundary: RefusalBoundary; statement: string };
}

export function executeTriageIntent(args: TriageIntentArgs): TriageIntentResult {
  const intent = args.intent.trim();
  if (intent.length < 10) throw new Error("Intent must contain at least 10 characters.");

  const base = {
    category: args.category,
    urgency: args.urgency ?? "normal",
    projectSlug: args.project_slug,
    routing: routingByCategory[args.category],
    planningAllowed: !NON_PLANNING_CATEGORIES.includes(args.category),
  };

  if (args.category !== "out_of_scope") {
    return {
      ...base,
      message:
        "Intent triaged. This read-only result does not create a project, work item, or agent. " +
        "Only software and the technical artifacts that ship with it are in scope: a request for creative " +
        "writing, open-ended non-technical research, a non-technical document, or standalone design work " +
        "is refused with the boundary named, not routed into planning; classify it as out_of_scope and name that boundary.",
    };
  }

  // A refusal must name the boundary. Refusing without saying which boundary was crossed is the
  // generic apology the eval lab scores as a failure, so it is rejected here rather than recorded
  // as a vague decision.
  if (!args.boundary || !REFUSAL_BOUNDARIES.includes(args.boundary)) {
    throw new Error(
      `An out_of_scope classification must name the boundary it crossed. Use one of: ${REFUSAL_BOUNDARIES.join(", ")}.`,
    );
  }

  return {
    ...base,
    refusal: {
      boundary: args.boundary,
      statement: "",
    },
    message:
      "Out of software scope. The factory refused this request and named the boundary. " +
      "No project, work item, or agent was created, and the request was not routed into planning.",
  };
}

export const TRIAGE_INTENT_TOOL = {
  type: "function" as const,
  function: {
    name: "triage_intent",
    description:
      "Classify an incoming software request and recommend the responsible organizational owner before any " +
      "planning or mutation. Use the categories for software work; when the request is not software and " +
      "not a technical artifact that ships with it, classify it as out_of_scope and name the boundary it " +
      "crossed. A request that is out of scope is never routed into planning, and never produces a " +
      "degraded artifact in its place.",
    parameters: {
      type: "object",
      properties: {
        intent: { type: "string", description: "The full incoming request." },
        category: {
          type: "string",
          enum: [
            "question",
            "blocker",
            "incident",
            "change_request",
            "research",
            "maintenance",
            "new_project",
            "out_of_scope",
          ],
        },
        project_slug: { type: "string", description: "Known project slug, if applicable." },
        urgency: { type: "string", enum: ["low", "normal", "high", "critical"] },
        boundary: {
          type: "string",
          enum: REFUSAL_BOUNDARIES,
          description:
            "Required when category is out_of_scope: which boundary the request crossed. A refusal that " +
            "does not name its boundary is indistinguishable from a capability limitation.",
        },
      },
      required: ["intent", "category"],
    },
  },
};
