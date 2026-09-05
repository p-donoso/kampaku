import type { WorkItemComplexity } from "@/lib/types";

export function formatComplexityShort(complexity: WorkItemComplexity): string {
  if (complexity.role === "container") {
    return `${complexity.granularity} · ${complexity.leafCount}/${complexity.targetLeaves} leaves`;
  }
  return `${complexity.granularity} · ${complexity.filesUsed}/${complexity.filesMax} files · ${complexity.scriptsUsed}/${complexity.scriptsMax} scripts`;
}

export function formatComplexityDetail(complexity: WorkItemComplexity): string[] {
  const lines = [
    `Granularity: ${complexity.granularity}`,
    `Depth: ${complexity.depth}`,
    `Role: ${complexity.role}`,
  ];
  if (complexity.role === "container") {
    lines.push(`Leaves: ${complexity.leafCount} / target ${complexity.targetLeaves} (min ${complexity.minLeaves})`);
  } else {
    lines.push(`Files: ${complexity.filesUsed} / ${complexity.filesMax}`);
    lines.push(`Scripts: ${complexity.scriptsUsed} / ${complexity.scriptsMax}`);
    lines.push(
      `Description: ${complexity.descriptionChars} / ${complexity.minDescriptionChars} chars`,
    );
  }
  return lines;
}
