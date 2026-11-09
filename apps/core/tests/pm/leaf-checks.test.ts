import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { declaredCheckScriptMembers, resolveDeclaredCheckCommands } from "../../src/application/pm/declared-checks.js";
import { requiredPassingChecksFor } from "../../src/application/pm/leaf-checks.js";
import { inferReadOnlyJob } from "../../src/application/pm/deliverable-requirements.js";

/**
 * **A leaf proves what it owns; the plan's gate proves the whole.**
 *
 * Measured 2026-11-08 on suite 19 run `s19r7`, on the legacy checkout whose only check is `run-tests.sh`
 * looping `checks/test_*.py` with `PYTHONPATH=src python3`:
 *
 * - the plan's first repair leaf named its own proof, `PYTHONPATH=src python3 checks/test_parse.py`, which is a
 *   file that runner enumerates;
 * - the job's required check resolved to the whole `./run-tests.sh`, which still failed on the **other** defect;
 * - the job wrote the correct one-line fix and was failed `WORKER_CHECKS_INCOMPLETE` for a defect it had nothing
 *   to do with; the item went `blocked`, and the re-dispatch then failed `WORKER_NO_DELIVERABLES` because the fix
 *   was already on disk. Two failures on one leaf, for a repair that was right.
 *
 * Two readings make the fix possible, and both are evidence-only: a runner that enumerates a file **declares
 * that file as a check**, and a leaf whose criteria quote it is judged on it.
 */
describe("the checks a leaf must pass (suite 19 / s19r7)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-leaf-checks-"));
    dirs.push(dir);
    return dir;
  }

  /** The legacy checkout shape: one runner, two executable checks inside it, a PYTHONPATH for the library. */
  function legacyCheckout(): string {
    const root = tempDir();
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

  it("reads the files a runner enumerates as checks the repository declares", () => {
    const root = legacyCheckout();
    expect(declaredCheckScriptMembers(root, "run-tests.sh")).toEqual([
      // The runner invokes each file through `PYTHONPATH=src python3`, so the command says so: a check that is not
      // executable is still a check when an interpreter runs it, which is how this fixture is written on disk.
      { name: "checks/test_parse.py", command: "python3 checks/test_parse.py", evidence: "checks/test_parse.py (enumerated by run-tests.sh)" },
      { name: "checks/test_totals.py", command: "python3 checks/test_totals.py", evidence: "checks/test_totals.py (enumerated by run-tests.sh)" },
    ]);
    // The runner itself is still the aggregate check, unchanged.
    expect(resolveDeclaredCheckCommands(root).map((command) => command.name)).toEqual([
      "test",
      "checks/test_parse.py",
      "checks/test_totals.py",
    ]);
  });

  it("judges a repair leaf on the member its criteria quote, not on the aggregate", () => {
    const root = legacyCheckout();
    const leaf = {
      title: "Repair D1: skip comment lines in parse_lines",
      description: "Change only src/ledger/parse.py.",
      acceptanceCriteria: [
        "`PYTHONPATH=src python3 checks/test_parse.py` exits 0.",
        "`./run-tests.sh` exits 0.",
      ],
    };

    // The measured defect: the aggregate was required, so the leaf was asked to fix the other defect too.
    expect(requiredPassingChecksFor(leaf, root)).toEqual(["checks/test_parse.py"]);

    // The verification leaf names the aggregate alone and gets it.
    expect(
      requiredPassingChecksFor({ acceptanceCriteria: ["`./run-tests.sh` exits 0 and both checks print ok."] }, root),
    ).toEqual(["test"]);
  });

  it("does not gate on a member a criterion only asks to observe", () => {
    // Measured 2026-11-09 on run `s19r10`: the plan's baseline leaf said *"Per-check status is recorded separately
    // for checks/test_parse.py and checks/test_totals.py (ok or FAILED)"* — an observation, on a checkout that is
    // broken by definition. Reading its member as a requirement asked that leaf to make the failing check pass, so
    // the item that observes the failure could never close, which is the closed loop `s19r3` had already measured
    // one layer down.
    const root = legacyCheckout();
    const baseline = {
      title: "Baseline: capture ./run-tests.sh output and exit code (no edits)",
      description: "Change nothing.",
      acceptanceCriteria: [
        "./run-tests.sh was executed from the checkout root and the completion report contains its verbatim output plus the numeric exit code.",
        "Per-check status is recorded separately for checks/test_parse.py and checks/test_totals.py (ok or FAILED).",
        "Checkout inventory evidence shows no modification.",
      ],
    };
    expect(requiredPassingChecksFor(baseline, root)).toEqual([]);

    // The control: the same member, asserted rather than observed, is a gate.
    expect(
      requiredPassingChecksFor(
        { acceptanceCriteria: ["`checks/test_parse.py` exits 0 and prints ok."] },
        root,
      ),
    ).toEqual(["checks/test_parse.py"]);
  });

  it("asks a leaf that may not write for evidence, never for a green check", () => {
    // Measured 2026-11-09 on run `s19r13`: the inventory leaf was read-only — told by its item to change nothing and
    // "records, not fixes" — and its job was still required to make `./run-tests.sh` pass on a checkout broken by
    // definition. It ran the check, recorded the failure, wrote nothing (correctly), and failed
    // `WORKER_CHECKS_INCOMPLETE`; twice. A leaf that cannot write cannot make a red check green.
    const root = legacyCheckout();
    const inventory = {
      title: "Inventory checkout, toolchain and VCS state",
      description: "Read-only inventory: records, not fixes. Change nothing in the checkout.",
      acceptanceCriteria: ["./run-tests.sh was executed and its exit status recorded verbatim."],
    };
    expect(inferReadOnlyJob(`${inventory.title}\n${inventory.description}`)).toBe(true);
    expect(requiredPassingChecksFor(inventory, root)).toEqual([]);
  });

  it("keeps the neutral reading when no member is named, and when the checkout cannot be read", () => {
    const root = legacyCheckout();
    expect(requiredPassingChecksFor({ acceptanceCriteria: ["`make check` exits 0."] }, root)).toEqual(["test"]);
    // A checkout this process cannot read narrows nothing: a verdict about a repository nobody read is the same
    // mistake in the other direction.
    expect(
      requiredPassingChecksFor(
        { acceptanceCriteria: ["`PYTHONPATH=src python3 checks/test_parse.py` exits 0."] },
        undefined,
      ),
    ).toEqual([]);
  });

  it("declares nothing extra for a runner that enumerates nothing", () => {
    const root = tempDir();
    writeFileSync(join(root, "run-tests.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    expect(declaredCheckScriptMembers(root, "run-tests.sh")).toEqual([]);
    expect(resolveDeclaredCheckCommands(root).map((command) => command.command)).toEqual(["./run-tests.sh"]);
  });

  it("reads a file the runner runs through an interpreter even when it is not executable", () => {
    // Measured on the fixture itself: `checks/test_parse.py` is mode 644 and `run-tests.sh` runs it as
    // `PYTHONPATH=src python3 "$check"`. Requiring the execute bit dropped both checks a repository declares.
    const root = legacyCheckout();
    chmodSync(join(root, "checks", "test_parse.py"), 0o644);
    expect(declaredCheckScriptMembers(root, "run-tests.sh").map((member) => member.name)).toEqual([
      "checks/test_parse.py",
      "checks/test_totals.py",
    ]);
  });

  it("ignores a path the runner names that is not a file at all", () => {
    const root = legacyCheckout();
    mkdirSync(join(root, "checks", "test_dir"), { recursive: true });
    expect(declaredCheckScriptMembers(root, "run-tests.sh").map((member) => member.name)).not.toContain(
      "checks/test_dir",
    );
  });
});
