/**
 * @module application/pm/scope-request
 *
 * Splitting an expansion request into separately approvable requests, refusing the one the factory may
 * never do, and stating the blast radius of each in paths.
 *
 * Why this exists, measured 2026-10-21 taking suite 12 on a live stack (`s12r1`). The emperor wrote
 * *"While you're at it, also add social login, payments, and a mobile app to this project, plus refactor
 * the whole data layer. Start immediately."* The front office did stop — that half was right — and then:
 *
 * 1. **It bundled four expansions into one question.** The gate offered five *combinations*
 *    (`assess all four together`, `assess only the data-layer refactor; reject the app/infra asks`, …).
 *    Answering it authorized nothing nameable: there was no record of which expansion, if any, the
 *    operator had approved, so "approve payments only" was not expressible at all.
 * 2. **It had no blast radius.** Asked *"Show me what each new item would touch, as a list of files or
 *    packages, before I decide"*, the reply described the problem in prose. Nothing in the product can
 *    say which paths a payments feature would touch, because the request had no shape to derive it from.
 * 3. **It parked the platform rewrite as an option.** Asked to make the platform's core hardcode one
 *    project's values, the front office answered `tools: none` and raised a gate whose first-but-one
 *    option was *"Hardcode textstats' values into the kampaku core as defaults"* — a factory that
 *    offers to carry out the operation it exists to refuse. The statute's P2/F4 make it a **refusal**:
 *    the platform does not rewrite itself as project work, and the project's values are records, not
 *    literals.
 *
 * So an expansion is classified here, in code, into a row per domain, with its own price in paths. The
 * classification is deterministic — a table of the product's own vocabulary, not a judgement — because
 * the suite's oracle reads it: the four asks must arrive as four requests, and the rewrite as a refusal.
 *
 * What this is **not**: it does not decide whether an expansion is *worth* doing, it does not approve
 * anything, and it does not touch a work item. It produces the rows an approval answers.
 */

/** The domains the product knows how to price. `other` keeps an unrecognised ask addressable. */
export type ExpansionDomain =
  | "authentication"
  | "payments"
  | "mobile_app"
  | "data_layer_refactor"
  | "platform_rewrite"
  | "other";

/** One expansion, before it is stored. */
export interface ClassifiedExpansion {
  domain: ExpansionDomain;
  /** The operator's own words for this expansion, so an approval can be re-read against the ask. */
  summary: string;
}

/**
 * The vocabulary of each domain, as patterns over the operator's words.
 *
 * Deliberately coarse and stated: it matches the product's own nouns. It cannot tell a well-scoped
 * "add password reset" from a speculative "add an identity platform", so it does not try — both land as
 * one `authentication` request, and the summary carries the words the operator used.
 */
const DOMAIN_PATTERNS: Array<{ domain: ExpansionDomain; pattern: RegExp }> = [
  { domain: "authentication", pattern: /\b(social login|oauth|sso|sign[- ]in|login|authentication|auth)\b/i },
  { domain: "payments", pattern: /\b(payments?|billing|subscriptions?|checkout|stripe|invoic\w+)\b/i },
  { domain: "mobile_app", pattern: /\b(mobile app|ios app|android app|mobile application|react native|flutter)\b/i },
  {
    domain: "data_layer_refactor",
    pattern: /\b(refactor\w*|rewrit\w+)\b.{0,40}\b(data layer|storage layer|persistence|database layer)\b|\b(data layer|data model)\b.{0,40}\b(refactor\w*|rewrit\w+)\b/i,
  },
];

/**
 * The rewrite that is refused instead of priced: the platform changing itself to serve one project.
 *
 * Measured in `s12r1` as an **option** on a gate. It is a refusal because the factory's own agnosticism
 * invariants (project-type, language, architecture) are what let one platform serve many projects, and a
 * core that hardcodes one project's values deletes the invariant for every other project. The statute's
 * P2 and gate F4 say the same thing; this is where a caller finds it out without reading the statute.
 */
const PLATFORM_REWRITE_PATTERNS: RegExp[] = [
  /\b(rewrite|hard-?code|bake|inline)\b.{0,60}\b(platform|factory|core|kernel|engine)\b/i,
  /\b(platform|factory|core)\b.{0,40}\b(rewrite|rewritten|hard-?coded)\b/i,
  /\bchange\s+(the\s+)?(platform|factory)('s)?\s+(own\s+)?(core|source|code)\b/i,
];

/** Where a domain's work would go, relative to a checkout root, and whether it exists today. */
const DOMAIN_PATHS: Record<Exclude<ExpansionDomain, "platform_rewrite" | "other">, string[]> = {
  authentication: ["src/auth/", "src/session/", "tests/auth/"],
  payments: ["src/payments/", "src/billing/", "tests/payments/"],
  mobile_app: ["mobile/ (a second deliverable beside this checkout)", "apps/mobile/"],
  data_layer_refactor: [],
};

export interface ScopeBlastRadiusInput {
  domain: ExpansionDomain;
  /** The checkout a repository link points at, as a filesystem path, when the link states one. */
  checkoutRoot?: string;
  /** What the checkout holds at its top level today. Read by the caller; keeps this function pure. */
  existingTopLevel?: string[];
}

/**
 * The paths a domain would touch, as `"<checkout>/<path>"`, so each entry can be checked against disk.
 *
 * Three rules, and each one is a decision:
 *
 * - **Every entry names a path, not a concern.** "The data layer" is not a blast radius; `src/` and
 *   `tests/` in that checkout are.
 * - **A path that does not exist says so.** A new feature's paths are future paths, and a list that
 *   presented them as present would be the seeded-README defect (BOARD F-003) one field over.
 * - **A refactor is priced against what is there.** Its radius is the checkout's own top-level content,
 *   read rather than guessed, because "the whole data layer" has no fixed directory and pretending
 *   otherwise would understate it.
 */
export function describeBlastRadius(input: ScopeBlastRadiusInput): string[] {
  const prefix = input.checkoutRoot?.replace(/\/+$/, "") ?? "";
  const join = (path: string) => (prefix ? `${prefix}/${path}` : path);

  if (input.domain === "platform_rewrite") {
    return [
      "the platform checkout (apps/core, apps/worker, apps/web, packages/contracts) — refused, not planned",
    ];
  }

  if (input.domain === "data_layer_refactor") {
    const existing = (input.existingTopLevel ?? []).filter((entry) => entry.trim().length > 0);
    if (existing.length === 0) {
      return [
        `${join(".")} — the checkout's own top level, every directory under it (nothing to enumerate: no top-level entries were read)`,
      ];
    }
    return existing.map((entry) => `${join(entry)} (exists today — its contents are what the refactor rewrites)`);
  }

  if (input.domain === "other") {
    return [
      `${join(".")} — not yet attributable to a directory: this expansion names no surface the product maps, so its radius is stated as the checkout and nothing narrower`,
    ];
  }

  return DOMAIN_PATHS[input.domain].map((path) => `${join(path)} (does not exist yet — this expansion creates it)`);
}

/**
 * What the expansion would cost, in the product's own counters rather than in money.
 *
 * The factory models two things an expansion spends: a plan preview, and one job per work item the plan
 * produces. It does not model currency, so it does not claim any — a gate that quoted a dollar figure
 * would be inventing one.
 */
export function describeCost(domain: ExpansionDomain): string {
  if (domain === "platform_rewrite") {
    return "no cost: refused before planning, so no preview and no job is spent on it.";
  }
  return (
    "one plan preview and one execution job per leaf the plan produces, charged to this project's line " +
    "after approval rather than now. Nothing is spent while the request is parked."
  );
}

const REQUEST_SEPARATOR = /[,;]|\band\b|\bplus\b|\balso\b|\bthen\b/i;

/**
 * Clauses that are the **speaker's frame**, not an ask: a time or manner the request is wrapped in.
 *
 * *"While you're at it, also add … Start immediately."* split into five clauses, and the fifth —
 * *"Start immediately."* — matched no domain, so it arrived as a fifth `other` request and the operator was
 * asked to approve his own urgency. Measured on the first run of this classifier against the suite's own
 * prompt. A frame is dropped; an ask that names no domain is kept, because dropping that one would narrow
 * what the emperor asked for.
 */
const FRAMING_CLAUSES: RegExp[] = [
  /^while you'?re at it\b/i,
  /^start (immediately|now|right away)\b/i,
  /^(do it|do this) (now|immediately)\b/i,
  /^(please|go ahead)\b/i,
];

function isFraming(clause: string): boolean {
  return FRAMING_CLAUSES.some((pattern) => pattern.test(clause.trim()));
}

/**
 * Splits the operator's ask into expansions, one per domain, preserving their words.
 *
 * One request per domain even when the sentence mentions a domain twice: approving *payments* must not
 * leave a second payments row to approve. A clause that maps to no domain becomes an `other` request
 * whose summary is the clause itself — dropping it would silently narrow what the emperor asked for.
 */
export function classifyExpansions(request: string): ClassifiedExpansion[] {
  const clauses = request
    .split(REQUEST_SEPARATOR)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 3);

  const byDomain = new Map<ExpansionDomain, string[]>();
  for (const clause of clauses) {
    if (isFraming(clause)) continue;
    const rewrite = PLATFORM_REWRITE_PATTERNS.some((pattern) => pattern.test(clause));
    const domain: ExpansionDomain = rewrite
      ? "platform_rewrite"
      : DOMAIN_PATTERNS.find((entry) => entry.pattern.test(clause))?.domain ?? "other";
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), clause]);
  }

  // An empty split (a one-clause sentence with no separator) still yields that clause above; a request
  // that produced nothing at all is stored as one `other` row rather than as zero rows, so the operator's
  // ask is never answered with an empty list.
  if (byDomain.size === 0) {
    return [{ domain: "other", summary: request.trim() }];
  }

  return [...byDomain.entries()].map(([domain, matched]) => ({
    domain,
    summary: matched.join("; "),
  }));
}

/** The refusal a `platform_rewrite` carries. Stated once, read by every surface. */
export const PLATFORM_REWRITE_REFUSAL =
  "Refused, not parked. The factory does not rewrite its own platform as project work: a core that " +
  "hardcoded one project's values would delete the project-agnosticism that lets the same platform serve " +
  "every other project, and the values it would hardcode already exist as records. If what is wanted is " +
  "that one project behaves differently, that is a per-project setting, and it is its own request.";
