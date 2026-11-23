import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDeclaredCheckCommands } from "../../src/application/pm/declared-checks.js";
import { inferRequiredCheckScripts } from "../../src/application/pm/work-item-checks.js";

/**
 * Locks for the reader the splitter writes criteria from (BOARD F-086).
 *
 * The requirement it encodes is the platform's own: **evidence or nothing**. A command is offered only when
 * the file that justifies it exists in the checkout, so a criterion written from this list names a command
 * that checkout can run — and a criterion written for it is one the runner's vocabulary recognises, which is
 * the second half of the same requirement.
 */
describe("declared checks of a checkout (F-086)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-checks-"));
    dirs.push(dir);
    return dir;
  }

  it("reads a Makefile-wrapped Python checkout as `make check`, not as pytest", () => {
    const root = tempDir();
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"pkg\"\n");
    writeFileSync(
      join(root, "Makefile"),
      "check:\n\tpython3 -m unittest discover -s tests -t . -v\n\nlint:\n\tpython3 -m compileall -q src tests\n",
    );

    expect(resolveDeclaredCheckCommands(root)).toEqual([
      { name: "test", command: "make check", evidence: "Makefile target check" },
      { name: "lint", command: "make lint", evidence: "Makefile target lint" },
    ]);
  });

  it("reads a Node checkout's own scripts", () => {
    const root = tempDir();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest run", lint: "eslint .", build: "tsc" } }),
    );

    expect(resolveDeclaredCheckCommands(root).map((command) => command.command)).toEqual([
      "npm run test",
      "npm run lint",
      "npm run build",
    ]);
  });

  it("offers nothing for a checkout that declares nothing", () => {
    const root = tempDir();
    expect(resolveDeclaredCheckCommands(root)).toEqual([]);
    expect(resolveDeclaredCheckCommands(undefined)).toEqual([]);
    expect(resolveDeclaredCheckCommands(join(root, "does-not-exist"))).toEqual([]);
  });

  it("only offers commands the runner's own vocabulary routes to a check", () => {
    const root = tempDir();
    writeFileSync(join(root, "go.mod"), "module demo\n");
    for (const command of resolveDeclaredCheckCommands(root)) {
      expect(
        inferRequiredCheckScripts(`${command.command} exits 0.`),
        `${command.command} must be recognised by the runner's vocabulary`,
      ).toContain(command.name);
    }
  });

  it("reads a legacy checkout's own check script — the only declaration it has (suite 19)", () => {
    // Measured 2026-11-05 on suite 19's first run: no manifest, no Makefile, one `run-tests.sh` and a
    // `CONTRIBUTING.md` that calls it "the only supported check command". Every other source was silent, so the
    // platform offered this project no check at all and the executor refused to run the one that exists.
    const root = tempDir();
    writeFileSync(join(root, "run-tests.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    expect(resolveDeclaredCheckCommands(root)).toEqual([
      { name: "test", command: "./run-tests.sh", evidence: "run-tests.sh (executable check script)" },
    ]);
    // The vocabulary the criteria are read with has to name the same check, or the criterion Core writes is one
    // the runner cannot route — the two halves of BOARD F-082 one file shape over.
    expect(inferRequiredCheckScripts("`./run-tests.sh` exits 0")).toEqual(["test"]);
  });

  it("does not offer a check script nobody can execute, and keeps the Makefile when both exist", () => {
    const notExecutable = tempDir();
    writeFileSync(join(notExecutable, "run-tests.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o644 });
    expect(resolveDeclaredCheckCommands(notExecutable)).toEqual([]);

    // A repository that has both keeps the wrapper it wrote: a Makefile target is the same kind of evidence and
    // comes first, so the script does not displace it.
    const both = tempDir();
    writeFileSync(join(both, "Makefile"), "check:\n\t./run-tests.sh\n");
    writeFileSync(join(both, "run-tests.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    expect(resolveDeclaredCheckCommands(both)).toEqual([
      { name: "test", command: "make check", evidence: "Makefile target check" },
    ]);
  });
});
