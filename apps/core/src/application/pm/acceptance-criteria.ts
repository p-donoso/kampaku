export interface IdentifiedCriterion { id: string; text: string }

export function identifyAcceptanceCriteria(criteria: string[]): IdentifiedCriterion[] {
  return criteria.map((text, index) => ({ id: `ac-${index + 1}`, text }));
}

export function formatAcceptanceCriteriaForWorker(criteria: string[]): string[] {
  return identifyAcceptanceCriteria(criteria).map((criterion) => `[${criterion.id}] ${criterion.text}`);
}
