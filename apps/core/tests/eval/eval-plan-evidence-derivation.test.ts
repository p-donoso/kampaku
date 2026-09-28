import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";

/**
 * Suite 07's second lock: **the plan's check commands come from the project, not from a template (F2).**
 *
 * The suite's oracle: *"Every check command in the plan runs in this project at the current commit and
 * produces a meaningful result. Commands that fail because they are not part of this project's toolchain
 * are a failure of this suite."* And its prompt 2 asks the factory to trace each derived command to the
 * file or convention it came from.
 *
 * Measured 2026-09-26 taking suite 07 on a Python checkout (`pyproject.toml`, a `Makefile` exposing
 * `check` and `lint`, `unittest` tests, a README documenting exactly those two commands): prompt 2
 * answered correctly and traceably — both commands, named from the Makefile — so the *front-office half*
 * of the promise held on that turn.
 *
 * What did not hold was the **plan path's own instruction set**. The fragment a lead reads before writing
 * leaves said: *"Every leaf AC names the exact npm command the worker will run (npm test, npm run
 * build)"*, and *"At most 3 new files and 2 npm scripts per leaf"*. A lead holding that instruction writes
 * `npm test` into the acceptance criteria of a Python repository's leaves — which is precisely the leak
 * BOARD F-003 records ("the platform's skill catalog is still web-shaped") and the failure this suite's
 * oracle names. The catalog is where the template lived, not the model.
 *
 * Three things are asserted, and the third keeps the first two honest:
 *
 * 1. **No fragment in the plan path names a stack the repository did not declare.** A fragment may speak
 *    about a specific ecosystem only when it is *conditional on that ecosystem being present*, which is
 *    how the same catalogue already handles it elsewhere.
 * 2. **The fragment that governs leaves states the derivation** — the command comes from this repository's
 *    own toolchain (manifest, task runner, CI workflow, existing tests, documented commands).
 * 3. **The control.** The fragment exists, is non-empty, and still carries the leaf-AC requirement, so the
 *    absence of `npm` is a decision rather than a deleted rule.
 */

const REPO_ROOT = resolve(process.cwd(), "../..");
const CATALOG = join(REPO_ROOT, "packages/contracts/skills");

/** Fragments that instruct the planning path: they gate on `submit_intent` or are the plan-quality rules. */
function planPathFragments(): Array<{ slug: string; body: string; allowedTools: string }> {
  return readdirSync(CATALOG, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const slug = entry.name;
      const body = readFileSync(join(CATALOG, slug, "SKILL.md"), "utf8");
      const frontmatter = body.split("---")[1] ?? "";
      const allowed = /allowed-tools:\s*(.*)/.exec(frontmatter)?.[1] ?? "";
      return { slug, body, allowedTools: allowed };
    })
    .filter(
      (fragment) =>
        fragment.slug === "system-plan-quality" || fragment.allowedTools.includes("submit_intent"),
    );
}

describe("eval 07 — a plan's checks are derived from the project's toolchain, never from a template", () => {
  it("the plan path holds at least one rule fragment, so the check is not vacuous", () => {
    const fragments = planPathFragments();
    expect(fragments.map((fragment) => fragment.slug)).toContain("system-plan-quality");
    expect(fragments.length).toBeGreaterThan(1);
    for (const fragment of fragments) {
      expect(fragment.body.trim().length, `${fragment.slug} has a body`).toBeGreaterThan(0);
    }
  });

  it("states that a leaf's check command comes from this repository's own toolchain", () => {
    const planQuality = planPathFragments().find((fragment) => fragment.slug === "system-plan-quality");
    expect(planQuality, "the leaf rule exists").toBeDefined();
    const body = planQuality!.body;
    // The rule: derived from the repository, in the repository's own toolchain.
    expect(body).toMatch(/own toolchain|repository's own toolchain/i);
    expect(body).toMatch(/manifest|task runner|CI workflow/i);
    // The control: the leaf-AC requirement itself was not deleted to make the assertion above easy.
    expect(body).toMatch(/Every leaf AC names the exact check command/i);
    expect(body).toMatch(/never name a command this checkout cannot run/i);
  });

  it("names no ecosystem as the default for a repository that did not declare it", () => {
    // The measured defect: the plan path told every lead to write `npm test` into every leaf AC, whatever
    // the repository was. Node is allowed to appear only as a conditional example, so the assertion is
    // about *unconditional* package-manager verbs and script counts.
    const offenders: string[] = [];
    for (const fragment of planPathFragments()) {
      for (const pattern of [
        /every leaf ac names the exact npm/i,
        /the worker will run \(npm/i,
        /\bnpm scripts? per leaf\b/i,
        /package\.json\b/i,
        /\bnpm install\b/i,
      ]) {
        if (pattern.test(fragment.body)) offenders.push(`${fragment.slug}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the front office's own instructions stack-free and pointed at the project", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;
    expect(prompt).not.toMatch(/\bnpm\b/);
    expect(prompt).not.toMatch(/package\.json/);
    expect(prompt).toMatch(/Every check command comes from this project's own toolchain/i);
    // The sources are still named by the prompt. What changed on 2026-09-28 is **who reads them**: the seat
    // that writes the plan, not the front office. Five runs of suite 07 measured what the other division
    // cost — the front office spent eight to sixteen `read_repository` calls per turn on a twelve-file
    // checkout and delegated once, last (BOARD F-064) — so the prompt names the sources and names the reader.
    expect(prompt).toMatch(/manifest, task runner, CI workflow, existing tests/i);
    expect(prompt).toMatch(/README/);
    expect(prompt).toMatch(/The seat that reads the repository and writes the plan is the one that names them/i);
    // And it must not ask this seat to do the reading itself: an instruction that names a capability the
    // seat does not hold is the shape every one of these findings takes.
    expect(prompt).toMatch(/Do not read the repository yourself/i);
    // The other half of the oracle: the reply must carry the steps with their owners and their evidence,
    // read back from durable state rather than re-described.
    expect(prompt).toMatch(/every step with its id, its owner's slug, its status, its exact check command, and its acceptance evidence/i);
  });
});
