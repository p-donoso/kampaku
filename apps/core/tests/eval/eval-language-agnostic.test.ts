import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDeclaredCheckCommands } from "../../src/application/pm/declared-checks.js";
import { parseCriterionChecks } from "../../src/application/pm/criterion-checks.js";
import { inferRequiredCheckScripts } from "../../src/application/pm/work-item-checks.js";
import { auditCheckCriterion } from "../../src/application/pm/phase-auditor-gate.js";
import { assessPlanChecks, documentedCommands } from "../../src/delegator/check-validation.js";
import { normalizePlannedWorkItems } from "../../src/delegator/types.js";

/**
 * **Suite 18 — language-agnostic.** The lock for the promise, not for one run.
 *
 * Suite 18's oracle asks four things of the factory on three checkouts: name the evidence it read, derive each
 * plan's checks from *that* project, ask for a check it cannot find instead of inventing one, and differentiate a
 * polyglot repository per part. Its first run (`s18a1`, 2026-11-05) measured the first two as done and the last
 * two as leaking, and each assertion below is one of those measurements turned into a rule:
 *
 * - **scenario A** (a Makefile-wrapped Python checkout): discovery names `make check` and the file that declares
 *   it, the plan's criterion is traceable to it, and the command actually exits 0 in the checkout;
 * - **scenario B** (nothing declares a check — no manifest, no runner, no CI, no README, no `tests/`): the
 *   product must ask. It said the words and applied the plan anyway, so what is locked here is the refusal and
 *   the sentence the emperor gets, plus the absence of a default in the two places the platform *writes* a
 *   check (the leaf filler and the phase gate);
 * - **scenario C** (a Rust crate and a Python package, no root declaration): each half is traceable to its own
 *   part, and both commands run green in the checkout — a single command for the whole repository would be
 *   wrong here and the fixture says so in its README.
 *
 * Every command asserted is executed, because a plan whose checks do not run has not been measured: exit codes
 * are part of the lock, not a footnote.
 */
describe("suite 18 — language-agnostic", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  function run(command: string, args: string[], cwd: string) {
    return spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120_000, env: { ...process.env, PYTHONPATH: cwd } });
  }

  /** Scenario A: `eval-seed-py` in miniature — a Makefile target and a stdlib test. */
  function pythonCheckout(): string {
    const root = tempDir("kampaku-s18-lock-a-");
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "Makefile"), "check:\n\tpython3 -m unittest discover -s tests -v\n");
    writeFileSync(join(root, "tests", "test_words.py"), "import unittest\n\n\nclass T(unittest.TestCase):\n    def test_one(self):\n        self.assertTrue(True)\n");
    return root;
  }

  /** Scenario B: `eval-seed-other` — one stub module and a scratch note, and nothing that declares a check. */
  function bareCheckout(): string {
    const root = tempDir("kampaku-s18-lock-b-");
    writeFileSync(join(root, "main.py"), "def main():\n    pass\n");
    return root;
  }

  /** Scenario C: `eval-seed-polyglot` — a crate and a package, no root manifest, no root Makefile. */
  function polyglotCheckout(): string {
    const root = tempDir("kampaku-s18-lock-c-");
    mkdirSync(join(root, "engine", "src"), { recursive: true });
    mkdirSync(join(root, "engine", "tests"), { recursive: true });
    mkdirSync(join(root, "pycal", "pkg"), { recursive: true });
    mkdirSync(join(root, "pycal", "tests"), { recursive: true });
    writeFileSync(join(root, "engine", "Cargo.toml"), "[package]\nname = \"engine\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\n");
    writeFileSync(join(root, "engine", "src", "lib.rs"), "pub fn double(n: i64) -> i64 {\n    n * 2\n}\n");
    writeFileSync(join(root, "engine", "tests", "double.rs"), "#[test]\nfn doubles() {\n    assert_eq!(engine::double(2), 4);\n}\n");
    writeFileSync(join(root, "pycal", "pkg", "__init__.py"), "def add(a, b):\n    return a + b\n");
    writeFileSync(
      join(root, "pycal", "tests", "test_add.py"),
      "import unittest\n\nfrom pkg import add\n\n\nclass T(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(1, 2), 3)\n",
    );
    writeFileSync(
      join(root, "README.md"),
      "# polyglot-demo\n\n- `cargo test --manifest-path engine/Cargo.toml`\n- `PYTHONPATH=pycal python3 -m unittest discover -s pycal/tests`\n",
    );
    return root;
  }

  it("A — names the file that declares the toolchain, and the check it names runs green", () => {
    const root = pythonCheckout();
    const declared = resolveDeclaredCheckCommands(root);
    expect(declared).toEqual([{ name: "test", command: "make check", evidence: "Makefile target check" }]);

    const assessment = assessPlanChecks(
      [
        {
          title: "Add a test for load()",
          description: "Add one test method to tests/test_words.py, nothing else.",
          acceptance_criteria: ["`make check` exits 0 from the repository root and lists the new case as `ok`."],
        },
      ],
      { checkoutPath: root },
    );
    expect(assessment.findings).toEqual([]);

    // The check the plan names is the check the checkout runs, executed here rather than asserted about.
    const result = run("make", ["check"], root);
    expect(result.status).toBe(0);
    // `unittest` reports its verdict on stderr, and the plan's criterion is about the verdict, not the stream.
    expect(`${result.stdout}${result.stderr}`).toMatch(/\bOK\b/);
    // And no command from another ecosystem appears anywhere in what the plan says.
    expect(JSON.stringify(declared)).not.toMatch(/\bnpm\b|\byarn\b|\bpnpm\b/);
  });

  it("B — asks for the missing check instead of inventing one, in the record and not only in the reply", () => {
    const root = bareCheckout();
    expect(resolveDeclaredCheckCommands(root)).toEqual([]);
    expect(documentedCommands(root)).toEqual([]);

    const invented = "`python3 -m unittest discover -s tests -v` exits 0 and reports OK.";
    const assessment = assessPlanChecks(
      [
        { title: "Establish the harness", description: "Create tests/test_smoke.py.", acceptance_criteria: [invented] },
      ],
      { checkoutPath: root, repositoryLabel: "file:///checkouts/eval-seed-other" },
    );

    expect(assessment.declaresNothing).toBe(true);
    expect(assessment.findings.map((finding) => finding.check)).toEqual(["test"]);
    // The question names what was looked for and did not find — the suite's own wording of the requirement.
    expect(assessment.findings[0].detail).toContain("states no check at all");
    expect(assessment.findings[0].detail).toContain("README.md");
    expect(assessment.findings[0].detail).toContain("Ask the emperor which command proves this change");
    expect(assessment.summary).toContain("the plan was not applied");

    // And the two places the platform *writes* a check name no ecosystem when the checkout declares none.
    const filler = normalizePlannedWorkItems([
      { title: "A leaf with no criteria", description: "Do one small thing in the checkout, nothing else." },
    ] as never);
    expect(JSON.stringify(filler)).not.toMatch(/\bnpm\b|\bpytest\b|unittest discover/);
    expect(auditCheckCriterion(resolveDeclaredCheckCommands(root))).not.toMatch(/\bnpm\b|unittest discover/);
  });

  it("C — differentiates a polyglot repository per part, and both part checks run green", { timeout: 120_000 }, () => {
    const root = polyglotCheckout();
    // No single command is honest for this repository, and nothing at the root claims one.
    expect(resolveDeclaredCheckCommands(root)).toEqual([]);

    const assessment = assessPlanChecks(
      [
        {
          title: "Rust: add engine::double + parity test",
          description: "Add one function and one test inside the engine crate.",
          acceptance_criteria: ["`cargo test --manifest-path engine/Cargo.toml` exits 0 and reports both tests as ok."],
        },
        {
          title: "Python: add pkg.add + parity test",
          description: "Add one function and one test inside the pycal package.",
          acceptance_criteria: ["`PYTHONPATH=pycal python3 -m unittest discover -s pycal/tests` exits 0 and reports OK."],
        },
      ],
      { checkoutPath: root },
    );
    expect(assessment.findings).toEqual([]);

    const rust = run("cargo", ["test", "--manifest-path", "engine/Cargo.toml"], root);
    expect(rust.status).toBe(0);
    expect(`${rust.stdout}${rust.stderr}`).toContain("1 passed");

    const python = spawnSync("python3", ["-m", "unittest", "discover", "-s", "pycal/tests"], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, PYTHONPATH: join(root, "pycal") },
    });
    expect(python.status).toBe(0);
    expect(python.stderr).toContain("OK");

    // The two checks are different commands from different toolchains: that is the promise, not an accident.
    const [rustCheck] = inferRequiredCheckScripts("cargo test --manifest-path engine/Cargo.toml");
    const [pythonCheck] = inferRequiredCheckScripts("PYTHONPATH=pycal python3 -m unittest discover -s pycal/tests");
    expect(rustCheck).toBe("test");
    expect(pythonCheck).toBe("test");
  });

  it("routes a criterion about a workflow file by its verb, not by the words in the path (F-087)", () => {
    // The splitter writes this criterion itself for any slice that names the CI workflow, so the defect was
    // reachable on a plan nobody had to write by hand.
    const checks = parseCriterionChecks([
      { id: "ac-1", text: "file exists at .github/workflows/ci.yml" },
      { id: "ac-2", text: "file exists at src/render/page.tsx" },
    ]);
    expect(checks.map((check) => check.verifier)).toEqual(["inspect_artifact", "inspect_artifact"]);
  });
});
