export const VERIFIER_CAPABILITIES = [
  "run_check",
  "inspect_artifact",
  "request_endpoint",
  "inspect_ui",
  "inspect_document",
  "inspect_image",
  "inspect_media",
  "inspect_audio",
  "inspect_video",
  "query_dataset",
  "browser_session",
  "request_review",
] as const;
export type VerifierCapability = (typeof VERIFIER_CAPABILITIES)[number];

export interface CapabilityPolicy {
  allowed: VerifierCapability[];
  timeoutMs: number;
}

export function isCapabilityAllowed(capability: string, policy: CapabilityPolicy): capability is VerifierCapability {
  return policy.allowed.includes(capability as VerifierCapability);
}

export function buildDefaultCapabilityPolicy(): CapabilityPolicy {
  return { allowed: [...VERIFIER_CAPABILITIES], timeoutMs: 30_000 };
}

export function validateCapabilityPolicy(policy: CapabilityPolicy): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 100 || policy.timeoutMs > 300_000) issues.push("Capability timeout must be an integer between 100ms and 300000ms.");
  if (new Set(policy.allowed).size !== policy.allowed.length) issues.push("Capability allowlist must not contain duplicates.");
  return { ok: issues.length === 0, issues };
}

export function assertCapabilityAllowed(capability: string, policy: CapabilityPolicy): void {
  if (!isCapabilityAllowed(capability, policy)) throw new Error(`Capability denied: ${capability}`);
}
