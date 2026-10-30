/** Paths that must never be readable/writable via product FS tools. */
const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /(?:^|\/)\.gnupg(?:\/|$)/i,
  /(?:^|\/)\.aws(?:\/|$)/i,
  /(?:^|\/)\.secrets\.env$/i,
  /(?:^|\/)id_rsa(?:$|\.)/i,
  /(?:^|\/)id_ed25519(?:$|\.)/i,
  /(?:^|\/)id_ecdsa(?:$|\.)/i,
  /^\/etc\/(?:passwd|shadow|sudoers)/i,
  /(?:^|\/)\.env$/i,
];

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

/**
 * Refuses a credentials path, naming the boundary rather than answering "permission denied".
 *
 * The wording matters and is asserted by `tests/secret-hygiene.test.ts` and by suite 14's lock: an operator who
 * reads *"Refusing sensitive path access: .ssh/id_rsa"* learns nothing about what to change, while one who reads
 * *"credentials paths are outside every allowed folder; the value belongs in the environment"* knows both the rule
 * and the way forward. Suite 14's oracle asks for exactly that: *"the refusal names the boundary, not just
 * permission denied"*.
 */
export function assertPathNotSensitive(rawPath: string): void {
  if (isSensitiveFilesystemPath(rawPath)) {
    throw new Error(
      `Refusing sensitive path access: ${rawPath}. Credentials paths (.ssh, .gnupg, .aws, .env, id_rsa, ` +
        "id_ed25519) are outside every allowed folder and outside every project checkout. A credential value " +
        "belongs in the environment or a secret store; a repository gets the variable name, never the value.",
    );
  }
}

export function looksLikeSecretContent(content: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Refuses to write a credential value into an artifact, and says which boundary that is.
 *
 * Beyond `permission denied` on purpose: the write is *allowed by the path policy* and refused by this one, so a
 * message about permissions would be false. This is the secret-hygiene boundary, and naming it is what lets the
 * operator act (rotate the key, move it to the environment) instead of retrying the same write.
 */
export function assertContentHasNoSecrets(content: string, context = "file content"): void {
  if (looksLikeSecretContent(content)) {
    throw new Error(
      `Refusing to write secret-like material into ${context}. A credential value in a repository artifact is ` +
        "published the moment it is committed and cannot be un-leaked by a later edit; it belongs in the " +
        "environment or a secret store, referenced by name.",
    );
  }
}
