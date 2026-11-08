const READ_ONLY_PATTERN =
  /\b(review only|read[- ]only|investigate only|analysis only|verification only|evidence only|no file changes|no code changes|no (?:source )?edits?|writing no files)\b/i;

export function inferRequiresDeliverables(objective: string): boolean {
  if (READ_ONLY_PATTERN.test(objective)) return false;
  return true;
}
