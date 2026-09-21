/**
 * @module application/pm/post-action/validate
 * Strict validation for post-action review results.
 *
 * Validation never repairs a result: an invalid projection fails the review so
 * the caller can retry that projection instead of publishing fabricated
 * content.
 */
import {
  type PostActionReviewInput,
  type PostActionReviewResult,
  type PostActionWikiProjection,
} from "./types.js";

export class PostActionValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "PostActionValidationError";
  }
}

const SPANISH_MARKERS = /[áéíóúñü¿¡]|\b(?:eliminar|descripción|proyecto|tarea|servidor|cargando|archivo|reunión)\b/i;
const SECRET_MARKERS = /(?:sk-[a-z0-9]{16,}|ghp_[a-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|api[_-]?key\s*[:=]\s*\S{8,}|bearer\s+[a-z0-9._-]{20,})/i;
const TRANSCRIPT_MARKERS = /^\s*(?:system|user|assistant|tool)\s*:\s*/im;

function assertEnglish(field: string, value: string): void {
  if (SPANISH_MARKERS.test(value)) {
    throw new PostActionValidationError(`Field "${field}" must be written in English.`, field);
  }
}

function assertSafe(field: string, value: string): void {
  if (SECRET_MARKERS.test(value)) {
    throw new PostActionValidationError(`Field "${field}" appears to contain a secret.`, field);
  }
  if (TRANSCRIPT_MARKERS.test(value)) {
    throw new PostActionValidationError(`Field "${field}" appears to contain a raw transcript.`, field);
  }
}

function assertText(field: string, value: unknown, options: { min?: number; max?: number } = {}): string {
  const min = options.min ?? 1;
  const max = options.max ?? 4000;
  if (typeof value !== "string") {
    throw new PostActionValidationError(`Field "${field}" must be a string.`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new PostActionValidationError(
      `Field "${field}" must contain between ${min} and ${max} characters.`,
      field,
    );
  }
  assertEnglish(field, trimmed);
  assertSafe(field, trimmed);
  return trimmed;
}

function assertTextArray(field: string, value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) {
    throw new PostActionValidationError(`Field "${field}" must be an array of strings.`, field);
  }
  if (value.length > max) {
    throw new PostActionValidationError(`Field "${field}" must not contain more than ${max} entries.`, field);
  }
  return value.map((entry, index) => assertText(`${field}[${index}]`, entry, { max: 400 }));
}

function normalizePage(slug: string): string {
  return slug.trim().replace(/^\[\[|\]\]$/g, "").split("|")[0]!.trim();
}

function validateWiki(result: PostActionReviewResult, input: PostActionReviewInput): void {
  const wiki = result.wiki as PostActionWikiProjection;
  if (!["not_needed", "propose_edit", "post_comment"].includes(wiki.decision)) {
    throw new PostActionValidationError(
      "Field \"wiki.decision\" must be not_needed, propose_edit, or post_comment.",
      "wiki.decision",
    );
  }
  wiki.reason = assertText("wiki.reason", wiki.reason, { min: 8, max: 600 });

  if (wiki.decision === "not_needed") return;

  const page = normalizePage(assertText("wiki.page", wiki.page, { max: 120 }));
  wiki.page = page;
  wiki.evidence = assertText("wiki.evidence", wiki.evidence, { min: 8, max: 1200 });

  const knownPage = input.wikiPages?.some((candidate) => candidate.slug === page);
  if (knownPage === false) {
    throw new PostActionValidationError(
      `Field "wiki.page" must reference an existing page; "${page}" was not found.`,
      "wiki.page",
    );
  }

  if (wiki.decision === "propose_edit") {
    const body = assertText("wiki.contentMd", wiki.contentMd, { min: 80, max: 40_000 });
    if (!/^#{1,3}\s/m.test(body)) {
      throw new PostActionValidationError(
        "Field \"wiki.contentMd\" must be Markdown with at least one heading.",
        "wiki.contentMd",
      );
    }
    wiki.contentMd = body;
    return;
  }

  wiki.content = assertText("wiki.content", wiki.content, { min: 20, max: 4000 });
}

/**
 * Validates a complete review result against the review input.
 *
 * @throws PostActionValidationError when any projection is structurally invalid,
 *   written in another language, or appears to embed secrets or raw transcripts.
 */
export function validatePostActionReview(
  raw: unknown,
  input: PostActionReviewInput,
): PostActionReviewResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PostActionValidationError("Review result must be an object.", "result");
  }
  const candidate = raw as Partial<PostActionReviewResult>;

  const journalRaw = candidate.journal;
  if (!journalRaw || typeof journalRaw !== "object") {
    throw new PostActionValidationError("Field \"journal\" is required.", "journal");
  }
  const journal = {
    summary: assertText("journal.summary", journalRaw.summary, { min: 20, max: 2000 }),
    decisions: assertTextArray("journal.decisions", journalRaw.decisions ?? []),
    files: assertTextArray("journal.files", journalRaw.files ?? []),
    checks: assertTextArray("journal.checks", journalRaw.checks ?? []),
    acceptanceCriteria: assertTextArray("journal.acceptanceCriteria", journalRaw.acceptanceCriteria ?? []),
    followUps: assertTextArray("journal.followUps", journalRaw.followUps ?? []),
  };

  const memoryRaw = candidate.memory;
  if (!memoryRaw || typeof memoryRaw !== "object") {
    throw new PostActionValidationError("Field \"memory\" is required.", "memory");
  }
  let memory;
  if (memoryRaw.notNeeded === true) {
    memory = {
      notNeeded: true,
      reason: memoryRaw.reason ? assertText("memory.reason", memoryRaw.reason, { min: 8, max: 400 }) : undefined,
    };
  } else if (memoryRaw.lesson && typeof memoryRaw.lesson === "object") {
    const relevance = memoryRaw.lesson.relevance;
    if (relevance !== undefined && (!Number.isInteger(relevance) || relevance < 1 || relevance > 5)) {
      throw new PostActionValidationError(
        "Field \"memory.lesson.relevance\" must be an integer between 1 and 5.",
        "memory.lesson.relevance",
      );
    }
    memory = {
      notNeeded: false,
      lesson: {
        title: assertText("memory.lesson.title", memoryRaw.lesson.title, { min: 8, max: 120 }),
        body: assertText("memory.lesson.body", memoryRaw.lesson.body, { min: 40, max: 2000 }),
        summary: memoryRaw.lesson.summary
          ? assertText("memory.lesson.summary", memoryRaw.lesson.summary, { max: 240 })
          : undefined,
        relevance: relevance as number | undefined,
      },
    };
  } else {
    throw new PostActionValidationError(
      "Field \"memory\" must be either { notNeeded: true, reason } or { notNeeded: false, lesson }.",
      "memory",
    );
  }

  const wikiRaw = candidate.wiki;
  if (!wikiRaw || typeof wikiRaw !== "object") {
    throw new PostActionValidationError("Field \"wiki\" is required.", "wiki");
  }

  const result: PostActionReviewResult = {
    journal,
    memory,
    wiki: {
      decision: wikiRaw.decision as PostActionWikiProjection["decision"],
      reason: wikiRaw.reason,
      page: wikiRaw.page,
      evidence: wikiRaw.evidence,
      contentMd: wikiRaw.contentMd,
      content: wikiRaw.content,
    },
  };
  validateWiki(result, input);
  return result;
}
