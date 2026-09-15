export const EVIDENCE_SUBJECT_TYPES = ["artifact", "behavior", "data", "publication", "decision"] as const;
export const EVIDENCE_FORMATS = ["code", "document", "image", "audio", "video", "dataset", "api-response", "other"] as const;
export const EVIDENCE_METHODS = ["command", "file-inspection", "browser", "api-request", "renderer", "manual-review", "model-observation"] as const;
export type EvidenceKind = (typeof EVIDENCE_SUBJECT_TYPES)[number];

export function isEvidenceKind(value: unknown): value is EvidenceKind {
  return typeof value === "string" && (EVIDENCE_SUBJECT_TYPES as readonly string[]).includes(value);
}
