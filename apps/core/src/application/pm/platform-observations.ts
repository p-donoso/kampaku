import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parseCriterionChecks } from "./criterion-checks.js";
import type { CriterionEvidenceRecord } from "./evidence-review.js";

/**
 * The evidence Core can produce **itself**, without spending a job or asking a person.
 *
 * ## What went wrong, measured
 *
 * 2026-11-09, suite 19 run `s19r17`, scenario M (BOARD F-145). The plan's contract-safety slice carries two
 * criteria: `` `npm run test` exits 0 `` and `file exists at packages/contract/package.json`. The router sent the
 * second to `inspect_artifact` — correctly, it *is* an artifact criterion — and the job, which is read-only and
 * runs the repository's own checks, reported the check and no artifact observation, because it holds no reason to
 * inspect a file the criterion merely says must already be there. Closure then refused the leaf
 * `criteria_without_evidence: ac-2` with the file sitting in the checkout, and the operator cleared it by looking
 * at the path and recording the acceptance. Nothing was dishonest; the platform simply demanded a witness for a
 * fact it was already holding.
 *
 * ## The rule
 *
 * An existence assertion about a path **inside the checkout Core has open** is a read Core can make. The evidence
 * record that results is the platform's own observation — `subjectType: "artifact"`, `verificationMethod:
 * "file-inspection"`, `sourceTool: "inspect_artifact"` — which is exactly the shape `keyEvidenceToCriteria` and
 * `reflectsCriterion` already read, so no proof test is weakened: the record claims only what was read.
 *
 * What this deliberately does **not** do:
 *
 * - It does not decide a criterion about *content* (`contains`, `declares`, `states`), only about presence.
 * - It does not reach outside the checkout. An absolute path, a `..` segment, or anything that resolves outside
 *   is declined, and the criterion is left to the gate exactly as today: the platform reads what it holds.
 * - It produces a record only when the path **is there**. A missing file yields no record at all, so the leaf is
 *   refused for it — that is the honest verdict, and it is the whole point of the criterion.
 */

/** Words that make an existence assertion about a path, and nothing more. */
const PRESENCE_ONLY = /\b(?:exists|exist|present|is there|test -[fed])\b/i;

/** Words that ask about the file's **contents**, which a presence read cannot answer. */
const CONTENT_CLAIM =
  /\b(?:contains?|containing|declares?|declaring|states?|reads?|lists?|mentions?|matches?|includes?|same as|unchanged|unmodified|identical)\b/i;

/**
 * A path token that can be resolved against a checkout.
 *
 * Backticks first — a plan writes paths in them — then a bare span with a separator and a file extension, which is
 * the shape `file exists at packages/contract/package.json` has. Length and separator requirements keep words like
 * `README` and `package.json` from being read as relative paths: both resolve to nothing useful, and a wrong hit
 * here would be a false proof.
 */
const PATH_SHAPED = /(?:[\w.-]+\/)+[\w.-]+\.\w{1,6}/g;
const BACKTICKED_SPAN = /`([^`]+)`/g;
const BARE_PATH = /(?:^|[\s(])((?:[\w.-]+\/)+[\w.-]+\.\w{1,6})(?=[\s,;.)]|$)/g;

/**
 * Whether this text asks only whether a path is there.
 *
 * Exported so the rule is testable on its own, and so a caller can ask the same question the evidence read asks.
 */
export function isPresenceOnlyCriterion(text: string): boolean {
  if (!text.trim()) return false;
  if (!PRESENCE_ONLY.test(text)) return false;
  // A criterion that says the file is there **and** that it declares something is not answered by a listing of
  // the directory: half a proof is worse than none, because it reads as coverage.
  return !CONTENT_CLAIM.test(text);
}

/**
 * Every path-shaped span the text names, in the order a plan would read them.
 *
 * Two readers, because a plan writes a path two ways: inside backticks it may carry flags around the path
 * (`` `test -f docs/audit/latest.md` ``), and in prose it stands alone (`file exists at packages/x/package.json`).
 * A quoted span is therefore scanned for the path token inside it, and the prose is scanned as prose.
 */
export function pathsNamedIn(text: string): string[] {
  const found: string[] = [];
  for (const span of text.matchAll(BACKTICKED_SPAN)) {
    for (const token of span[1].matchAll(PATH_SHAPED)) found.push(token[0]);
  }
  const prose = text.replace(/`[^`]+`/g, " ");
  for (const match of prose.matchAll(BARE_PATH)) found.push(match[1]);
  return [...new Set(found.map((path) => path.replace(/^\.\//, "").trim()).filter(Boolean))];
}

/** Resolves a named path inside the checkout, or `undefined` when it points anywhere else. */
function insideCheckout(checkoutPath: string, named: string): string | undefined {
  if (isAbsolute(named)) return undefined;
  const root = resolve(checkoutPath);
  const candidate = resolve(root, named);
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return undefined;
  return existsSync(candidate) ? candidate : undefined;
}

/**
 * The artifact observations the platform can make for this work item's criteria, from the checkout it holds.
 *
 * `checkoutPath` absent means the caller cannot read a checkout, and then this produces nothing at all — absence
 * of knowledge is not proof, and the gate's own reading stands.
 */
export function platformArtifactObservations(
  criteria: Array<{ id: string; text: string }>,
  checkoutPath?: string,
  observedAt = new Date().toISOString(),
): CriterionEvidenceRecord[] {
  if (!checkoutPath) return [];
  const artifactCriteria = new Set(
    parseCriterionChecks(criteria)
      .filter((check) => check.kind === "artifact")
      .map((check) => check.criterionId),
  );
  if (artifactCriteria.size === 0) return [];

  const records: CriterionEvidenceRecord[] = [];
  for (const criterion of criteria) {
    if (!artifactCriteria.has(criterion.id)) continue;
    if (!isPresenceOnlyCriterion(criterion.text)) continue;
    for (const named of pathsNamedIn(criterion.text)) {
      const absolute = insideCheckout(checkoutPath, named);
      if (!absolute) continue;
      const isDirectory = statSync(absolute).isDirectory();
      records.push({
        criterionId: criterion.id,
        criterionIds: [criterion.id],
        subjectType: "artifact",
        format: isDirectory ? "other" : "code",
        // Read, not inferred: the platform looked at the path it holds.
        verificationMethod: "file-inspection",
        subject: `artifact:${named}`,
        passed: true,
        verified: true,
        sourceTool: "inspect_artifact",
        observedAt,
        reference: named,
      });
    }
  }
  return records;
}
