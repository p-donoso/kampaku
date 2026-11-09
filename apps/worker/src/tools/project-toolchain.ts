/**
 * @module tools/project-toolchain
 *
 * Discovers the toolchain a repository actually uses, so execution and verification derive from the
 * project instead of from the platform's own stack.
 *
 * Why this exists: `run_check` used to run only a `package.json` script, `install_dependencies` only
 * `npm install`, and required checks were inferred only from `npm` mentions. Measured consequence: a
 * Python, Rust, or Go project got checks it could not execute, and a criterion naming `pytest`
 * produced **no** required check at all — a silent empty gate ([BOARD F-003](../../../../docs/eval/results/BOARD.md),
 * invariant §1 of the [agnosticism invariants](../../../../docs/concepts/agnosticism-invariants.md)).
 *
 * Two rules keep this honest:
 *
 * 1. **Evidence or nothing.** A command is only offered when the file that justifies it exists, and
 *    each command carries that justification. A `Makefile` without a `test` target yields no `test`
 *    command, and the reason is reported as a near miss.
 * 2. **Adding a language is data.** A new toolchain is a row in {@link PROFILES}, not a branch in the
 *    execution path.
 */

import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Check names a worker may be asked to run. They are toolchain-neutral on purpose. */
export type CheckName = "test" | "build" | "lint" | "typecheck" | "e2e";

export const CHECK_NAMES: readonly CheckName[] = ["test", "build", "lint", "typecheck", "e2e"];

/** A command this repository declares, with the evidence that justifies offering it. */
export interface ToolchainCommand {
  name: CheckName | "install" | "verify" | string;
  /** Executable, no shell interpretation. */
  command: string;
  args: string[];
  /** Files, and where relevant the exact declared key or target, that justify the command. */
  evidence: string[];
  /**
   * Environment the repository's own runner sets for this command.
   *
   * Present only when the declaration states it — a runner that spells `PYTHONPATH=src python3 "$check"` declares
   * the environment its checks need, and running the file without it would run a different thing (`import ledger`
   * fails) and report a failure that is the platform's, not the repository's.
   */
  env?: Record<string, string>;
}

export interface ToolchainProfileMatch {
  id: string;
  /** Files that matched, relative to the repository root. */
  evidence: string[];
}

/** A nested package that declares its own toolchain, for example one app of a monorepo. */
export interface ToolchainPackage {
  /** Repository-relative directory, e.g. `apps/worker`. */
  directory: string;
  profiles: ToolchainProfileMatch[];
  commands: ToolchainCommand[];
}

export interface ProjectToolchain {
  /** Profile ids that matched **at the repository root**. */
  profiles: ToolchainProfileMatch[];
  /** Commands declared at the repository root, resolvable by check name. */
  commands: ToolchainCommand[];
  /**
   * Toolchains declared by nested packages.
   *
   * Reported rather than offered: a check name has no directory, and running a monorepo package's
   * test from the repository root would run the wrong thing. Scoping a check to one package is part
   * of the project-context work, and this field is how the agent learns the package exists instead
   * of being told the repository has no toolchain.
   */
  packages: ToolchainPackage[];
  /** Plausible commands that were deliberately not offered, and why. */
  nearMisses: Array<{ name: string; reason: string }>;
}

/** Directories that never contain the project's own manifests. */
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".github",
  "node_modules",
  "dist",
  "build",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  "coverage",
  ".turbo",
]);

/** Bounded so a large checkout cannot turn discovery into a full filesystem walk. */
const MAX_PACKAGE_DEPTH = 3;
const MAX_DIRECTORIES_VISITED = 300;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  const text = await readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Target names a build file declares, so a command is only offered for a target that exists. */
function declaredTargets(source: string): Set<string> {
  const targets = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;
    if (line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_.][A-Za-z0-9_.\- ]*?)\s*:(?!=)/);
    if (!match) continue;
    for (const name of match[1].split(/\s+/)) {
      if (name && !name.includes("%") && !name.startsWith(".")) targets.add(name);
    }
  }
  return targets;
}

/** A profile is the whole mechanism for supporting a toolchain. Anything not in this table is unsupported, visibly. */
type Profile = {
  id: string;
  detect: (root: string) => Promise<{ evidence: string[]; commands: ToolchainCommand[]; nearMisses?: Array<{ name: string; reason: string }> } | null>;
};

const NODE_CHECK_SCRIPTS: Array<{ name: CheckName; script: string }> = [
  { name: "test", script: "test" },
  { name: "build", script: "build" },
  { name: "lint", script: "lint" },
  { name: "typecheck", script: "typecheck" },
  { name: "e2e", script: "test:e2e" },
];

const PROFILES: Profile[] = [
  {
    id: "node",
    detect: async (root) => {
      const manifestPath = join(root, "package.json");
      if (!(await exists(manifestPath))) return null;
      const manifest = await readJson<{ scripts?: Record<string, string> }>(manifestPath);
      const scripts = manifest?.scripts ?? {};
      const commands: ToolchainCommand[] = NODE_CHECK_SCRIPTS.filter((entry) => typeof scripts[entry.script] === "string").map(
        (entry) => ({
          name: entry.name,
          command: "npm",
          args: ["run", entry.script],
          evidence: [`package.json scripts.${entry.script}`],
        }),
      );
      commands.push({
        name: "install",
        command: "npm",
        args: ["install", "--no-audit", "--no-fund"],
        evidence: ["package.json"],
      });
      return { evidence: ["package.json"], commands };
    },
  },
  {
    id: "python-poetry",
    detect: async (root) => {
      const manifestPath = join(root, "pyproject.toml");
      const source = await readText(manifestPath);
      if (source === null || !/\[tool\.poetry\]/.test(source)) return null;
      return {
        evidence: ["pyproject.toml [tool.poetry]"],
        commands: [
          { name: "install", command: "poetry", args: ["install"], evidence: ["pyproject.toml [tool.poetry]"] },
          { name: "test", command: "poetry", args: ["run", "pytest"], evidence: ["pyproject.toml [tool.poetry]"] },
          { name: "typecheck", command: "poetry", args: ["run", "mypy", "."], evidence: ["pyproject.toml [tool.poetry]"] },
          { name: "lint", command: "poetry", args: ["run", "ruff", "check", "."], evidence: ["pyproject.toml [tool.poetry]"] },
        ],
      };
    },
  },
  {
    id: "python",
    detect: async (root) => {
      const markers = ["requirements.txt", "setup.py", "setup.cfg", "pytest.ini", "tox.ini", "pyproject.toml"];
      const found: string[] = [];
      for (const marker of markers) {
        if (await exists(join(root, marker))) found.push(marker);
      }
      const testsDirectory = (await exists(join(root, "tests"))) || (await exists(join(root, "test")));
      if (found.length === 0 && !testsDirectory) return null;
      const evidence = found.length > 0 ? found : ["tests/"];
      const commands: ToolchainCommand[] = [
        { name: "test", command: "python", args: ["-m", "pytest", "-q"], evidence },
      ];
      if (found.includes("requirements.txt")) {
        commands.push({
          name: "install",
          command: "python",
          args: ["-m", "pip", "install", "-r", "requirements.txt"],
          evidence: ["requirements.txt"],
        });
      }
      if (found.includes("pyproject.toml")) {
        const source = (await readText(join(root, "pyproject.toml"))) ?? "";
        if (/\[tool\.(mypy|basedpyright)\]/.test(source)) {
          commands.push({ name: "typecheck", command: "python", args: ["-m", "mypy", "."], evidence: ["pyproject.toml [tool.mypy]"] });
        }
        if (/\[tool\.ruff\]/.test(source)) {
          commands.push({ name: "lint", command: "python", args: ["python", "-m", "ruff", "check", "."], evidence: ["pyproject.toml [tool.ruff]"] });
        }
      }
      return { evidence, commands };
    },
  },
  {
    id: "rust",
    detect: async (root) => {
      if (!(await exists(join(root, "Cargo.toml")))) return null;
      return {
        evidence: ["Cargo.toml"],
        commands: [
          { name: "test", command: "cargo", args: ["test"], evidence: ["Cargo.toml"] },
          { name: "build", command: "cargo", args: ["build"], evidence: ["Cargo.toml"] },
          { name: "typecheck", command: "cargo", args: ["check"], evidence: ["Cargo.toml"] },
        ],
      };
    },
  },
  {
    id: "go",
    detect: async (root) => {
      if (!(await exists(join(root, "go.mod")))) return null;
      return {
        evidence: ["go.mod"],
        commands: [
          { name: "test", command: "go", args: ["test", "./..."], evidence: ["go.mod"] },
          { name: "build", command: "go", args: ["build", "./..."], evidence: ["go.mod"] },
          { name: "lint", command: "go", args: ["vet", "./..."], evidence: ["go.mod"] },
        ],
      };
    },
  },
  {
    id: "maven",
    detect: async (root) => {
      if (!(await exists(join(root, "pom.xml")))) return null;
      return {
        evidence: ["pom.xml"],
        commands: [
          { name: "test", command: "mvn", args: ["-q", "verify"], evidence: ["pom.xml"] },
          { name: "build", command: "mvn", args: ["-q", "-DskipTests", "package"], evidence: ["pom.xml"] },
        ],
      };
    },
  },
  {
    id: "gradle",
    detect: async (root) => {
      const markers = ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"];
      const found: string[] = [];
      for (const marker of markers) {
        if (await exists(join(root, marker))) found.push(marker);
      }
      if (found.length === 0) return null;
      const wrapper = await exists(join(root, "gradlew"));
      const command = wrapper ? "./gradlew" : "gradle";
      const evidence = wrapper ? [...found, "gradlew"] : found;
      return {
        evidence,
        commands: [
          { name: "test", command, args: ["test"], evidence },
          { name: "build", command, args: ["build", "-x", "test"], evidence },
        ],
      };
    },
  },
  {
    id: "elixir",
    detect: async (root) => {
      if (!(await exists(join(root, "mix.exs")))) return null;
      return {
        evidence: ["mix.exs"],
        commands: [
          { name: "test", command: "mix", args: ["test"], evidence: ["mix.exs"] },
          { name: "build", command: "mix", args: ["compile"], evidence: ["mix.exs"] },
          { name: "install", command: "mix", args: ["deps.get"], evidence: ["mix.exs"] },
        ],
      };
    },
  },
  {
    id: "ruby",
    detect: async (root) => {
      if (!(await exists(join(root, "Gemfile")))) return null;
      const hasRake = await exists(join(root, "Rakefile"));
      const hasSpec = await exists(join(root, "spec"));
      if (!hasRake && !hasSpec) {
        return {
          evidence: ["Gemfile"],
          commands: [{ name: "install", command: "bundle", args: ["install"], evidence: ["Gemfile"] }],
          nearMisses: [{ name: "test", reason: "Gemfile declares dependencies but no Rakefile or spec/ directory declares a test entry point" }],
        };
      }
      const argv = hasRake ? ["exec", "rake", "test"] : ["exec", "rspec"];
      const evidence = hasRake ? ["Gemfile", "Rakefile"] : ["Gemfile", "spec/"];
      return {
        evidence,
        commands: [
          { name: "install", command: "bundle", args: ["install"], evidence: ["Gemfile"] },
          { name: "test", command: "bundle", args: argv, evidence },
        ],
      };
    },
  },
  {
    id: "dotnet",
    detect: async (root) => {
      let found: string | undefined;
      try {
        found = (await readdir(root)).find((entry) => entry.endsWith(".csproj") || entry.endsWith(".sln") || entry.endsWith(".fsproj"));
      } catch {
        return null;
      }
      if (!found) return null;
      return {
        evidence: [found],
        commands: [
          { name: "test", command: "dotnet", args: ["test"], evidence: [found] },
          { name: "build", command: "dotnet", args: ["build"], evidence: [found] },
        ],
      };
    },
  },
  {
    id: "php",
    detect: async (root) => {
      const manifestPath = join(root, "composer.json");
      if (!(await exists(manifestPath))) return null;
      const manifest = await readJson<{ scripts?: Record<string, string> }>(manifestPath);
      const commands: ToolchainCommand[] = [
        { name: "install", command: "composer", args: ["install"], evidence: ["composer.json"] },
      ];
      for (const name of ["test", "lint"] as const) {
        if (typeof manifest?.scripts?.[name] === "string") {
          commands.push({ name, command: "composer", args: ["run", name], evidence: [`composer.json scripts.${name}`] });
        }
      }
      return { evidence: ["composer.json"], commands };
    },
  },
  {
    id: "dart",
    detect: async (root) => {
      if (!(await exists(join(root, "pubspec.yaml")))) return null;
      return {
        evidence: ["pubspec.yaml"],
        commands: [
          { name: "test", command: "dart", args: ["test"], evidence: ["pubspec.yaml"] },
          { name: "build", command: "dart", args: ["analyze"], evidence: ["pubspec.yaml"] },
          { name: "install", command: "dart", args: ["pub", "get"], evidence: ["pubspec.yaml"] },
        ],
      };
    },
  },
  {
    id: "cmake",
    detect: async (root) => {
      const source = await readText(join(root, "CMakeLists.txt"));
      if (source === null) return null;
      if (!/enable_testing\s*\(/.test(source)) {
        return {
          evidence: ["CMakeLists.txt"],
          commands: [],
          nearMisses: [{ name: "test", reason: "CMakeLists.txt does not call enable_testing(), so no ctest suite is declared" }],
        };
      }
      return {
        evidence: ["CMakeLists.txt enable_testing()"],
        commands: [{ name: "test", command: "ctest", args: ["--output-on-failure"], evidence: ["CMakeLists.txt enable_testing()"] }],
      };
    },
  },
  {
    id: "zig",
    detect: async (root) => {
      if (!(await exists(join(root, "build.zig")))) return null;
      return {
        evidence: ["build.zig"],
        commands: [
          { name: "test", command: "zig", args: ["build", "test"], evidence: ["build.zig"] },
          { name: "build", command: "zig", args: ["build"], evidence: ["build.zig"] },
        ],
      };
    },
  },
  {
    // Last on purpose: a Makefile is often a wrapper around another toolchain, so an earlier profile wins.
    id: "make",
    detect: async (root) => {
      for (const name of ["Makefile", "makefile", "GNUmakefile"]) {
        const source = await readText(join(root, name));
        if (source === null) continue;
        const targets = declaredTargets(source);
        const commands: ToolchainCommand[] = [];
        const nearMisses: Array<{ name: string; reason: string }> = [];
        const wanted: Array<{ name: CheckName; targets: string[] }> = [
          { name: "test", targets: ["test", "check"] },
          { name: "build", targets: ["build", "all"] },
          { name: "lint", targets: ["lint"] },
          { name: "typecheck", targets: ["typecheck"] },
        ];
        for (const entry of wanted) {
          const target = entry.targets.find((candidate) => targets.has(candidate));
          if (target) {
            commands.push({ name: entry.name, command: "make", args: [target], evidence: [`${name} target ${target}`] });
          } else {
            nearMisses.push({ name: entry.name, reason: `${name} declares no ${entry.targets.join(" or ")} target` });
          }
        }
        return { evidence: [name], commands, nearMisses };
      }
      return null;
    },
  },
  {
    id: "just",
    detect: async (root) => {
      for (const name of ["justfile", "Justfile", ".justfile"]) {
        const source = await readText(join(root, name));
        if (source === null) continue;
        const targets = declaredTargets(source);
        const wanted: Array<{ name: CheckName; candidates: string[] }> = [
          { name: "test", candidates: ["test", "check"] },
          { name: "build", candidates: ["build"] },
          { name: "lint", candidates: ["lint"] },
        ];
        const commands: ToolchainCommand[] = [];
        const nearMisses: Array<{ name: string; reason: string }> = [];
        for (const entry of wanted) {
          const target = entry.candidates.find((candidate) => targets.has(candidate));
          if (target) {
            commands.push({ name: entry.name, command: "just", args: [target], evidence: [`${name} recipe ${target}`] });
          } else {
            nearMisses.push({ name: entry.name, reason: `${name} declares no ${entry.candidates.join(" or ")} recipe` });
          }
        }
        return { evidence: [name], commands, nearMisses };
      }
      return null;
    },
  },
  {
    // A checkout that states its own check as a script.
    //
    // Last of the declared entry points, and declared, so it loses to a `Makefile` target and wins over a
    // language profile's guess — the shape most brownfield repositories have.
    //
    // Measured 2026-11-05 taking suite 19 (`s19r1`) on a legacy Python checkout whose `CONTRIBUTING.md` says
    // *"`./run-tests.sh` is the only supported check command"*: no `Makefile`, no `package.json`, no
    // `pyproject.toml`, so every profile missed, `run_check` had no command to resolve, the executor refused the
    // repository's own check with `Capability denied by work-item policy`, and the factory could not observe the
    // one thing the emperor asked for — what is broken. A repository that names its check in a script has
    // declared a check; the platform reading only manifests and Makefiles was the same defect as F-057 one file
    // shape over.
    id: "declared-script",
    detect: async (root) => {
      const found: string[] = [];
      for (const name of CHECK_SCRIPT_NAMES) {
        if (!(await isExecutableFile(join(root, name)))) continue;
        found.push(name);
      }
      if (found.length === 0) return null;
      const script = found[0];
      return {
        evidence: found,
        commands: [
          {
            name: "test",
            command: `./${script}`,
            args: [],
            evidence: [`${script} (executable check script)`],
          },
          ...(await componentCheckCommands(root, script)),
        ],
      };
    },
  },
];

/**
 * The checks a runner script declares, one per file it enumerates.
 *
 * Why this exists. A repository whose whole check is one runner often has several checks inside it: measured
 * 2026-11-08 on suite 19 run `s19r7`, `run-tests.sh` loops `checks/test_*.py` with `PYTHONPATH=src python3` and
 * nothing else, so the repository declares **one check per script**, and the platform collapsed all of them into
 * one name `test`.
 *
 * What that cost, measured live: the plan's first repair leaf ("skip comment lines in `parse_lines`") named its own
 * proof — `PYTHONPATH=src python3 checks/test_parse.py` — and the job's required check resolved to the whole
 * `./run-tests.sh`, which still fails on the *other* defect. So the job was failed
 * (`WORKER_CHECKS_INCOMPLETE`) for the defect it had nothing to do with, the item went `blocked`, and the
 * re-dispatch then failed again with `WORKER_NO_DELIVERABLES` because the fix was already on disk. Two failures on
 * one leaf, for a repair that was correct.
 *
 * The reading is evidence-only in both directions: the runner has to **enumerate** the file (a glob or a literal
 * path in its body), and the file has to exist and be executable. Nothing here guesses what a check should be.
 */
async function componentCheckCommands(root: string, runner: string): Promise<ToolchainCommand[]> {
  const source = await readText(join(root, runner));
  if (source === null) return [];

  const commands: ToolchainCommand[] = [];
  const seen = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    for (const candidate of await enumeratedCheckPaths(root, line)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      // A regular file is enough when the runner invokes it through an interpreter; the execute bit is the evidence
      // only for the `./file` form (`runnerInvocation` says which one this runner uses).
      if (!(await isRegularFile(join(root, candidate)))) continue;
      const invocation = runnerInvocation(source, candidate);
      commands.push({
        name: candidate,
        command: invocation.command,
        args: [candidate],
        evidence: [`${candidate} (enumerated by ${runner})`],
        ...(Object.keys(invocation.env).length > 0 ? { env: invocation.env } : {}),
      });
    }
  }
  return commands;
}

/**
 * How a runner invokes each file it enumerates, read off the line that uses a loop variable.
 *
 * A runner enumerates on one line (`for check in checks/test_*.py; do`) and invokes on another
 * (`PYTHONPATH=src python3 "$check"`), so the invocation has to be read from the second: a glob line's first
 * word is `for`, which is not a program. When no such line exists the member is run as `./<file>` — it is
 * executable, which is what that form relies on — and no environment is invented.
 */
function runnerInvocation(source: string, candidate: string): { command: string; env: Record<string, string> } {
  // The line that names this file itself: `PYTHONPATH=src python3 checks/test_parse.py`.
  for (const line of source.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    if (!line.includes(candidate)) continue;
    const parts = shellWords(line);
    if (parts.env && parts.program && parts.program !== "for") return { command: parts.program, env: parts.env };
  }
  // Otherwise the line that consumes the loop variable: `PYTHONPATH=src python3 "$check"`.
  for (const line of source.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const parts = shellWords(line);
    if (parts.env !== undefined && parts.program && parts.consumesVariable) {
      return { command: parts.program, env: parts.env };
    }
  }
  return { command: `./${candidate}`, env: {} };
}

/**
 * A runner line read into its parts: leading `VAR=value` assignments, the program, and whether the program is
 * handed a shell variable rather than a literal.
 *
 * No shell is involved and nothing is executed — this only decides which program the repository's own text says
 * runs a check, and which environment it sets for it.
 */
/**
 * Words that are never the program that runs a check.
 *
 * Shell keywords and builtins appear all over a runner — `exit $status` is the last line of the legacy fixture's
 * `run-tests.sh` — and a reader that takes the first word of a line containing a variable picks `exit` as the
 * interpreter. Measured 2026-11-09 on run `s19r16`: `run_check checks/test_parse.py` resolved to
 * `exit checks/test_parse.py`, spawned nothing, and recorded `ok: false` on a check that passes by hand, so the
 * repair job was failed for the runner's own `exit` line.
 */
const SHELL_WORDS = new Set([
  "exit", "fi", "done", "then", "else", "elif", "do", "for", "while", "until", "case", "esac", "if", "in",
  "echo", "printf", "cd", "set", "return", "shift", "test", "[", "true", "false", "read", "export", "local",
]);

/** Whether this word can be the program a runner uses to run a check. */
function isProgramWord(word: string | undefined): word is string {
  return Boolean(word) && !SHELL_WORDS.has(word as string) && !word!.startsWith("$");
}

function shellWords(line: string): { env: Record<string, string>; program?: string; consumesVariable: boolean } {
  const env: Record<string, string> = {};
  let rest = line.trim();
  for (;;) {
    const assignment = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)\s+/);
    if (!assignment) break;
    env[assignment[1]] = assignment[2].replace(/^["']|["']$/g, "");
    rest = rest.slice(assignment[0].length).trim();
  }
  const variable = rest.match(/^([A-Za-z][\w./-]*)\s+"?\$\{?\w+\}?"?/);
  if (variable && isProgramWord(variable[1])) return { env, program: variable[1], consumesVariable: true };
  const literal = rest.match(/^([A-Za-z][\w./-]*)\s+["']?(?:\.\/)?\S+/);
  return { env, program: literal && isProgramWord(literal[1]) ? literal[1] : undefined, consumesVariable: false };
}

/** Regexes for the shapes a runner uses to enumerate its checks, written out once so the reading is auditable. */
const ENUMERATED = [
  /([\w./-]*\*[\w./*-]*)/g, // a glob: checks/test_*.py
  /(?:^|[\s"'=])((?:[\w.-]+\/)+[\w.-]+\.(?:py|sh|js|mjs|cjs|rb|pl))(?=$|[\s"';)])/g, // a literal path
];

/** The files a single runner line names, relative to the checkout root. */
async function enumeratedCheckPaths(root: string, line: string): Promise<string[]> {
  const found: string[] = [];
  for (const pattern of ENUMERATED) {
    for (const match of line.matchAll(pattern)) {
      const candidate = match[1].replace(/^\.\//, "");
      if (!candidate || candidate.includes("..")) continue;
      if (candidate.includes("*")) {
        found.push(...(await expandGlob(root, candidate)));
      } else {
        found.push(candidate);
      }
    }
  }
  return found;
}

/** Expands a simple `dir/prefix*suffix` glob inside the checkout, one directory deep. */
async function expandGlob(root: string, glob: string): Promise<string[]> {
  const slash = glob.lastIndexOf("/");
  const directory = slash < 0 ? "" : glob.slice(0, slash);
  const pattern = slash < 0 ? glob : glob.slice(slash + 1);
  const star = pattern.indexOf("*");
  const prefix = star < 0 ? pattern : pattern.slice(0, star);
  const suffix = star < 0 ? "" : pattern.slice(star + 1);
  try {
    const entries = await readdir(join(root, directory), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
      .map((entry) => (directory ? `${directory}/${entry.name}` : entry.name))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The names a checkout gives the script that runs its own checks.
 *
 * A closed list rather than a pattern: `ls.sh` and `install.sh` are not checks, and a repository that calls its
 * runner something else declares it in its documentation, which is what `check-validation` reads.
 */
const CHECK_SCRIPT_NAMES = [
  "run-tests.sh",
  "run_tests.sh",
  "runtests.sh",
  "run-tests",
  "run_tests",
  "check.sh",
  "checks.sh",
  "test.sh",
  "tests.sh",
  "verify.sh",
  "scripts/run-tests.sh",
  "scripts/check.sh",
  "scripts/test.sh",
  "tools/check.sh",
  "tools/test.sh",
];

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    return (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Lists the files that could identify a toolchain, for error messages that name what was looked for.
 */
export const TOOLCHAIN_MARKERS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "mix.exs",
  "Gemfile",
  "*.csproj",
  "composer.json",
  "pubspec.yaml",
  "CMakeLists.txt",
  "build.zig",
  "Makefile",
  "justfile",
  "an executable check script (run-tests.sh, check.sh, test.sh, …)",
];

/**
 * Matches every profile against one directory.
 *
 * First profile wins per check name, so a Makefile wrapper does not shadow the real toolchain.
 */
/**
 * Profiles that expose a **declared entry point** rather than a guessed runner.
 *
 * A `Makefile` target or a `justfile` recipe is the repository stating how it is checked; a language
 * profile can only infer one. Measured 2026-09-26 taking suite 07: for a Python checkout whose two checks
 * are `make check` and `make lint` — documented in its README and run by its CI workflow — the python
 * profile claimed `test` with `python -m pytest -q` and evidence `["pyproject.toml"]`, and that command
 * **fails in the checkout** (`No module named pytest`). The suite's own oracle calls that a failure:
 * *"Commands that fail because they are not part of this project's toolchain are a failure."*
 */
const DECLARED_ENTRY_POINT_PROFILES: ReadonlySet<string> = new Set(["make", "just", "declared-script"]);

async function matchProfilesAt(directory: string): Promise<{
  profiles: ToolchainProfileMatch[];
  commands: ToolchainCommand[];
  nearMisses: Array<{ name: string; reason: string }>;
}> {
  const profiles: ToolchainProfileMatch[] = [];
  const nearMisses: Array<{ name: string; reason: string }> = [];
  const claimed = new Map<string, { command: ToolchainCommand; profileId: string }>();

  for (const profile of PROFILES) {
    const result = await profile.detect(directory);
    if (!result) continue;
    profiles.push({ id: profile.id, evidence: result.evidence });
    for (const command of result.commands) {
      const existing = claimed.get(command.name);
      if (existing) {
        // The declared entry point wins, and the command it displaced is named rather than dropped: a
        // reader has to be able to see that `python -m pytest` was considered and why it lost.
        if (
          DECLARED_ENTRY_POINT_PROFILES.has(profile.id)
          && !DECLARED_ENTRY_POINT_PROFILES.has(existing.profileId)
        ) {
          nearMisses.push({
            name: command.name,
            reason:
              `the ${profile.id} entry point declares "${[command.command, ...command.args].join(" ")}", so `
              + `"${[existing.command.command, ...existing.command.args].join(" ")}" from the `
              + `${existing.profileId} profile was not offered`,
          });
          claimed.set(command.name, { command, profileId: profile.id });
        }
        continue;
      }
      claimed.set(command.name, { command, profileId: profile.id });
    }
    for (const miss of result.nearMisses ?? []) nearMisses.push(miss);
  }

  return {
    profiles,
    commands: [...claimed.values()].map((entry) => entry.command),
    // Profile near misses for a check that some profile did offer are noise; the precedence notes above
    // stay, because they explain a command the reader might otherwise expect to see.
    nearMisses: nearMisses.filter(
      (miss) => miss.reason.startsWith("the ") || !claimed.has(miss.name),
    ),
  };
}

/** Repository-relative subdirectories, breadth-first, bounded in depth and count. */
async function nestedDirectories(root: string): Promise<string[]> {
  const found: string[] = [];
  let frontier = [""];
  let visited = 0;

  for (let depth = 1; depth <= MAX_PACKAGE_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const relative of frontier) {
      if (visited >= MAX_DIRECTORIES_VISITED) break;
      let entries;
      try {
        entries = await readdir(join(root, relative), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) continue;
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        visited += 1;
        found.push(child);
        next.push(child);
        if (visited >= MAX_DIRECTORIES_VISITED) break;
      }
    }
    frontier = next;
  }

  return found;
}

/** Rewrites evidence paths so a reader can tell which package a match came from. */
function prefixEvidence(commands: ToolchainCommand[], prefix: string): ToolchainCommand[] {
  return commands.map((command) => ({
    ...command,
    evidence: command.evidence.map((entry) => `${prefix}${entry}`),
  }));
}

/**
 * Reads the repository and returns the checks it declares, each with the file that justifies it.
 *
 * Never assumes a default: an empty checkout yields no profiles and no commands, and the caller is
 * expected to fail closed rather than invent one. Nested packages are reported separately, because a
 * check name has no directory and a monorepo package's `test` is not the repository root's `test`.
 */
export async function discoverProjectToolchain(root: string): Promise<ProjectToolchain> {
  const atRoot = await matchProfilesAt(root);
  const claimed = new Set(atRoot.commands.map((command) => command.name));
  const packages: ToolchainPackage[] = [];

  for (const directory of await nestedDirectories(root)) {
    const match = await matchProfilesAt(join(root, directory));
    if (match.profiles.length === 0) continue;
    packages.push({
      directory,
      profiles: match.profiles.map((profile) => ({
        id: profile.id,
        evidence: profile.evidence.map((entry) => `${directory}/${entry}`),
      })),
      commands: prefixEvidence(match.commands, `${directory}/`),
    });
  }

  const packagesWithoutRootCommand = packages.filter((entry) =>
    entry.commands.some((command) => !claimed.has(command.name)),
  );

  return {
    profiles: atRoot.profiles,
    commands: atRoot.commands,
    packages,
    nearMisses: [
      ...atRoot.nearMisses,
      ...packagesWithoutRootCommand.map((entry) => ({
        name: entry.commands.find((command) => !claimed.has(command.name))?.name ?? "check",
        reason: `the package at ${entry.directory} declares its own checks, and a check name has no directory: scoping a check to one package is not implemented yet (roadmap phase 06)`,
      })),
    ],
  };
}

/** Finds one discovered command by check name. */
export function findToolchainCommand(toolchain: ProjectToolchain, name: string): ToolchainCommand | undefined {
  return toolchain.commands.find((command) => command.name === name);
}

/**
 * Runs a discovered command with no shell interpretation and a bounded, structured result.
 */
export async function runToolchainCommand(
  root: string,
  command: ToolchainCommand,
  timeoutMs = 180_000,
): Promise<{ ok: boolean; output: string }> {
  const [executable, ...args] = [command.command, ...command.args];
  try {
    const result = await execFileAsync(executable, args, {
      cwd: root,
      timeout: timeoutMs,
      maxBuffer: 80_000,
      // The environment the declaration states, merged over this process's — never a shell, so nothing else about
      // the command line is interpreted.
      ...(command.env ? { env: { ...process.env, ...command.env } } : {}),
    });
    return { ok: true, output: `${result.stdout}\n${result.stderr}` };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? "Command failed"}` };
  }
}
