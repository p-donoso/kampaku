import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dispatchRequiredChecks, requiredPassingChecksFor } from "../../src/application/pm/leaf-checks.js";
import { assertsCheckSuccess } from "../../src/application/pm/work-item-checks.js";

/**
 * **"exit status 0" is a success assertion, and a leaf that names it is judged by its own check.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r21`. The plan wrote its repair leaf's criteria in this voice:
 *
 * - `ac-1` — *"Completion report contains a fenced block showing `PYTHONPATH=src python3 checks/test_parse.py`
 *   command, **exit status 0**, and ok line"*
 * - `ac-2` — *"… showing `./run-tests.sh` command, exit status, and test_parse.py **reported ok**"*
 *
 * `SUCCESS_ASSERTION` knew *exits 0*, *exit code 0*, *passes*, *succeeds* — and not *exit status 0*. So the leaf
 * read as **asserting nothing green**, Core dispatched `requiredChecks: []`, the worker fell back to inferring the
 * aggregate runner from the prose, and the leaf was failed
 * `WORKER_CHECKS_INCOMPLETE: Required checks failed: test` with its own fix correctly applied and its own check
 * green — `checks/test_parse.py ... ok`, `checks/test_totals.py ... FAILED`, the second being its **sibling's**
 * defect. The item went blocked, was re-dispatched, and the re-dispatch found its work already on disk.
 *
 * That is suite 19's axis: a leaf failed for a defect it has nothing to do with. The other half is worse — a leaf
 * whose criteria assert nothing green is never asked to make anything pass, so the reading is load-bearing in both
 * directions and its vocabulary has to cover the wording a plan actually writes.
 */
/** The fixture lives for the whole file: a `afterEach` cleanup would delete it between cases (which it did). */
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * The fixture this lock reads, built here rather than pointed at.
 *
 * It used to be an absolute path into one machine's `~/kampaku-projects`, so on CI the checkout did not exist: the
 * reader found no declared check, fell back to the aggregate `test`, and the two cases that ask for
 * `checks/test_parse.py` failed with `expected [ 'test' ] to deeply equal [ 'checks/test_parse.py' ]` — a red that
 * says nothing about the product and everything about the fixture (measured 2026-11-23 on the whole of `develop`'s
 * CI). The shape is the legacy checkout's: one runner, two executable checks it enumerates, a `PYTHONPATH` for the
 * library.
 */
function legacyCheckout(): string {
  const root = mkdtempSync(join(tmpdir(), "kampaku-s19-vocabulary-"));
  dirs.push(root);
  mkdirSync(join(root, "checks"), { recursive: true });
  mkdirSync(join(root, "src", "ledger"), { recursive: true });
  writeFileSync(join(root, "src", "ledger", "__init__.py"), "");
  for (const name of ["test_parse.py", "test_totals.py"]) {
    writeFileSync(join(root, "checks", name), "assert True\n", { mode: 0o755 });
  }
  writeFileSync(
    join(root, "run-tests.sh"),
    [
      "#!/bin/sh",
      "set -u",
      "for check in checks/test_*.py; do",
      '    PYTHONPATH=src python3 "$check" || exit 1',
      "done",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return root;
}

const CHECKOUT = legacyCheckout();

describe("the success vocabulary a plan writes (suite 19 / s19r21)", () => {
  it("reads the status wording the plan used", () => {
    for (const text of [
      "…command, exit status 0, and ok line",
      "…command, exit status: 0",
      "…the runner's exit status is 0",
      "test_parse.py reported ok",
      "the runner prints an ok line",
      "./run-tests.sh exits 0",
      "./run-tests.sh exit code 0",
      "the check passes",
    ]) {
      expect(assertsCheckSuccess(text), text).toBe(true);
    }
  });

  it("still reads an observation as an observation — the baseline leaf keeps working", () => {
    for (const text of [
      "Per-check status is recorded separately (ok or FAILED)",
      "The completion report quotes the runner's verbatim output and its exit status",
      "./run-tests.sh exits non-zero and both checks print FAILED",
    ]) {
      expect(assertsCheckSuccess(text), text).toBe(false);
    }
  });

  it("asks a repair leaf for its own enumerated check, not the whole runner whose other check is red", () => {
    const leaf = {
      title: "Make parse_lines skip comment lines",
      acceptanceCriteria: [
        "Completion report contains a fenced block showing PYTHONPATH=src python3 checks/test_parse.py command, exit status 0, and ok line",
        "Completion report contains a fenced block showing ./run-tests.sh command, exit status, and test_parse.py reported ok",
        "git diff --stat shows only src/ledger/parse.py modified (or no change if fix proved unnecessary)",
      ],
    };
    // Before the vocabulary fix this answered `[]`, and the worker's own inference then demanded `test`.
    expect(requiredPassingChecksFor(leaf, CHECKOUT)).toEqual(["checks/test_parse.py"]);
    expect(dispatchRequiredChecks(leaf, CHECKOUT)).toEqual(["checks/test_parse.py"]);
  });

  it("leaves the verification leaf on the aggregate, because its criterion names the whole run", () => {
    const verification = {
      title: "Final proof run of all declared checks and minimal-diff audit",
      acceptanceCriteria: [
        "./run-tests.sh exits 0 with both checks reported ok",
        "git status --porcelain lists exactly the two repaired files",
      ],
    };
    expect(requiredPassingChecksFor(verification, CHECKOUT)).toEqual(["test"]);
  });
});
