import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessPlanChecks,
  documentedCommands,
  linkedFileCheckout,
  traceabilityOf,
} from "../../src/delegator/check-validation.js";
import type { PlannedWorkItem } from "../../src/delegator/types.js";

/**
 * Locks for **a plan's checks are traceable to the checkout** — the half of F-003 that suite 18 measures as
 * scenario B, and the reason that scenario is in the suite at all.
 *
 * The defect, measured 2026-11-05 on suite 18's first run (`s18a1`), on a checkout whose only files were
 * `main.py` (a `def main(): pass` stub) and one scratch note:
 *
 * The front office opened the work order, said plainly *"this repository declares **no check today**"*, and then
 * handed all three leaves `python3 -m unittest discover -s tests -v` — for a repository with no `tests/`
 * directory, no manifest and no README — and applied the plan. Nothing failed at the time, because nothing read
 * the checkout: the criteria were accepted, the leaves were persisted, and the vacancy would have surfaced as a
 * leaf that could not be closed. The suite's oracle calls exactly that an invented default and fails it.
 *
 * The three shapes asserted below are the three ways a check can honestly be traceable, and the fourth case is
 * the one that must refuse:
 *
 * 1. declared at the repository root (a `Makefile` target) — suite 18's scenario A;
 * 2. declared in a subdirectory the criterion names (a crate's `Cargo.toml`) — scenario C's Rust half;
 * 3. stated in the checkout's own documentation (a command span in `README.md`) — scenario C's Python half;
 * 4. declared nowhere — scenario B, which is a question, never a command.
 */
describe("a plan's checks are traceable to the checkout (F-003 / suite 18)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  /** Scenario A: a Makefile-wrapped Python checkout, like `eval-seed-py`. */
  function pythonCheckout(): string {
    const root = tempDir("kampaku-s18-a-");
    mkdirSync(join(root, "src", "textstats"), { recursive: true });
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "Makefile"), "check:\n\tpython3 -m unittest discover -s tests -v\n");
    writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"textstats\"\n");
    writeFileSync(join(root, "AGENTS.md"), "- `make check` is the only required check.\n");
    return root;
  }

  /** Scenario B: nothing declares a check anywhere — no manifest, no runner, no CI, no README, no tests/. */
  function bareCheckout(): string {
    const root = tempDir("kampaku-s18-b-");
    writeFileSync(join(root, "main.py"), "def main():\n    pass\n");
    writeFileSync(join(root, "PRIVATE-NOTES.md"), "scratch\n");
    return root;
  }

  /** Scenario C: two toolchains, no root declaration — a Rust crate and a Python package, per-part commands. */
  function polyglotCheckout(): string {
    const root = tempDir("kampaku-s18-c-");
    mkdirSync(join(root, "engine", "src"), { recursive: true });
    mkdirSync(join(root, "engine", "tests"), { recursive: true });
    mkdirSync(join(root, "pycal", "pkg"), { recursive: true });
    mkdirSync(join(root, "pycal", "tests"), { recursive: true });
    writeFileSync(join(root, "engine", "Cargo.toml"), "[package]\nname = \"engine\"\nversion = \"0.1.0\"\n");
    writeFileSync(join(root, "engine", "src", "lib.rs"), "pub fn add(a: i64, b: i64) -> i64 { a + b }\n");
    writeFileSync(join(root, "pycal", "pkg", "__init__.py"), "def double(n):\n    return n * 2\n");
    writeFileSync(
      join(root, "README.md"),
      "# polyglot-demo\n\n- `cargo test --manifest-path engine/Cargo.toml`\n- `python3 -m unittest discover -s pycal/tests`\n",
    );
    return root;
  }

  function leaf(title: string, criteria: string[]): PlannedWorkItem {
    return { title, description: `${title} — one small change, honestly scoped.`, acceptance_criteria: criteria } as PlannedWorkItem;
  }

  it("accepts a plan whose criterion names the check the repository declares at its root", () => {
    const root = pythonCheckout();
    const assessment = assessPlanChecks(
      [leaf("Add a test for load()", ["`make check` exits 0 from the repository root."])],
      { checkoutPath: root },
    );
    expect(assessment.findings).toEqual([]);
    expect(traceabilityOf("`make check` exits 0", "test", root)).toEqual({
      evidence: "make check (from Makefile target check)",
    });
  });

  it("refuses a plan that invents a check for a checkout that declares none — and says what it looked for", () => {
    const root = bareCheckout();
    const assessment = assessPlanChecks(
      [
        leaf("Establish the test harness", ["`python3 -m unittest discover -s tests -v` exits 0 and reports OK."]),
        leaf("Implement the greeting", ["`python3 -m unittest discover -s tests -v` lists the greeting tests."]),
      ],
      { checkoutPath: root, repositoryLabel: "file:///tmp/eval-seed-other" },
    );

    expect(assessment.declaresNothing).toBe(true);
    expect(assessment.findings).toHaveLength(2);
    // The finding is the question: it names the leaf, the check, the criterion and every place that was read.
    const [finding] = assessment.findings;
    expect(finding.kind).toBe("check_untraceable");
    expect(finding.check).toBe("test");
    expect(finding.detail).toContain("Establish the test harness");
    expect(finding.detail).toContain("python3 -m unittest discover -s tests -v");
    expect(finding.detail).toContain("package.json scripts");
    expect(finding.detail).toContain("Cargo.toml");
    expect(finding.detail).toContain("README.md");
    expect(finding.detail).toContain("Ask the emperor which command proves this change");
    expect(assessment.summary).toContain("states no check");
  });

  it("accepts per-part commands in a polyglot checkout, from the subdirectory and from the documentation", () => {
    const root = polyglotCheckout();
    const assessment = assessPlanChecks(
      [
        leaf("Rust: add engine::double + parity test", [
          "`cargo test --manifest-path engine/Cargo.toml` exits 0 and reports the parity test as ok.",
        ]),
        leaf("Python: add pkg.add + parity test", [
          "`PYTHONPATH=pycal python3 -m unittest discover -s pycal/tests` exits 0 and reports both tests as ok.",
        ]),
      ],
      { checkoutPath: root },
    );
    expect(assessment.findings).toEqual([]);
    // Each half is traceable to its *own* part, not to a root default.
    expect(traceabilityOf("`cargo test --manifest-path engine/Cargo.toml` exits 0", "test", root)).toBeDefined();
    expect(
      traceabilityOf("`PYTHONPATH=pycal python3 -m unittest discover -s pycal/tests` exits 0", "test", root),
    ).toEqual({ evidence: "documented command `python3 -m unittest discover -s pycal/tests`" });
    expect(documentedCommands(root)).toEqual([
      "cargo test --manifest-path engine/Cargo.toml",
      "python3 -m unittest discover -s pycal/tests",
    ]);
  });

  it("refuses a check the checkout declares under another name, and reports the ones it does declare", () => {
    const root = pythonCheckout();
    const assessment = assessPlanChecks(
      [leaf("Lint the package", ["`ruff check .` exits 0 with no findings."])],
      { checkoutPath: root },
    );
    expect(assessment.declaresNothing).toBe(false);
    expect(assessment.findings).toHaveLength(1);
    expect(assessment.findings[0].check).toBe("lint");
    expect(assessment.findings[0].detail).toContain("make check");
  });

  it("says nothing about a checkout this process cannot read", () => {
    // A verdict about a repository nobody read is the same mistake in the other direction.
    expect(assessPlanChecks([leaf("Anything", ["`npm test` passes"])], { checkoutPath: undefined }).findings).toEqual([]);
    expect(assessPlanChecks([leaf("Anything", ["`npm test` passes"])], { checkoutPath: "/nonexistent/checkout" }).findings).toEqual([]);
  });

  it("reads a file:// repository reference, and refuses to pretend about any other", () => {
    const root = pythonCheckout();
    expect(linkedFileCheckout(`file://${root}`)).toBe(root);
    expect(linkedFileCheckout("https://example.com/repo.git")).toBeUndefined();
    expect(linkedFileCheckout(undefined)).toBeUndefined();
  });

  it("accepts a criterion naming the check script a legacy checkout documents (suite 19)", () => {
    // Measured 2026-11-05 on suite 19's first run: the checkout has no manifest, no Makefile and no `tests/`;
    // its `CONTRIBUTING.md` says *"`./run-tests.sh` is the only supported check command"* and its `README.rst`
    // repeats it. The plan quoted that command, the vocabulary knew no such shape, and the executor refused to
    // run it — so nothing could show what was broken.
    const root = tempDir("kampaku-s19-legacy-");
    mkdirSync(join(root, "src", "ledger"), { recursive: true });
    mkdirSync(join(root, "checks"), { recursive: true });
    writeFileSync(join(root, "run-tests.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(join(root, "README.rst"), "Running the checks\n------------------\n\n::\n\n    ./run-tests.sh\n");
    writeFileSync(join(root, "CONTRIBUTING.md"), "- `./run-tests.sh` is the only supported check command.\n");

    expect(traceabilityOf("`./run-tests.sh` exits 0", "test", root)).toEqual({
      evidence: "./run-tests.sh (from run-tests.sh (executable check script))",
    });
    const assessment = assessPlanChecks(
      [leaf("Fix parse_lines", ["`./run-tests.sh` prints `ok` for both checks and exits 0."])],
      { checkoutPath: root },
    );
    expect(assessment.findings).toEqual([]);
    expect(assessment.declaresNothing).toBe(false);
  });

  it("reads a README that is not markdown, and still refuses a script the checkout cannot run", () => {
    const root = tempDir("kampaku-s19-rst-");
    writeFileSync(join(root, "README.rst"), "Checks\n======\n\n``./deploy-check`` (see the ops wiki)\n");
    // A backtick span naming a file that is not in the checkout is not a command this repository declares.
    expect(documentedCommands(root)).toEqual([]);
    expect(traceabilityOf("`./deploy-check` exits 0", "test", root)).toBeUndefined();
  });
});
