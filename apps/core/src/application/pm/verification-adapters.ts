import type { VerifierCapability } from "./capabilities.js";

export interface VerificationRequest {
  capability: VerifierCapability;
  criterionId: string;
  target: string;
  timeoutMs?: number;
}

export interface VerificationResult {
  criterionId: string;
  capability: VerifierCapability;
  target: string;
  passed: boolean;
  reference?: string;
  output?: string;
  observedAt: string;
}

export function createVerificationRequest(capability: VerifierCapability, criterionId: string, target: string, timeoutMs = 30_000): VerificationRequest {
  return { capability, criterionId, target, timeoutMs };
}

export function createVerificationResult(request: VerificationRequest, passed: boolean, reference?: string, output?: string): VerificationResult {
  return { criterionId: request.criterionId, capability: request.capability, target: request.target, passed, reference, output, observedAt: new Date().toISOString() };
}
