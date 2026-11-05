import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/application/projects.js";
import { declarationsOf, assessPlanChecks } from "../../src/delegator/check-validation.js";
import type { PlannedWorkItem } from "../../src/delegator/types.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { createGoalWithPlan } from "../../src/planner/create-goal.js";

/**
 * Suite 19 — brownfield and legacy, locked from the side that produces the work order.
 *
 * Every case here comes from the suite's own oracle (`docs/eval/19-brownfield-and-legacy.md`) and from what run
 * `s19r1` measured on 2026-11-05, driven on two checkouts prepared outside the platform:
 *
 * **L** — a legacy Python checkout: `src/ledger/`, executable checks under `checks/` with plain `assert`
 * statements, one `run-tests.sh`, a `README.rst` and a `CONTRIBUTING.md` that calls `./run-tests.sh` *"the only
 * supported check command"*, no manifest, no `Makefile`, no CI — and two checks that fail.
 *
 * **M** — a monorepo of three npm workspaces sharing `@mono/contract`, with its own CI workflow and a
 * `CONTRIBUTING.md` that states the packages' own commands and a versioning rule for the contract.
 *
 * What the run measured, and what each case below locks:
 *
 * 1. **No scaffold imposition.** Seeding refuses a directory that holds anything, so a strange checkout is linked
 *    exactly as it is — not one byte written, and the files the seed would have added stay absent.
 * 2. **Checks come from the repository's own toolchain (F2).** The job's own record carried
 *    `requiredChecks: []` and `verificationCapabilities` without `run_check`, so the executor refused the one
 *    command that proves anything in L — `{"ok":false,"error":"Capability denied by work-item policy: run_check"}`
 *    — and the factory could not observe the failure it was asked to diagnose. A checkout that declares its check
 *    as a script has declared a check: it is discovered, it is what `run_check` resolves to, and the policy that
 *    gates the capability follows the checkout rather than the router's reading of one sentence.
 * 3. **Conventions followed, not replaced.** A criterion naming a command L does not declare (`make check`) is
 *    refused while the one it declares is accepted, so the platform cannot push its usual wrapper onto a
 *    repository that states its own.
 * 4. **Blast radius.** M's checks are M's own; a criterion requiring a command no package in it declares is a
 *    finding, and no package is asked to run another's toolchain.
 */
describe("eval suite 19 — brownfield and legacy", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  /** Scenario L, built the way the suite's prereq describes it: a checkout nobody in the platform wrote. */
  function legacyCheckout(): string {
    const root = mkdtempSync(join(tmpdir(), "kampaku-s19-legacy-"));
    mkdirSync(join(root, "src", "ledger"), { recursive: true });
    mkdirSync(join(root, "checks"), { recursive: true });
    mkdirSync(join(root, "tools"), { recursive: true });
    writeFileSync(join(root, "README.rst"), "# Ledger\n\nRunning the checks\n\n    ./run-tests.sh\n");
    writeFileSync(join(root, "CONTRIBUTING.md"), "- `./run-tests.sh` is the only supported check command.\n");
    writeFileSync(join(root, ".editorconfig"), "root = true\n\n[*]\nindent_size = 4\n");
    writeFileSync(join(root, "run-tests.sh"), "#!/bin/sh\nPYTHONPATH=src python3 checks/test_parse.py\n", { mode: 0o755 });
    writeFileSync(join(root, "src", "ledger", "__init__.py"), '"""Ledger."""\n');
    writeFileSync(join(root, "src", "ledger", "parse.py"), "def parse_lines(text):\n    return text\n");
    writeFileSync(join(root, "src", "ledger", "totals.py"), "def total(rows):\n    return None\n");
    writeFileSync(join(root, "checks", "test_parse.py"), "assert True\n");
    writeFileSync(join(root, "tools", "renumber.py"), "print('hi')\n");
    return root;
  }

  /** Scenario M: three packages, a shared contract between two of them, and the checkout's own CI. */
  function monorepoCheckout(): string {
    const root = mkdtempSync(join(tmpdir(), "kampaku-s19-mono-"));
    for (const pkg of ["contract", "orders", "cli"]) {
      mkdirSync(join(root, "packages", pkg, "src"), { recursive: true });
      mkdirSync(join(root, "packages", pkg, "test"), { recursive: true });
      writeFileSync(
        join(root, "packages", pkg, "package.json"),
        JSON.stringify({ name: `@mono/${pkg}`, type: "module", scripts: { test: "node --test test/*.test.js" } }),
      );
      writeFileSync(join(root, "packages", pkg, "test", `${pkg}.test.js`), "// assertions\n");
    }
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - run: npm test --workspaces\n");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "mono-orders", private: true, workspaces: ["packages/*"], scripts: { test: "npm test --workspaces" } }),
    );
    writeFileSync(
      join(root, "CONTRIBUTING.md"),
      "## Checks\n\n- `npm test --workspace @mono/orders` for the package you touched;\n  a contract change is a versioning decision.\n",
    );
    return root;
  }

  function leaf(title: string, criteria: string[]): PlannedWorkItem {
    return { title, description: `${title} — the smallest change the request implies.`, acceptance_criteria: criteria } as PlannedWorkItem;
  }

  /** A store whose default project is L, so a job input can be built exactly as dispatch builds it. */
  function fixture(checkout: string) {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-s19-data-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const project = createProject(store, {
      slug: "legacy-ledger",
      name: "legacy-ledger",
      status: "active",
      repositories: [{ url: `file://${checkout}`, role: "core" }],
    });
    return { store, config, project };
  }

  it("writes no scaffold into a checkout it did not create, and touches none of its files", () => {
    const checkout = legacyCheckout();
    const before = snapshot(checkout);

    const { project } = fixture(checkout);

    expect(project.repositories?.[0]?.url).toBe(`file://${checkout}`);
    // The seed's own answer: nothing seeded, nothing skipped — this directory is not the platform's to shape.
    expect((project as { repoBootstrap?: { seeded: string[] } }).repoBootstrap?.seeded ?? []).toEqual([]);
    expect(snapshot(checkout)).toEqual(before);
    for (const filename of ["AGENTS.md", "LICENSE", ".env.example", "Makefile", "pyproject.toml", "requirements.txt"]) {
      expect(() => statSync(join(checkout, filename)), `${filename} must not be written into a stranger's checkout`).toThrow();
    }
  }, 20000);

  it("runs the check the legacy checkout declares, and opens run_check for it", async () => {
    const checkout = legacyCheckout();
    const { store, config, project } = fixture(checkout);

    // Discovery first: the platform names the repository's own command, with the file as evidence.
    expect(declarationsOf(checkout)).toEqual([
      { name: "test", command: "./run-tests.sh", evidence: "run-tests.sh (executable check script)" },
    ]);
    // And a plan written inside that convention is traceable, rather than refused or silently unchecked.
    expect(
      assessPlanChecks(
        [leaf("Fix parse_lines", ["`./run-tests.sh` prints `ok` for both checks and exits 0."])],
        { checkoutPath: checkout },
      ).findings,
    ).toEqual([]);

    const result = await createGoalWithPlan(store, config, {
      projectId: project.id,
      objective: "Bring the checkout to a working state, keeping the layout and the public interface.",
      repositoryRole: "core",
      projectContext: {
        projectId: project.id,
        projectSlug: "legacy-ledger",
        projectName: "legacy-ledger",
        repositories: project.repositories,
        repositoryRole: "core",
        repositoryPath: checkout,
        workspaceDir: "eval-legacy-ledger",
        isExternal: true,
        stackHints: [],
      },
      plannedTask: {
        title: "Observe the baseline",
        prompt: "Run the repository's own check and record its exit code and output.",
        repositoryRole: "core",
        acceptanceCriteria: ["`./run-tests.sh` exits 0 and both checks print ok."],
      },
    });

    const job = store.getJob(result.jobId);
    const input = job?.input as { requiredChecks?: string[]; verificationCapabilities?: string[] } | undefined;
    // The capability the executor needs in order to run *any* check of this repository.
    expect(input?.verificationCapabilities).toContain("run_check");
    // The check the criterion names, in the vocabulary the runner resolves against the checkout.
    expect(input?.requiredChecks).toEqual(["test"]);
  }, 20000);

  it("refuses a wrapper this checkout does not declare, so the platform cannot impose its own", () => {
    const checkout = legacyCheckout();
    const assessment = assessPlanChecks(
      [leaf("Fix the totals", ["`make check` exits 0."])],
      { checkoutPath: checkout, repositoryLabel: "file:///home/pdonoso/projects/eval-legacy-ledger" },
    );

    expect(assessment.findings).toHaveLength(1);
    expect(assessment.findings[0]?.check).toBe("test");
    // The finding names the declaration it does have, so the repair is a different command rather than a guess.
    expect(assessment.findings[0]?.detail).toContain("./run-tests.sh");
  }, 20000);

  it("scopes a monorepo change to the package it implies, and keeps CI intact", () => {
    const checkout = monorepoCheckout();
    const before = snapshot(checkout);

    // The checkout declares its own checks at the root, and each package declares its own.
    expect(declarationsOf(checkout).map((command) => command.command)).toEqual(["npm run test"]);
    expect(declarationsOf(join(checkout, "packages", "orders")).map((command) => command.command)).toEqual(["npm run test"]);
    expect(declarationsOf(join(checkout, "packages", "cli")).map((command) => command.command)).toEqual(["npm run test"]);
    // A change to one package is a criterion against that package's own command, and it is traceable.
    expect(
      assessPlanChecks([leaf("Add the total to orders", ["`npm run test` passes in packages/orders."])], {
        checkoutPath: join(checkout, "packages", "orders"),
      }).findings,
    ).toEqual([]);

    // A toolchain no package declares is a finding: the blast radius is a claim the checkout can contradict.
    const foreign = assessPlanChecks([leaf("Rewrite the build", ["`cargo test` passes."])], { checkoutPath: checkout });
    expect(foreign.findings).toHaveLength(1);

    // Nothing the platform read changed, and the checkout's CI is still the checkout's CI (F4, "CI not disabled").
    expect(snapshot(checkout)).toEqual(before);
  }, 20000);
});

/** Every file under `root`, with its bytes and mode: the "not one byte written" half of the oracle. */
function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (relative: string) => {
    const path = relative ? join(root, relative) : root;
    for (const entry of readDir(path)) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      files[child] = `${(statSync(join(root, child)).mode & 0o777).toString(8)}:${readFileSync(join(root, child), "utf8")}`;
    }
  };
  walk("");
  return files;
}

function readDir(path: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node:fs").readdirSync(path, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean }>;
}
