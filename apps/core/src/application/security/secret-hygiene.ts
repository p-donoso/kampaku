import { resolve } from "node:path";

/** Paths that must never be readable/writable via product FS tools, even if under an allowed folder. */
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
  /(?:^|\/)\.env\.[^/]+$/i,
];

const SECRET_CONTENT_PATTERNS: RegExp[] = [
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}/i,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\bTWILIO_AUTH_TOKEN\b/i,
];

export function isSensitiveFilesystemPath(rawPath: string): boolean {
  const normalized = resolve(rawPath).replace(/\\/g, "/");
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function assertPathNotSensitive(rawPath: string): void {
  if (isSensitiveFilesystemPath(rawPath)) {
    throw new Error(`Refusing sensitive path access: ${rawPath}`);
  }
}

export function looksLikeSecretContent(content: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}

export function assertContentHasNoSecrets(content: string, context = "file content"): void {
  if (looksLikeSecretContent(content)) {
    throw new Error(`Refusing to write secret-like material into ${context}.`);
  }
}
