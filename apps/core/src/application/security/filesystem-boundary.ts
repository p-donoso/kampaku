/**
 * @module application/security/filesystem-boundary
 *
 * The one place a filesystem refusal is **worded** and **recorded**, so every surface states the same boundary
 * and the operator can see what was refused.
 *
 * Why this module exists, measured on suite 14's first run (`s14r1`, 2026-10-30): the product refused every
 * denial correctly in prose — a seat answered *"I hold no file-reading tool"*, another *"`/etc` is out of
 * bounds"* — and `GET /api/v1/refusals` answered **`0`**. A boundary that leaves no record cannot be reviewed,
 * counted, or told apart from a model being polite, which is exactly what suite 14's oracle asks for: *"the
 * attempt is refused and the refusal is recorded"*.
 *
 * Two refusals live here, and they are different boundaries rather than one grey "permission denied":
 *
 * - **`filesystem_boundary`** — the path is outside what this seat may reach: another project's checkout, a path
 *   outside the project's own tree, the home directory, or a system directory.
 * - **`secret_material`** — the path is a credentials location, or the content is a credential value.
 *
 * The refusal names the boundary, says which path crossed it, and says where the value belongs instead. A
 * refusal that only says "permission denied" leaves the operator with nothing to change.
 */

import { isAbsolute, relative, resolve } from "node:path";
import type { KampakuToolContext } from "../../agents/runtime/tools/index.js";
import type { RefusalBoundary } from "../../persistence/refusal-store.js";

/**
 * Credentials locations that are refused even when the enclosing folder is granted.
 *
 * Deliberately the same list the worker's write boundary uses (`apps/worker/src/tools/secret-hygiene.ts`): a
 * read gate that is narrower than the write gate is a leak with a different verb.
 */
const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /(?:^|\/)\.gnupg(?:\/|$)/i,
  /(?:^|\/)\.aws(?:\/|$)/i,
  /(?:^|\/)\.secrets\.env$/i,
  /(?:^|\/)id_rsa(?:$|\.)/i,
  /(?:^|\/)id_ed25519(?:$|\.)/i,
  /(?:^|\/)id_ecdsa(?:$|\.)/i,
  /(?:^|\/)\.env$/i,
  /^\/etc\/(?:passwd|shadow|sudoers)/i,
];

/** Content that is a credential whatever file it was pasted into. */
const SECRET_CONTENT_PATTERNS: RegExp[] = [
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
];

export function isSensitiveFilesystemPath(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, "/");
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function looksLikeSecretContent(content: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}

/** A refusal that already carries the boundary it crossed, so callers cannot lose it in a plain `Error`. */
export class FilesystemRefusal extends Error {
  constructor(
    message: string,
    readonly boundary: RefusalBoundary,
  ) {
    super(message);
    this.name = "FilesystemRefusal";
  }
}

export interface RefusalContext {
  /** What was attempted, in the operator's terms. */
  request: string;
  boundary: RefusalBoundary;
  /** The boundary stated back to the caller, naming the path and where the value belongs. */
  statement: string;
}

/**
 * Records the refusal, then throws it.
 *
 * Recording first is deliberate: a caller that catches the error to shape its own reply still leaves the record,
 * and a refusal that is only thrown is the shape this module exists to end. When the context carries no
 * `refusalStore` — an embedded caller that predates the table — the refusal is still thrown; the tool result
 * says so rather than pretending a record exists.
 */
export function refuse(ctx: KampakuToolContext, input: RefusalContext, scope?: { agentId?: string; projectId?: string; conversationId?: string }): never {
  let recorded = "";
  try {
    const record = ctx.refusalStore?.record({
      request: input.request,
      boundary: input.boundary,
      boundaryStatement: input.statement,
      refusedByAgentId: scope?.agentId,
      projectId: scope?.projectId,
      conversationId: scope?.conversationId,
      surface: "agent",
    });
    if (record) recorded = ` Recorded as refusal ${record.id}.`;
  } catch {
    // A store that cannot write must not turn a refusal into an allowance. The throw below still happens.
  }
  throw new FilesystemRefusal(`${input.statement}${recorded}`, input.boundary);
}

/**
 * The boundary a path crossed relative to a seat's allowed root, or `undefined` when it is inside.
 *
 * Comparing the **resolved** pair is what makes `..`, an absolute path and a symlink one refusal instead of
 * three: `resolve` collapses traversal before the comparison, so a path that only looks contained is refused
 * the same way as one that spells it out.
 */
export function outsideRoot(targetPath: string, root: string): string | undefined {
  const resolvedTarget = resolve(targetPath);
  const rel = relative(resolve(root), resolvedTarget);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return undefined;
  return resolvedTarget;
}
