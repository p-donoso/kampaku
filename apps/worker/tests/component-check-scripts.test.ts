import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeCodingTool } from "../src/tools/file-tools.js";
import { discoverProjectToolchain, findToolchainCommand } from "../src/tools/project-toolchain.js";

/**
 * **A runner that enumerates its checks declares each of them, and `run_check` runs the one asked for.**
 *
 * Measured 2026-11-08 on suite 19 run `s19r7`: the legacy checkout's `run-tests.sh` loops `checks/test_*.py` with
 * `PYTHONPATH=src python3`, and the platform offered only the aggregate (`./run-tests.sh`). The repair leaf that
 * fixed one defect could therefore not prove its own work — the aggregate still failed on the other defect — and
 * the job was failed for a failure outside its blast radius.
 *
 * The two halves are here: discovery declares the enumerated files (with the runner's own environment, which is
 * what makes `import ledger` resolve), and `run_check` accepts the member by its path.
 */
describe("a runner's own checks are checks (suite 19)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kampaku-component-checks-"));
    mkdirSync(join(root, "checks"), { recursive: true });
    mkdirSync(join(root, "src", "ledger"), { recursive: true });
    writeFileSync(join(root, "src", "ledger", "__init__.py"), "VALUE = 7\n");
    writeFileSync(
      join(root, "checks", "test_parse.py"),
      "from ledger import VALUE\nassert VALUE == 7\nprint('parse ok')\n",
      { mode: 0o755 },
    );
    writeFileSync(join(root, "checks", "test_totals.py"), "import sys\nsys.exit(3)\n", { mode: 0o755 });
    writeFileSync(
      join(root, "run-tests.sh"),
      [
        "#!/bin/sh",
        "set -u",
        "status=0",
        "for check in checks/test_*.py; do",
        '    PYTHONPATH=src python3 "$check" || status=1',
        "done",
        "exit $status",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("declares the enumerated scripts beside the aggregate, with the runner's environment", async () => {
    const toolchain = await discoverProjectToolchain(root);
    expect(findToolchainCommand(toolchain, "test")?.command).toBe("./run-tests.sh");

    const member = findToolchainCommand(toolchain, "checks/test_parse.py");
    expect(member?.command).toBe("python3");
    expect(member?.args).toEqual(["checks/test_parse.py"]);
    expect(member?.env).toEqual({ PYTHONPATH: "src" });
    expect(member?.evidence).toEqual(["checks/test_parse.py (enumerated by run-tests.sh)"]);
  });

  it("runs the member by path and reports its own exit, not the aggregate's", async () => {
    const passing = JSON.parse(
      await executeCodingTool("run_check", { script: "checks/test_parse.py" }, root),
    ) as { ok: boolean; script: string; output: string; command: string };
    expect(passing.ok).toBe(true);
    expect(passing.command).toBe("python3 checks/test_parse.py");
    expect(passing.output).toContain("parse ok");

    const failing = JSON.parse(
      await executeCodingTool("run_check", { script: "checks/test_totals.py" }, root),
    ) as { ok: boolean };
    expect(failing.ok).toBe(false);
  });

  it("keeps the aggregate working, and refuses a path the checkout does not declare", async () => {
    const aggregate = JSON.parse(await executeCodingTool("run_check", { script: "test" }, root)) as { ok: boolean };
    expect(aggregate.ok).toBe(false); // one enumerated check exits 3, and the runner propagates it

    await expect(executeCodingTool("run_check", { script: "checks/test_nope.py" }, root)).rejects.toThrow(
      /declares no "checks\/test_nope\.py" check/,
    );
  });
});
