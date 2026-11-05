/**
 * @module application/pm/declared-checks
 *
 * The checks the checkout a project is linked to **declares**, so a criterion written by the platform can name
 * a command that checkout can actually run.
 *
 * Why this module exists. `applyDeterministicLeafSplit` writes the acceptance criteria of every child it
 * creates, and it used to write them from a hardcoded npm template:
 *
 * ```text
 * npm test succeeds when package.json defines a test script
 * ```
 *
 * Measured on suite 08's re-run (run `s08r8`, BOARD F-086), on a **Python** checkout with a `Makefile` and no
 * `package.json`: the splitter handed that sentence to a Python leaf's children, its own text re-triggered the
 * npm detector so a second pass wrote `npm run test succeeds`, and the closure gate then asked the operator to
 * certify a criterion naming a command the repository cannot run. A criterion is a claim about **this**
 * repository, so the only acceptable source for it is this repository's own declarations — the same rule the
 * substrate already applies when it discovers a toolchain at execution time
 * ([F-003](../../../../docs/eval/results/BOARD.md), [agnosticism invariants](../../../../docs/concepts/agnosticism-invariants.md)).
 *
 * Relationship to `apps/worker/src/tools/project-toolchain.ts`: that module is the **execution-time authority**
 * — it is what actually runs a check for a job, it is async, and it reports nested packages and near misses.
 * This module exists because the splitter runs in Core, synchronously, before any job exists, and needs one
 * thing only: the literal command that proves the checks a child will be handed. Both read the same rule
 * (evidence or nothing: a command is offered only when the file that declares it exists) and the same neutral
 * check names (`application/pm/work-item-checks.ts`), because two vocabularies is how BOARD F-082 happened.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** A command a checkout declares, with the declaration that justifies it. */
export interface DeclaredCheckCommand {
  /** Neutral check name: `test`, `lint`, `build`, `typecheck`, `test:e2e`. */
  name: string;
  /** The literal command line, e.g. `make check`. */
  command: string;
  /** Path, and the exact key or target, that justifies it. Never a guess. */
  evidence: string;
}

/** Preference order for the criteria a split writes: the repository's gate first, then its linters and builds. */
const CHECK_NAME_ORDER = ["test", "lint", "build", "typecheck", "test:e2e"];

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function firstExisting(root: string, names: string[]): string | null {
  for (const name of names) {
    if (existsSync(join(root, name))) return name;
  }
  return null;
}

/**
 * The names a checkout gives the script that runs its own checks.
 *
 * The same closed list the worker's discovery reads (`apps/worker/src/tools/project-toolchain.ts`), because one
 * checkout has one check runner and two vocabularies is how BOARD F-082 happened. A repository that calls its
 * runner something else declares it in its documentation, which `check-validation.ts` reads.
 */
export const CHECK_SCRIPT_NAMES: readonly string[] = [
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

/**
 * The first check script of `names` that exists in `root` and is executable.
 *
 * Executable is part of the evidence and not a detail: measured 2026-11-05 taking suite 19, a legacy checkout's
 * only check is `run-tests.sh`, which `./run-tests.sh` runs because the file carries its mode. A stored
 * `./run-tests.sh` for a file nobody can execute would be a command this module invented.
 */
export function declaredCheckScript(root: string | undefined): { name: string; command: string; evidence: string } | undefined {
  if (!root) return undefined;
  for (const name of CHECK_SCRIPT_NAMES) {
    const path = join(root, name);
    try {
      if (!statSync(path).isFile()) continue;
      if ((statSync(path).mode & 0o111) === 0) continue;
    } catch {
      continue;
    }
    return { name: "test", command: `./${name}`, evidence: `${name} (executable check script)` };
  }
  return undefined;
}

/** Target names a build file declares. A Makefile or justfile is the repository stating how it is checked. */
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

type Claim = (name: string, command: string, evidence: string) => void;

/**
 * Profile order mirrors the worker's table: manifests first, then the declared entry points (`Makefile`,
 * `justfile`) that override them, because a Makefile target is the repository speaking and a manifest can only
 * be inferred from. Order is load-bearing — the fixture this row was measured on declares `check` in a
 * `Makefile` **and** has a `pyproject.toml`, and only the Makefile target is a command it can actually run.
 */
function collectDeclaredChecks(root: string, claim: Claim, override: Claim): void {
  // 1. Language manifests, in the worker's order.
  const packageJson = readText(join(root, "package.json"));
  if (packageJson !== null) {
    try {
      const manifest = JSON.parse(packageJson) as { scripts?: Record<string, string> };
      const scripts = manifest.scripts ?? {};
      for (const [name, script] of [
        ["test", "test"],
        ["lint", "lint"],
        ["build", "build"],
        ["typecheck", "typecheck"],
        ["test:e2e", "test:e2e"],
      ] as Array<[string, string]>) {
        if (typeof scripts[script] === "string") {
          claim(name, `npm run ${script}`, `package.json scripts.${script}`);
        }
      }
    } catch {
      // An unreadable manifest declares nothing; claiming from it would be inventing a command.
    }
  }

  const pyproject = readText(join(root, "pyproject.toml"));
  const pythonMarkers = ["requirements.txt", "setup.py", "setup.cfg", "pytest.ini", "tox.ini", "pyproject.toml"]
    .filter((marker) => existsSync(join(root, marker)));
  const pythonTests = existsSync(join(root, "tests")) || existsSync(join(root, "test"));
  if (pyproject !== null && /\[tool\.poetry\]/.test(pyproject)) {
    claim("test", "poetry run pytest", "pyproject.toml [tool.poetry]");
    if (/\[tool\.ruff\]/.test(pyproject)) claim("lint", "poetry run ruff check .", "pyproject.toml [tool.ruff]");
  } else if (pythonMarkers.length > 0 || pythonTests) {
    const evidence = pythonMarkers[0] ?? "tests/";
    if (pythonMarkers.some((marker) => marker !== "pyproject.toml") || pythonTests) {
      claim("test", "python -m pytest -q", evidence);
    }
    if (pyproject !== null && /\[tool\.ruff\]/.test(pyproject)) {
      claim("lint", "python -m ruff check .", "pyproject.toml [tool.ruff]");
    }
  }

  if (existsSync(join(root, "Cargo.toml"))) {
    claim("test", "cargo test", "Cargo.toml");
    claim("build", "cargo build", "Cargo.toml");
    claim("typecheck", "cargo check", "Cargo.toml");
  }
  if (existsSync(join(root, "go.mod"))) {
    claim("test", "go test ./...", "go.mod");
    claim("build", "go build ./...", "go.mod");
  }
  if (existsSync(join(root, "pom.xml"))) {
    claim("test", "mvn -q verify", "pom.xml");
    claim("build", "mvn -q -DskipTests package", "pom.xml");
  }
  const gradle = firstExisting(root, ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"]);
  if (gradle) {
    const wrapper = existsSync(join(root, "gradlew"));
    const command = wrapper ? "./gradlew" : "gradle";
    claim("test", `${command} test`, wrapper ? `${gradle}, gradlew` : gradle);
    claim("build", `${command} build -x test`, gradle);
  }
  if (existsSync(join(root, "mix.exs"))) {
    claim("test", "mix test", "mix.exs");
    claim("build", "mix compile", "mix.exs");
  }
  if (existsSync(join(root, "Gemfile"))) {
    if (existsSync(join(root, "Rakefile"))) claim("test", "bundle exec rake test", "Gemfile, Rakefile");
    else if (existsSync(join(root, "spec"))) claim("test", "bundle exec rspec", "Gemfile, spec/");
  }
  const composer = readText(join(root, "composer.json"));
  if (composer !== null) {
    try {
      const manifest = JSON.parse(composer) as { scripts?: Record<string, string> };
      for (const name of ["test", "lint"]) {
        if (typeof manifest.scripts?.[name] === "string") {
          claim(name, `composer run ${name}`, `composer.json scripts.${name}`);
        }
      }
    } catch {
      // Same rule as package.json above.
    }
  }
  if (existsSync(join(root, "pubspec.yaml"))) claim("test", "dart test", "pubspec.yaml");
  const cmake = readText(join(root, "CMakeLists.txt"));
  if (cmake !== null && /enable_testing\s*\(/.test(cmake)) {
    claim("test", "ctest --output-on-failure", "CMakeLists.txt enable_testing()");
  }
  if (existsSync(join(root, "build.zig"))) {
    claim("test", "zig build test", "build.zig");
    claim("build", "zig build", "build.zig");
  }

  // 2. Declared entry points last, overriding: a target exists only because somebody wrote it down.
  const makefile = firstExisting(root, ["Makefile", "makefile", "GNUmakefile"]);
  if (makefile) {
    const targets = declaredTargets(readText(join(root, makefile)) ?? "");
    const wanted: Array<{ name: string; targets: string[] }> = [
      { name: "test", targets: ["test", "check"] },
      { name: "lint", targets: ["lint"] },
      { name: "build", targets: ["build", "all"] },
      { name: "typecheck", targets: ["typecheck"] },
    ];
    for (const entry of wanted) {
      const target = entry.targets.find((candidate) => targets.has(candidate));
      if (target) override(entry.name, `make ${target}`, `${makefile} target ${target}`);
    }
  }
  const justfile = firstExisting(root, ["justfile", "Justfile", ".justfile"]);
  if (justfile) {
    const targets = declaredTargets(readText(join(root, justfile)) ?? "");
    const wanted: Array<{ name: string; targets: string[] }> = [
      { name: "test", targets: ["test", "check"] },
      { name: "lint", targets: ["lint"] },
      { name: "build", targets: ["build"] },
    ];
    for (const entry of wanted) {
      const target = entry.targets.find((candidate) => targets.has(candidate));
      if (target) override(entry.name, `just ${target}`, `${justfile} recipe ${target}`);
    }
  }

  // 3. A check script the checkout declares by name, and made executable.
  //
  // `claim`, not `override`: a `Makefile` target or a `justfile` recipe is the same kind of evidence and comes
  // first, so a repository that has both keeps the wrapper it wrote. What this adds is the brownfield shape
  // measured on suite 19 — no manifest, no task runner, one `run-tests.sh` and a `CONTRIBUTING.md` that calls it
  // "the only supported check command" — where every other source was silent and the platform therefore offered
  // the project no check at all.
  const script = declaredCheckScript(root);
  if (script) claim(script.name, script.command, script.evidence);
}

/**
 * Reads a checkout and returns the checks it declares, ordered `test`, `lint`, `build`, `typecheck`, `test:e2e`.
 *
 * A missing or unreadable path yields an empty list rather than a default: the caller must not write a
 * criterion it cannot justify. Nothing here executes anything.
 */
export function resolveDeclaredCheckCommands(repositoryPath: string | undefined): DeclaredCheckCommand[] {
  if (!repositoryPath) return [];
  try {
    if (!existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) return [];
  } catch {
    return [];
  }

  const claimed = new Map<string, DeclaredCheckCommand>();
  const claim: Claim = (name, command, evidence) => {
    if (!claimed.has(name)) claimed.set(name, { name, command, evidence });
  };
  const override: Claim = (name, command, evidence) => {
    claimed.set(name, { name, command, evidence });
  };
  collectDeclaredChecks(repositoryPath, claim, override);

  return CHECK_NAME_ORDER.flatMap((name) => {
    const command = claimed.get(name);
    return command ? [command] : [];
  });
}

/**
 * The literal command line for one check name, when the checkout declares it.
 */
export function declaredCheckCommand(
  commands: DeclaredCheckCommand[],
  name: string,
): DeclaredCheckCommand | undefined {
  return commands.find((command) => command.name === name);
}
