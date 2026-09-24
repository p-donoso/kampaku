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
  name: CheckName | "install" | "verify";
  /** Executable, no shell interpretation. */
  command: string;
  args: string[];
  /** Files, and where relevant the exact declared key or target, that justify the command. */
  evidence: string[];
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
];

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
];

/**
 * Matches every profile against one directory.
 *
 * First profile wins per check name, so a Makefile wrapper does not shadow the real toolchain.
 */
async function matchProfilesAt(directory: string): Promise<{
  profiles: ToolchainProfileMatch[];
  commands: ToolchainCommand[];
  nearMisses: Array<{ name: string; reason: string }>;
}> {
  const profiles: ToolchainProfileMatch[] = [];
  const commands: ToolchainCommand[] = [];
  const nearMisses: Array<{ name: string; reason: string }> = [];
  const claimed = new Set<string>();

  for (const profile of PROFILES) {
    const result = await profile.detect(directory);
    if (!result) continue;
    profiles.push({ id: profile.id, evidence: result.evidence });
    for (const command of result.commands) {
      if (claimed.has(command.name)) continue;
      claimed.add(command.name);
      commands.push(command);
    }
    for (const miss of result.nearMisses ?? []) nearMisses.push(miss);
  }

  return { profiles, commands, nearMisses: nearMisses.filter((miss) => !claimed.has(miss.name)) };
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
    const result = await execFileAsync(executable, args, { cwd: root, timeout: timeoutMs, maxBuffer: 80_000 });
    return { ok: true, output: `${result.stdout}\n${result.stderr}` };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? "Command failed"}` };
  }
}
