/**
 * Domain-agnostic planning helpers.
 * Do not fork product behavior into "software" vs "writing" recipes.
 * Only suppress engineering-default AC when the intent clearly is not an engineering stack.
 */

const ENGINEERING_STACK_MARKERS =
  /\bfrontend\b|\bbackend\b|\bqa\b|\bnpm\b|\bopenapi\b|\btypescript\b|\bexpress\b|\bnode\.js\b|\bhello eval\b|\bci\/cd\b|\bpackage\.json\b/i;

const REJECT_ENGINEERING_DEFAULTS =
  /\bnot software\b|\bnot a software\b|\bno frontend\b|\bno backend\b|\bdo not invent engineering\b|\bcovering all aspects\b|\badequate team\b/i;

/**
 * True when empty leaf AC may use file/npm-style engineering defaults.
 * False for domain-agnostic / explicitly non-engineering intents.
 */
export function intentAllowsEngineeringDefaultAc(intent: string): boolean {
  const text = intent.trim();
  if (!text) return true;
  if (REJECT_ENGINEERING_DEFAULTS.test(text)) return false;
  return ENGINEERING_STACK_MARKERS.test(text);
}

/** Pad empty leaf AC without assuming a stack. */
export function defaultAcceptanceCriteriaForIntent(intent: string): string[] {
  if (intentAllowsEngineeringDefaultAc(intent)) {
    return [
      "file exists at the primary path named in the description",
      "npm test passes when package.json defines a test script",
    ];
  }
  return [
    "named deliverable in the description exists",
    "stated acceptance check in the description passes",
  ];
}
