import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inferRequiredCheckScripts } from "../application/pm/work-item-checks.js";
import { resolveDeclaredCheckCommands, type DeclaredCheckCommand } from "../application/pm/declared-checks.js";
import { isContainerPlannedItem, type PlannedWorkItem } from "./types.js";

/**
 * @module delegator/check-validation
 *
 * **A plan's checks are traceable to the checkout, or the plan says so out loud.**
 *
 * Why this exists. Suite 18 measures two things a plan can get wrong about a project's toolchain, and the first
 * one is silence: scenario B is a checkout with **no** discoverable check (no manifest, no task runner, no CI, no
 * README, no `tests/`), and the suite's oracle says the factory must *ask* for the missing check rather than
 * invent one. Measured 2026-11-05 on that suite's first run (`s18a1`): the front office opened the work order,
 * said correctly that *"this repository declares no check today"*, handed every leaf
 * `python3 -m unittest discover -s tests -v` — a command invented for a checkout with no `tests/` directory —
 * and applied the plan. The words were honest; the record was not. Nothing in the product had read the checkout
 * and nothing stopped the write, so F-003 produced a fourth shape of the same defect.
 *
 * The rule is the one `application/pm/declared-checks.ts` already applies when it *writes* a criterion:
 * evidence or nothing. A criterion naming a check the checkout does not declare anywhere is a finding; a finding
 * is reported on a preview and refuses an apply, because the caller's next move is a question to the emperor, not
 * a different command.
 *
 * **Where the evidence may come from** — all four places the product already trusts, so a legitimately
 * polyglot plan is not refused for being polyglot:
 *
 * 1. a declaration at the repository root (`Makefile` target, `package.json` script, `Cargo.toml`, …);
 * 2. a declaration in a **subdirectory the criterion names**, which is how a polyglot repository is checked —
 *    `cargo test --manifest-path engine/Cargo.toml` is traceable to `engine/Cargo.toml`, and the fact that the
 *    root declares nothing is the repository's shape rather than a gap;
 * 3. a command the checkout's own **documentation** states (README, AGENTS.md, `docs/`), which is the only
 *    evidence a script-less project has;
 * 4. nothing else. Never a template, never another project, never a command the checkout merely *could* run.
 *
 * What it deliberately does not judge: whether the plan is good, whether a declared check is the right one, or
 * whether a criterion states its result well. Those belong to `plan-validation.ts` and to the reviewer.
 */

/** One thing the plan requires that the checkout cannot show it declares. */
export interface PlanCheckFinding {
  /** `check_untraceable` — a criterion requires a check the checkout declares nothing for. */
  kind: "check_untraceable";
  /** The leaf the finding is about. */
  title: string;
  /** The neutral check name the criterion requires (`test`, `lint`, …). */
  check: string;
  /** The criterion that requires it, verbatim, so a reader can see what was written. */
  criterion: string;
  /**
   * One sentence naming the check, the criterion, what was looked for in the checkout, and what to do instead.
   * This is the sentence the front office raises to the emperor, so it has to be answerable on its own.
   */
  detail: string;
}

export interface PlanCheckAssessment {
  findings: PlanCheckFinding[];
  /** The block a caller prints in the response the emperor reads. Absent when there is nothing to report. */
  summary?: string;
  /** True when the checkout states no check anywhere — the case that must become a question, not a default. */
  declaresNothing: boolean;
}

/**
 * The places this reads when it says a checkout declares no check.
 *
 * Named in the finding on purpose: an operator asked "which command proves this change?" is owed the list of
 * places the platform already looked, or the question is a quiz rather than a report.
 */
export const CHECK_EVIDENCE_MARKERS: readonly string[] = [
  "package.json scripts",
  "a Makefile or justfile target",
  "pyproject.toml, setup.py, setup.cfg, pytest.ini or tox.ini",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "a CI workflow",
  "an existing tests/ directory",
  "a command stated in README.md, AGENTS.md or docs/",
];

function markersSentence(): string {
  const markers = CHECK_EVIDENCE_MARKERS;
  return `${markers.slice(0, -1).join(", ")} nor ${markers[markers.length - 1]}`;
}

/** Manifests and entry points a criterion can name the directory of, e.g. `engine/Cargo.toml`. */
const NAMED_MANIFEST = /(?:^|[\s(`"'])([\w.-]+(?:\/[\w.-]+)*)\/(Cargo\.toml|package\.json|pyproject\.toml|setup\.py|go\.mod|Makefile|justfile)/g;

/** Documentation that states a command the project actually runs. */
const DOCUMENTATION_FILES = ["README.md", "README", "AGENTS.md", "CONTRIBUTING.md"];
const DOCUMENTATION_DIRECTORIES = ["docs"];

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Commands the checkout's own documentation states, as command lines.
 *
 * The documentation is read for **code spans and fenced blocks**, not for prose: `README.md` says
 * *"run the tests"* in a sentence and *"`python3 -m unittest discover -s pycal/tests`"* in a span, and only the
 * second is a command. A span is a command when the runner's own vocabulary recognises it and it leads with a
 * program name — the same test `isBehaviorCriterion` applies to a criterion.
 */
export function documentedCommands(root: string): string[] {
  const paths = [
    ...DOCUMENTATION_FILES.map((name) => join(root, name)),
    ...DOCUMENTATION_DIRECTORIES.flatMap((name) => {
      const dir = join(root, name);
      if (!isDirectory(dir)) return [];
      try {
        return readdirSync(dir)
          .filter((entry) => entry.endsWith(".md"))
          .map((entry) => join(dir, entry));
      } catch {
        return [];
      }
    }),
  ];

  const commands = new Set<string>();
  for (const path of paths) {
    const text = readText(path);
    if (text === null) continue;
    const spans = text.matchAll(/`([^`\n]+)`/g);
    for (const span of spans) {
      const command = span[1].trim();
      if (!/^[A-Za-z0-9_./-]/.test(command)) continue;
      if (inferRequiredCheckScripts(command).length === 0) continue;
      commands.add(command);
    }
  }
  return [...commands];
}

/**
 * Declarations available to a criterion that names a subdirectory's manifest.
 *
 * This is what keeps a polyglot plan honest instead of refused: the root of such a repository declares nothing
 * by design, and the criterion that names `engine/Cargo.toml` is traceable to a file that does.
 */
function declaredForNamedManifests(criterion: string, root: string): Set<string> {
  const names = new Set<string>();
  for (const match of criterion.matchAll(NAMED_MANIFEST)) {
    const directory = join(root, match[1]);
    if (!isDirectory(directory)) continue;
    for (const declaration of resolveDeclaredCheckCommands(directory)) names.add(declaration.name);
  }
  return names;
}

/**
 * Whether one criterion's requirement is traceable to the checkout, and if so to what.
 *
 * Returns the evidence sentence when traceable, `undefined` when it is not — so the caller reports what it read
 * rather than only that it failed.
 */
export function traceabilityOf(
  criterion: string,
  check: string,
  root: string,
): { evidence: string } | undefined {
  const declared = resolveDeclaredCheckCommands(root);
  const atRoot = declared.find((declaration) => declaration.name === check);
  if (atRoot) return { evidence: `${atRoot.command} (from ${atRoot.evidence})` };

  if (declaredForNamedManifests(criterion, root).has(check)) {
    const named = [...criterion.matchAll(NAMED_MANIFEST)].map((match) => `${match[1]}/${match[2]}`);
    return { evidence: `${check} declared by ${named.find((path) => isDirectory(join(root, path.split("/")[0]))) ?? named[0]}` };
  }

  const documented = documentedCommands(root).find(
    (command) => criterion.includes(command) && inferRequiredCheckScripts(command).includes(check),
  );
  if (documented) return { evidence: `documented command \`${documented}\`` };

  return undefined;
}

/**
 * Reads a plan and reports every criterion whose required check the checkout declares nowhere.
 *
 * `checkoutPath` absent means the repository is not on this machine (a fresh project whose scaffold writes the
 * checks afterwards, or a URL this process cannot read). That is not a finding: the platform would be inventing
 * a verdict about a checkout it never saw, which is the same mistake in the other direction.
 */
export function assessPlanChecks(
  items: PlannedWorkItem[],
  options: { checkoutPath?: string; repositoryLabel?: string },
): PlanCheckAssessment {
  const checkoutPath = options.checkoutPath;
  if (!checkoutPath || !existsSync(checkoutPath)) {
    return { findings: [], declaresNothing: false };
  }

  const label = options.repositoryLabel ?? checkoutPath;
  const declared = resolveDeclaredCheckCommands(checkoutPath);
  const documented = documentedCommands(checkoutPath);
  const declaresNothing = declared.length === 0 && documented.length === 0;
  const findings: PlanCheckFinding[] = [];

  for (const item of items) {
    if (isContainerPlannedItem(item, items)) continue;
    for (const criterion of item.acceptance_criteria ?? []) {
      for (const check of inferRequiredCheckScripts(criterion)) {
        if (traceabilityOf(criterion, check, checkoutPath)) continue;
        const detail = declaresNothing
          ? `This repository states no check at all: nothing in ${label} declares one — no ${markersSentence()}. ` +
            `The leaf "${item.title}" requires a \`${check}\` check through the criterion "${criterion}", and no ` +
            `file in that checkout justifies any command. Ask the emperor which command proves this change, ` +
            `naming what was looked for; do not carry one over from another project.`
          : `The leaf "${item.title}" requires a \`${check}\` check through the criterion "${criterion}", and ` +
            `${label} declares none of that name — it declares ${[
              ...declared.map((command) => `${command.name} (\`${command.command}\` from ${command.evidence})`),
              ...(declared.length === 0 && documented.length > 0
                ? documented.map((command) => `\`${command}\` (documented)`)
                : []),
            ].join(", ")}. Use one of those, or ask the emperor which command proves this change.`;
        findings.push({ kind: "check_untraceable", title: item.title, check, criterion, detail });
      }
    }
  }

  if (findings.length === 0) return { findings, declaresNothing };

  const distinct = [...new Set(findings.map((finding) => finding.check))];
  const summary = declaresNothing
    ? `This repository states no check: no ${markersSentence()}. ` +
      `${findings.length} criterion/criteria in the plan name a \`${distinct.join("`, `")}\` check anyway, ` +
      `so the plan was not applied. Ask the emperor which command proves the change before planning again.`
    : `${findings.length} criterion/criteria in the plan require a check the checkout does not declare ` +
      `(${distinct.join(", ")}). ${label} declares ${[
        ...declared.map((command) => `\`${command.command}\``),
        ...(declared.length === 0 ? documented.map((command) => `\`${command}\` (documented)`) : []),
      ].join(", ")}.`;

  return { findings, summary, declaresNothing };
}

/** The declared checks of a checkout, for callers that need to report them next to a verdict. */
export function declarationsOf(checkoutPath: string | undefined): DeclaredCheckCommand[] {
  return checkoutPath ? resolveDeclaredCheckCommands(checkoutPath) : [];
}

/**
 * The filesystem path of a `file://` repository reference, when this process can see it.
 *
 * Absent for an HTTP clone, an unreadable path, or a project that has not been created yet — and absent is the
 * honest answer, because a verdict about a checkout this process never read would be an invention.
 */
export function linkedFileCheckout(url: string | undefined): string | undefined {
  if (!url?.startsWith("file://")) return undefined;
  try {
    const path = fileURLToPath(url);
    return existsSync(path) ? path : undefined;
  } catch {
    return undefined;
  }
}
