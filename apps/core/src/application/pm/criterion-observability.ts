/**
 * @module application/pm/criterion-observability
 *
 * One definition of "a criterion a tool observation can prove", shared by the two gates that have to agree
 * about it.
 *
 * Why this module exists. Two Core gates read the same acceptance-criterion text and reached opposite
 * conclusions. `parseCriterionChecks` **routes** a criterion to the verifier that can decide it — a
 * criterion mentioning a command goes to `run_check` — while `reflectsCriterion` **refuses** to let a tool
 * observation prove a criterion that is not stated as an observable result. Measured 2026-09-30 taking suite
 * 08 (BOARD F-077): the leaf's third criterion, *"Every command quoted in the document was executed verbatim
 * … and behaved exactly as written"*, was routed to `run_check` and could never be proven by any
 * `run_check`, because it contains no observable-result word. The router asked for evidence the prover would
 * always reject, so the criterion was unsatisfiable — and closure, which requires every criterion, could
 * never happen for that leaf.
 *
 * The fix is to have one vocabulary, not two. A criterion is observable when it names a result you can
 * witness: something that exists, contains, includes, states, renders, returns, passes, fails, exits,
 * reports, shows, matches, equals, lists, counts, responds, or is blank. Everything else is a judgement, and
 * a judgement is a human gate rather than a tool's business — see `criterion-checks.ts`, which routes such a
 * criterion to `request_review` instead of to a verifier that cannot decide it.
 *
 * The vocabulary is deliberately small and closed. Widening it is how a gate that refuses to be satisfied
 * becomes a gate that accepts anything, so a word belongs here only when the product already treats it as a
 * signal of an observable outcome elsewhere — `exist` and `respond` are here because the router's own kind
 * detection uses them (`/file exists|document exists/`, an endpoint criterion is one that *responds*), and
 * `count` because the router sends a row-count criterion to `query_dataset`. A criterion the router sends to
 * a tool must not be one the prover refuses; that agreement is the whole point of this module.
 *
 * The stems are deliberately loose — `pass` covers passes, passed and passing — because the tense a plan
 * happens to write is not something a gate should turn into a refusal.
 */
export const OBSERVABLE_RESULT_KEYWORDS =
  /(?:exist|contains|include|state|render|return|pass|fail|exit|report|show|match|equal|list|count|respond)/i;

/**
 * Whether a criterion is stated as a result a tool observation can witness.
 *
 * @param text - The acceptance criterion as the plan wrote it.
 */
export function isObservableCriterion(text: string): boolean {
  return OBSERVABLE_RESULT_KEYWORDS.test(text);
}
