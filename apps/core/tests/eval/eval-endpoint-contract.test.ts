import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Roadmap 11 § Part A's regression guard: **a vendor name must not reappear in shipped surface.**
 *
 * The contract is `KAMPAKU_MODEL_*` and nothing else, and Part A's gate is explicit that a
 * repository-wide search must return nothing outside marked historical records. A gate that is only
 * checked by hand is checked once, so this is the build-time check: it walks the surfaces an operator
 * receives — source, contracts, scripts, env templates, and the READMEs that ship with them — and fails
 * if a vendor name comes back.
 *
 * **`docs/` is deliberately excluded, and that exclusion is the point of the gate rather than a hole in
 * it.** The roadmap records *are* the marked historical record: LEADINGS, the BOARD rows, the baseline
 * run logs, and the ADRs all have to be able to say "this used to be called X" in order to be honest
 * about when it changed. A guard that scrubbed them would destroy the audit trail it belongs to.
 *
 * The distinction this file enforces is therefore: **shipped surface** names what it does, **historical
 * record** may name what it was.
 */
/**
 * Built from parts rather than written as a literal, so this file does not trip its own guard. A guard
 * that has to be excluded from its own check is a guard with a hole in it.
 */
const VENDOR_PATTERN = new RegExp(["free", "llm", "api"].join("-?"), "i");
const VENDOR_ENV_VAR = `${["FREE", "LLM", "API"].join("")}_BASE_URL`;

/** Where an operator reads or receives something. */
const SHIPPED_ROOTS = [
  "apps/core/src",
  "apps/core/tests",
  "apps/core/README.md",
  "apps/worker/src",
  "apps/worker/tests",
  "apps/web/src",
  "apps/web/e2e",
  "packages/contracts",
  "scripts",
  ".env.example",
];

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".sh",
  ".md",
  ".example",
  ".yml",
  ".yaml",
]);

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".next", "coverage", "test-results"]);

function repoRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "packages/contracts"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find the repository root from ${process.cwd()}`);
}

function collectFiles(absolute: string, found: string[] = []): string[] {
  if (!existsSync(absolute)) return found;
  const stats = statSync(absolute);
  if (stats.isFile()) {
    if (TEXT_EXTENSIONS.has(absolute.slice(absolute.lastIndexOf(".")))) found.push(absolute);
    return found;
  }
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    collectFiles(join(absolute, entry.name), found);
  }
  return found;
}

describe("endpoint contract regression guard", () => {
  it("names no vendor in shipped source, contracts, scripts, env templates, or READMEs", () => {
    const root = repoRoot();
    const offenders: string[] = [];

    for (const shipped of SHIPPED_ROOTS) {
      for (const file of collectFiles(join(root, shipped))) {
        const text = readFileSync(file, "utf8");
        text.split("\n").forEach((line, index) => {
          if (VENDOR_PATTERN.test(line)) {
            offenders.push(`${relative(root, file)}:${index + 1}`);
          }
        });
      }
    }

    // Asserted as the exact list rather than a count, so a reappearance names its file and line.
    expect(offenders).toEqual([]);
  });

  it("keeps the documented contract in the env template, with no second spelling", () => {
    const template = readFileSync(join(repoRoot(), ".env.example"), "utf8");

    expect(template).toContain("KAMPAKU_MODEL_BASE_URL=");
    expect(template).toContain("KAMPAKU_MODEL_API_KEY=");
    expect(template).toContain("KAMPAKU_MODEL_INITIAL_TIMEOUT_MS=");
    expect(template).toContain("KAMPAKU_MODEL_INITIAL_RETRIES=");
    // And the executor names what it does, not who provides it.
    expect(template).toMatch(/^KAMPAKU_EXECUTOR=openai-compatible$/m);
  });

  /**
   * The guard is only worth having if it can fail. This proves the pattern it looks for is one it would
   * actually catch, so a green run means the surface is clean rather than that the regex is dead.
   */
  it("would catch a reappearance", () => {
    expect(VENDOR_PATTERN.test(`const url = process.env.${VENDOR_ENV_VAR};`)).toBe(true);
    expect(VENDOR_PATTERN.test("KAMPAKU_MODEL_BASE_URL=http://127.0.0.1:3001/v1")).toBe(false);
  });
});
