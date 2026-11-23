import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";
import { planVerification, runCommandArgv } from "../../src/application/pm/verify-work-item.js";

/**
 * **An environment assignment in front of a command is not a program called `PYTHONPATH=src`.**
 *
 * Measured 2026-11-23 on suite 19's run `s19r23`, after the legacy repair landed and the checkout was green:
 *
 *     POST /api/v1/work-items/6975a2d6…/verification
 *     {"verdict":"unverifiable","checks":[],
 *      "refusals":[{"command":"PYTHONPATH=src python3 checks/test_parse.py",
 *                   "reason":"`PYTHONPATH=src` is not a program this surface runs",
 *                   "criterionIds":["ac-1"]}],
 *      "detail":"No stated check could be run: …"}
 *
 * The refusal is honest — the surface runs argv, not a shell — but `VAR=value command` is not shell syntax: it is
 * one program, one argument list and one environment entry. The criterion that was refused is one the **platform
 * itself** wrote (`ac-1` of the totals slice reads `` `PYTHONPATH=src python3 checks/test_totals.py` exits 0 ``),
 * and the leaf's own `CONTRIBUTING.md` prescribes exactly that spelling. So the surface that exists to prove a
 * criterion could not prove its own, and the operator was asked to certify it by hand.
 *
 * The rule: a runnable env prefix runs, with the assignment in the child's environment. Everything that genuinely
 * needs a shell — a redirect, a substitution, a program outside the allowlist — stays refused and named.
 */
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The legacy checkout's shape: one runner, one executable check it enumerates, a `PYTHONPATH` for the library. */
function legacyCheckout(): string {
  const root = mkdtempSync(join(tmpdir(), "kampaku-env-prefix-"));
  dirs.push(root);
  mkdirSync(join(root, "checks"), { recursive: true });
  mkdirSync(join(root, "src", "ledger"), { recursive: true });
  writeFileSync(join(root, "src", "ledger", "__init__.py"), "");
  writeFileSync(join(root, "src", "ledger", "parse.py"), "def parse_lines(text):\n    return []\n");
  writeFileSync(
    join(root, "checks", "test_parse.py"),
    "import ledger.parse\nassert ledger.parse is not None\n",
  );
  writeFileSync(
    join(root, "run-tests.sh"),
    ["#!/bin/sh", "set -u", 'PYTHONPATH=src python3 checks/test_parse.py', ""].join("\n"),
    { mode: 0o755 },
  );
  return root;
}

function itemWith(criteria: string[]): WorkItemRecord {
  return {
    id: "item-1",
    projectId: "project-1",
    title: "Fix parse defect",
    description: "",
    status: "done",
    priority: 0,
    sortOrder: 0,
    acceptanceCriteria: criteria,
  } as unknown as WorkItemRecord;
}

describe("a criterion whose command carries an environment prefix (F-162)", () => {
  it("plans the command instead of refusing it, and the command runs", () => {
    const root = legacyCheckout();
    const plan = planVerification(itemWith(["`PYTHONPATH=src python3 checks/test_parse.py` exits 0."]), root);

    expect(plan.refusals).toEqual([]);
    expect(plan.checks.map((check) => check.command)).toContain(
      "PYTHONPATH=src python3 checks/test_parse.py",
    );

    // And it is not a claim about a string: the surface runs it, in the checkout, with the assignment applied.
    const result = runCommandArgv("PYTHONPATH=src python3 checks/test_parse.py", root);
    expect(result.exits).toBe(0);
  });

  it("applies the assignment to the child and not to the program it starts", () => {
    const root = legacyCheckout();
    const result = runCommandArgv("PYTHONPATH=src python3 -c \"import ledger.parse; print('imported')\"", root);
    expect(result.output).toContain("imported");

    // The control: without the prefix the same import fails, which is what proves the variable was carried.
    const without = runCommandArgv("python3 -c \"import ledger.parse; print('imported')\"", root);
    expect(without.exits).not.toBe(0);
  });

  it("still refuses what genuinely needs a shell, and names which part", () => {
    const root = legacyCheckout();
    const shell = planVerification(
      itemWith(["`PYTHONPATH=src python3 checks/test_parse.py > /tmp/out.txt` exits 0."]),
      root,
    );
    expect(shell.checks).toHaveLength(0);
    expect(shell.refusals[0].reason).toContain("needs a shell");

    // And a program outside the allowlist is still refused by name, prefix or no prefix.
    const foreign = planVerification(itemWith(["`FOO=1 terraform plan` exits 0."]), root);
    expect(foreign.checks).toHaveLength(0);
    expect(foreign.refusals[0].reason).toContain("terraform");
  });
});
