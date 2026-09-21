/**
 * @module application/pm/post-action/review
 * Runs the post-action review as a second, low-context pass.
 *
 * Two execution paths exist and both are honest:
 * - `model` delegates to a provider-neutral model call constrained by a JSON
 *   schema, then validates the result.
 * - `deterministic` derives the projections from recorded facts only. It never
 *   fabricates a lesson or a wiki change; it reports what the action recorded.
 */
import type { PostActionReviewInput, PostActionReviewResult } from "./types.js";
import { validatePostActionReview } from "./validate.js";

export interface PostActionReviewDelegate {
  /**
   * Performs the low-context review call.
   *
   * @param input - Only the facts the review is allowed to read.
   * @returns The raw structured result, before validation.
   */
  run(input: PostActionReviewInput): Promise<unknown>;
}

export type PostActionReviewSource = "model" | "deterministic";

export interface PostActionReviewOutcome {
  result: PostActionReviewResult;
  source: PostActionReviewSource;
}

export const POST_ACTION_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["journal", "memory", "wiki"],
  properties: {
    journal: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "decisions", "files", "checks", "acceptanceCriteria", "followUps"],
      properties: {
        summary: { type: "string" },
        decisions: { type: "array", items: { type: "string" } },
        files: { type: "array", items: { type: "string" } },
        checks: { type: "array", items: { type: "string" } },
        acceptanceCriteria: { type: "array", items: { type: "string" } },
        followUps: { type: "array", items: { type: "string" } },
      },
    },
    memory: {
      type: "object",
      additionalProperties: false,
      required: ["notNeeded"],
      properties: {
        notNeeded: { type: "boolean" },
        reason: { type: "string" },
        lesson: {
          type: "object",
          additionalProperties: false,
          required: ["title", "body"],
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            summary: { type: "string" },
            relevance: { type: "integer", minimum: 1, maximum: 5 },
          },
        },
      },
    },
    wiki: {
      type: "object",
      additionalProperties: false,
      required: ["decision", "reason"],
      properties: {
        decision: { type: "string", enum: ["not_needed", "propose_edit", "post_comment"] },
        reason: { type: "string" },
        page: { type: "string" },
        evidence: { type: "string" },
        contentMd: { type: "string" },
        content: { type: "string" },
      },
    },
  },
} as const;

const EVENT_INTENT: Record<PostActionReviewInput["event"], string> = {
  work_completed: "Record the completed work and whether any durable lesson or wiki change is warranted.",
  delegation_completed: "Record the decomposition decision and the durable team-structure knowledge it created.",
  blocker_resolved: "Record the resolution decision and the reusable lesson that prevents a repeat.",
  handoff_completed: "Record the transferred context, the ownership change, and receiver-facing memory.",
  work_failed: "Record the root cause, the strategy that avoids a repeat, and durable operational documentation.",
  phase_completed: "Record consolidated lessons, wiki synchronization, and the phase-gate evidence.",
  wiki_reviewed: "Confirm that the approved content matches what was proposed.",
  repo_changed: "Check README, docs, wiki, tests, and contracts for drift after the repository change.",
};

/**
 * Builds the low-context review request.
 *
 * The prompt carries only recorded facts, so the review cannot depend on the
 * original conversation transcript.
 */
export function buildPostActionReviewPrompt(input: PostActionReviewInput): string {
  const sections: string[] = [
    "You are reviewing an action that was already recorded. Do not re-run it, do not claim new work, and do not invent evidence.",
    `Event: ${input.event}`,
    `Intent: ${EVENT_INTENT[input.event]}`,
    `Agent: ${input.agentSlug}`,
    `Project: ${input.projectId}`,
  ];
  if (input.workItemId) sections.push(`Work item: ${input.workItemId}`);
  if (input.referenceId) sections.push(`Reference: ${input.referenceId}`);

  const list = (label: string, values?: string[]) => {
    if (!values?.length) return;
    sections.push(`${label}:`, ...values.map((value) => `- ${value}`));
  };

  sections.push("Recorded outcome:", input.summary);
  list("Decisions", input.decisions);
  list("Files", input.files);
  list("Checks", input.checks);
  list("Acceptance criteria", input.acceptanceCriteria);
  list("Follow-ups", input.followUps);

  if (input.wikiPages?.length) {
    sections.push(
      "Existing wiki pages (use one of these slugs):",
      ...input.wikiPages.map((page) => `- ${page.slug} (${page.status}): ${page.title}`),
    );
  } else {
    sections.push("Existing wiki pages: none available.");
  }
  if (input.wikiSyncRequired !== undefined) {
    sections.push(`Wiki synchronization required before closure: ${input.wikiSyncRequired ? "yes" : "no"}`);
  }

  sections.push(
    "Rules:",
    "- Write every field in English and never include secrets, credentials, tokens, or raw transcripts.",
    "- The journal projection must summarize what happened and list decisions, files, checks, acceptance criteria, and follow-ups. Use empty arrays when nothing applies.",
    "- Set memory.notNeeded to true with a reason when no reusable lesson exists. Do not restate the task as a lesson.",
    "- Set wiki.decision to not_needed with a reason when shared knowledge did not change. Use propose_edit or post_comment only with an existing page slug and concrete evidence.",
    "- A wiki proposal is not a publication. Do not claim that shared knowledge was published.",
  );

  return sections.join("\n");
}

/**
 * Derives projections from recorded facts only, without a model call.
 *
 * Used when the runtime has no usable provider, and as the floor for automated
 * lifecycle events. The lesson channel stays empty unless the failure carries a
 * concrete code the agent can reuse.
 */
export function buildDeterministicReview(input: PostActionReviewInput): PostActionReviewResult {
  const checksPassed = input.checks?.filter((check) => !/\bfail/i.test(check)) ?? [];
  const checksFailed = input.checks?.filter((check) => /\bfail/i.test(check)) ?? [];
  const summary = [
    `${input.event.replace(/_/g, " ")} for ${input.projectId}`,
    input.workItemId ? `(work item ${input.workItemId})` : undefined,
    input.referenceId ? `(reference ${input.referenceId})` : undefined,
    "recorded from the execution result.",
    input.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);

  const lesson = checksFailed.length > 0
    ? {
        title: `${input.event} with failing checks on ${input.projectId}`.slice(0, 120),
        body: [
          `Event: ${input.event}`,
          checksFailed.length > 0 ? `Failing checks: ${checksFailed.join(", ")}` : "",
          `Recorded outcome: ${input.summary}`,
          "Next attempt: re-run the failing checks before reporting completion and keep acceptance criteria as exact commands.",
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 2000),
        summary: `Failing checks: ${checksFailed.join(", ")}`.slice(0, 240),
        relevance: 5,
      }
    : undefined;

  return {
    journal: {
      summary,
      decisions: input.decisions ?? [],
      files: input.files ?? [],
      checks: checksPassed.concat(checksFailed),
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      followUps: input.followUps ?? [],
    },
    memory: lesson
      ? { notNeeded: false, lesson }
      : {
          notNeeded: true,
          reason: "No reusable lesson was recorded for this event; the journal projection carries the outcome.",
        },
    wiki: {
      decision: "not_needed",
      reason: "No shared knowledge change was recorded for this event, so no wiki projection is proposed.",
    },
  };
}

/**
 * Runs a post-action review and returns a validated result.
 *
 * @param input - Recorded facts for the event.
 * @param options - Optional model delegate. When absent, the deterministic builder is used.
 * @returns The validated result and which path produced it.
 */
export async function runPostActionReviewCall(
  input: PostActionReviewInput,
  options: { delegate?: PostActionReviewDelegate } = {},
): Promise<PostActionReviewOutcome> {
  if (!options.delegate) {
    const result = validatePostActionReview(buildDeterministicReview(input), input);
    return { result, source: "deterministic" };
  }

  const raw = await options.delegate.run(input);
  const parsed = typeof raw === "string" ? parseReviewJson(raw) : raw;
  const result = validatePostActionReview(parsed, input);
  return { result, source: "model" };
}

/**
 * Parses a model reply into a JSON object, tolerating fenced code blocks.
 */
export function parseReviewJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Post-action review reply did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}
