import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeCodingTool } from "../src/tools/file-tools.js";
import {
  discoverProjectToolchain,
  findToolchainCommand,
} from "../src/tools/project-toolchain.js";
import { inferRequiredCheckScripts } from "../src/tools/worker-verification.js";

/**
 * Invariant §1 says acceptance evidence comes from the project's own toolchain, and adding a language
 * must be data rather than a new code path. Before this file, `run_check` could only run a
 * `package.json` script and `install_dependencies` only `npm install`, so a Python, Rust, or Go
 * project received checks it could not execute (BOARD F-003).
 *
 * The point of these tests is not that the platform knows many toolchains; it is that **the
 * repository decides**, and that a repository declaring nothing produces a refusal rather than a
 * default.
 */

function checkout(): string {
  return mkdtempSync(join(tmpdir(), "kampaku-toolchain-"));
}

describe("project toolchain discovery", () => {
  it("finds nothing in a checkout that declares nothing, instead of assuming one", async () => {
    const root = checkout();
    try {
      const toolchain = await discoverProjectToolchain(root);
      expect(toolchain.profiles).toEqual([]);
      expect(toolchain.commands).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads a Python project's own test command", async () => {
    const root = checkout();
    try {
      writeFileSync(join(root, "requirements.txt"), "pytest==8.3.0\n");
      const toolchain = await discoverProjectToolchain(root);
      const test = findToolchainCommand(toolchain, "test");

      expect(toolchain.profiles.map((profile) => profile.id)).toContain("python");
      expect(test).toMatchObject({ command: "python", args: ["-m", "pytest", "-q"] });
      expect(test?.evidence).toContain("requirements.txt");
      // No Node marker exists in this checkout, so nothing may be offered for one.
      expect(toolchain.commands.map((command) => command.command)).not.toContain("npm");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads a Rust project's own commands", async () => {
    const root = checkout();
    try {
      writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "demo"\n');
      const toolchain = await discoverProjectToolchain(root);

      expect(findToolchainCommand(toolchain, "test")).toMatchObject({ command: "cargo", args: ["test"] });
      expect(findToolchainCommand(toolchain, "typecheck")).toMatchObject({ command: "cargo", args: ["check"] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves a polyglot repository's root toolchain and reports its nested packages", async () => {
    const root = checkout();
    try {
      writeFileSync(join(root, "go.mod"), "module example.test/demo\n\ngo 1.22\n");
      mkdirSync(join(root, "apps", "service"), { recursive: true });
      writeFileSync(join(root, "apps", "service", "package.json"), JSON.stringify({ scripts: { test: "exit 0" } }));

      const toolchain = await discoverProjectToolchain(root);

      // Root commands come from the language the repository root declares.
      expect(toolchain.profiles.map((profile) => profile.id)).toEqual(["go"]);
      expect(findToolchainCommand(toolchain, "test")).toMatchObject({ command: "go", args: ["test", "./..."] });

      // The nested package is reported with repository-relative evidence, not silently absorbed.
      expect(toolchain.packages).toHaveLength(1);
      expect(toolchain.packages[0].directory).toBe("apps/service");
      expect(toolchain.packages[0].profiles).toContainEqual({
        id: "node",
        evidence: ["apps/service/package.json"],
      });
      expect(toolchain.packages[0].commands[0].evidence).toContain("apps/service/package.json scripts.test");

      // And the limitation is stated rather than papered over: a check name has no directory.
      expect(toolchain.nearMisses.some((miss) => miss.reason.includes("apps/service"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("offers a Makefile target only when the target is declared, and explains the near miss", async () => {
    const root = checkout();
    try {
      writeFileSync(join(root, "Makefile"), ".PHONY: build\nbuild:\n\tcc -o app main.c\n");
      const toolchain = await discoverProjectToolchain(root);

      expect(findToolchainCommand(toolchain, "build")).toMatchObject({ command: "make", args: ["build"] });
      expect(findToolchainCommand(toolchain, "test")).toBeUndefined();
      expect(toolchain.nearMisses).toContainEqual({
        name: "test",
        reason: "Makefile declares no test or check target",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads the check commands a Python project exposes through its Makefile", async () => {
    // The suite-07 fixture shape, measured 2026-09-26: a Python package (`pyproject.toml`, `src/`,
    // `unittest` tests) whose two checks are `make check` and `make lint`. The plan's oracle is that every
    // command it names runs **in this project** — so a repository whose check target is called `check`
    // rather than `test` has to resolve, and nothing Node-shaped may appear beside it.
    const root = checkout();
    try {
      writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"textstats\"\nversion = \"0.1.0\"\n");
      writeFileSync(
        join(root, "Makefile"),
        "export PYTHONPATH := src\n\n.PHONY: check lint\n\ncheck:\n\tpython3 -m unittest discover -s tests -t . -v\n\nlint:\n\tpython3 -m compileall -q src tests\n",
      );
      const toolchain = await discoverProjectToolchain(root);

      expect(findToolchainCommand(toolchain, "test")).toMatchObject({
        command: "make",
        args: ["check"],
        evidence: ["Makefile target check"],
      });
      expect(findToolchainCommand(toolchain, "lint")).toMatchObject({
        command: "make",
        args: ["lint"],
      });
      // The repository declares no Node manifest, so no npm-shaped command may be offered for it.
      expect(toolchain.commands.map((command) => command.command)).not.toContain("npm");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("offers a Node check only for a script the manifest really declares", async () => {
    const root = checkout();
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "demo", scripts: { test: "exit 0" } }),
      );
      const toolchain = await discoverProjectToolchain(root);

      expect(findToolchainCommand(toolchain, "test")).toMatchObject({ command: "npm", args: ["run", "test"] });
      // The manifest has no build script, so no build command may be offered.
      expect(findToolchainCommand(toolchain, "build")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("run_check resolves to the project's own command", () => {
  it("runs a Python project's pytest through the toolchain-neutral check name", async () => {
    const root = checkout();
    try {
      // A real, runnable pytest stand-in: the point is that the *resolved command* ran and its
      // output came back, not that pytest itself is installed on this host.
      writeFileSync(join(root, "requirements.txt"), "pytest\n");
      writeFileSync(
        join(root, "conftest.py"),
        "def test_ok():\n    assert True\n",
      );
      const result = JSON.parse(await executeCodingTool("run_check", { script: "test" }, root)) as {
        ok: boolean;
        command: string;
        evidence: string[];
      };

      // `python -m pytest` is the declared command, whatever its exit status on this host.
      expect(result.command).toBe("python -m pytest -q");
      expect(result.evidence).toContain("requirements.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a check the repository does not declare, and names what it found", async () => {
    const root = checkout();
    try {
      writeFileSync(join(root, "go.mod"), "module example.test/demo\n");
      const failed = await executeCodingTool("run_check", { script: "lint" }, root).catch(
        (error: unknown) => String((error as Error).message),
      );

      // `lint` resolves for Go, so this must not be a refusal; assert the positive case instead.
      expect(JSON.parse(String(failed))).toMatchObject({ command: "go vet ./..." });

      const refused = await executeCodingTool("run_check", { script: "e2e" }, root).catch(
        (error: unknown) => String((error as Error).message),
      );
      expect(String(refused)).toContain('declares no "e2e" check');
      expect(String(refused)).toContain("Discovered toolchains: go (go.mod)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to guess a toolchain in a checkout that has none", async () => {
    const root = checkout();
    try {
      const refused = await executeCodingTool("run_check", { script: "test" }, root).catch(
        (error: unknown) => String((error as Error).message),
      );

      expect(String(refused)).toContain('declares no "test" check');
      expect(String(refused)).toContain("No toolchain marker found among");
      expect(String(refused)).toContain("package.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails install_dependencies closed when nothing declares dependencies", async () => {
    const root = checkout();
    try {
      writeFileSync(join(root, "build.zig"), "const std = @import(\"std\");\n");
      const refused = await executeCodingTool("install_dependencies", {}, root).catch(
        (error: unknown) => String((error as Error).message),
      );

      expect(String(refused)).toContain("declares no dependency manifest");
      expect(String(refused)).toContain("Cargo.toml");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("required-check inference is toolchain-neutral", () => {
  it("requires a test check for a non-Node acceptance criterion", () => {
    // Before: a criterion naming pytest produced no required check at all — a silently empty gate.
    expect(inferRequiredCheckScripts("- pytest exits 0")).toEqual(["test"]);
    expect(inferRequiredCheckScripts("- cargo test exits 0")).toEqual(["test"]);
    expect(inferRequiredCheckScripts("- go test ./... exits 0")).toEqual(["test"]);
    expect(inferRequiredCheckScripts("- make check exits 0")).toEqual(["test"]);
    expect(inferRequiredCheckScripts("- mvn verify exits 0")).toEqual(["test"]);
  });

  it("does not add a phantom test requirement to an e2e-only criterion", () => {
    // `npm run test` is a prefix of `npm run test:e2e`, so without the lookahead an e2e criterion
    // also required `test`, demanding a check the criterion never asked for.
    expect(inferRequiredCheckScripts("- npm run test:e2e passes")).toEqual(["test:e2e"]);
    expect(inferRequiredCheckScripts("- npm test and npm run build pass")).toEqual(["build", "test"]);
  });

  it("requires build, typecheck, and lint for their non-Node equivalents", () => {
    expect(inferRequiredCheckScripts("- go build ./... exits 0")).toEqual(["build"]);
    expect(inferRequiredCheckScripts("- mypy reports no errors")).toEqual(["typecheck"]);
    expect(inferRequiredCheckScripts("- cargo clippy is clean")).toEqual(["lint"]);
  });
});
