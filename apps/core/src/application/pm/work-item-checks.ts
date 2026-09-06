import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const SCRIPT_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  { pattern: /\bnpm run test:e2e\b/i, script: "test:e2e" },
  { pattern: /\bnpm run build\b/i, script: "build" },
  { pattern: /\bnpm run typecheck\b/i, script: "typecheck" },
  { pattern: /\bnpm run test\b/i, script: "test" },
  { pattern: /\bnpm test\b/i, script: "test" },
  { pattern: /\bnpm run docs:build\b/i, script: "docs:build" },
];

const ACCEPTANCE_CRITERIA_MARKER = "Acceptance criteria:";

export type DiskCheck =
  | { id: string; command: string; kind: "node_script"; script: string; expectOutputIncludes?: string }
  | { id: string; command: string; kind: "node_test" }
  | { id: string; command: string; kind: "npm_script"; script: string }
  | { id: string; command: string; kind: "file_exists"; relativePath: string }
  | { id: string; command: string; kind: "file_contains"; relativePath: string; needle: string };

export type DiskCheckResult = {
  id: string;
  command: string;
  ok: boolean;
  detail: string;
};

function normalizeRelativePath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["'`]/, "").replace(/["'`]$/, "");
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("..")) return null;
  return trimmed.replace(/^\.\//, "");
}

function resolveInsideRepo(repoPath: string, relativePath: string): string | null {
  const safe = normalizeRelativePath(relativePath);
  if (!safe) return null;
  const full = resolve(repoPath, safe);
  const root = resolve(repoPath);
  if (full !== root && !full.startsWith(`${root}${sep}`)) return null;
  return full;
}

/**
 * Infer runnable disk checks from acceptance-criteria lines only.
 * Does not invent project-specific entrypoints or expected strings.
 */
export function inferDiskChecksFromAcceptanceCriteria(criteria: string[]): DiskCheck[] {
  const byId = new Map<string, DiskCheck>();

  const add = (check: DiskCheck) => {
    if (!byId.has(check.id)) byId.set(check.id, check);
  };

  for (const raw of criteria) {
    const line = raw.trim();
    if (!line) continue;

    const fileExists =
      line.match(/^file exists:\s*(.+)$/i) ?? line.match(/^file exists at\s+(.+)$/i);
    if (fileExists) {
      const relativePath = normalizeRelativePath(fileExists[1] ?? "");
      if (relativePath) {
        add({
          id: `exists:${relativePath}`,
          command: `file exists: ${relativePath}`,
          kind: "file_exists",
          relativePath,
        });
      }
      continue;
    }

    const contains =
      line.match(/^(.+?)\s+contains\s+(.+)$/i) ?? line.match(/^(.+?)\s+mentions\s+(.+)$/i);
    if (contains) {
      const relativePath = normalizeRelativePath(contains[1] ?? "");
      const needle = (contains[2] ?? "").trim().replace(/^["']|["']$/g, "");
      if (relativePath && needle) {
        add({
          id: `contains:${relativePath}:${needle}`,
          command: `${relativePath} contains ${needle}`,
          kind: "file_contains",
          relativePath,
          needle,
        });
      }
      continue;
    }

    if (/\bnode --test\b/i.test(line)) {
      add({ id: "node-test", command: "node --test", kind: "node_test" });
      continue;
    }

    const nodeScript = line.match(/\bnode\s+([\w./-]+\.(?:js|mjs|cjs))\b(?:\s+prints\s+(.+))?/i);
    if (nodeScript) {
      const script = normalizeRelativePath(nodeScript[1] ?? "");
      if (script) {
        const expectRaw = nodeScript[2]?.trim().replace(/^["']|["']$/g, "");
        add({
          id: `node:${script}${expectRaw ? `:${expectRaw}` : ""}`,
          command: expectRaw ? `node ${script} prints ${expectRaw}` : `node ${script}`,
          kind: "node_script",
          script,
          expectOutputIncludes: expectRaw || undefined,
        });
      }
      continue;
    }

    const npmRun = line.match(/\bnpm run\s+([\w:.-]+)\b/i);
    if (npmRun) {
      const script = npmRun[1]!;
      add({
        id: `npm:${script}`,
        command: `npm run ${script}`,
        kind: "npm_script",
        script,
      });
      continue;
    }

    if (/\bnpm test\b/i.test(line)) {
      add({ id: "npm:test", command: "npm test", kind: "npm_script", script: "test" });
    }
  }

  return [...byId.values()];
}

/** Run inferred disk checks under a linked repository path. */
export function runDiskChecks(repoPath: string, checks: DiskCheck[]): DiskCheckResult[] {
  return checks.map((check) => {
    try {
      if (check.kind === "file_exists") {
        const full = resolveInsideRepo(repoPath, check.relativePath);
        if (!full) {
          return { id: check.id, command: check.command, ok: false, detail: "unsafe path" };
        }
        const ok = existsSync(full);
        return {
          id: check.id,
          command: check.command,
          ok,
          detail: ok ? "present" : `${check.relativePath} missing`,
        };
      }

      if (check.kind === "file_contains") {
        const full = resolveInsideRepo(repoPath, check.relativePath);
        if (!full) {
          return { id: check.id, command: check.command, ok: false, detail: "unsafe path" };
        }
        if (!existsSync(full)) {
          return {
            id: check.id,
            command: check.command,
            ok: false,
            detail: `${check.relativePath} missing`,
          };
        }
        const body = readFileSync(full, "utf8");
        const ok = body.includes(check.needle);
        return {
          id: check.id,
          command: check.command,
          ok,
          detail: ok ? `contains ${check.needle}` : `${check.relativePath} lacks ${check.needle}`,
        };
      }

      if (check.kind === "node_script") {
        const full = resolveInsideRepo(repoPath, check.script);
        if (!full || !existsSync(full)) {
          return {
            id: check.id,
            command: check.command,
            ok: false,
            detail: `${check.script} missing`,
          };
        }
        const output = execFileSync("node", [check.script], {
          cwd: repoPath,
          encoding: "utf8",
        }).trim();
        if (check.expectOutputIncludes && !output.includes(check.expectOutputIncludes)) {
          return {
            id: check.id,
            command: check.command,
            ok: false,
            detail: `expected output to include ${check.expectOutputIncludes}; got: ${output || "(empty)"}`,
          };
        }
        return {
          id: check.id,
          command: check.command,
          ok: true,
          detail: `output: ${output || "(empty)"}`,
        };
      }

      if (check.kind === "node_test") {
        execFileSync("node", ["--test"], { cwd: repoPath, encoding: "utf8", stdio: "pipe" });
        return { id: check.id, command: check.command, ok: true, detail: "passed" };
      }

      // npm_script
      const args = check.script === "test" ? ["test"] : ["run", check.script];
      execFileSync("npm", args, { cwd: repoPath, encoding: "utf8", stdio: "pipe" });
      return { id: check.id, command: check.command, ok: true, detail: "passed" };
    } catch (error) {
      const detail =
        error && typeof error === "object" && "stderr" in error
          ? String((error as { stderr?: Buffer | string }).stderr ?? error)
          : error instanceof Error
            ? error.message
            : String(error);
      return { id: check.id, command: check.command, ok: false, detail: detail.slice(0, 500) };
    }
  });
}

/** Extract the acceptance-criteria section from a work-item objective or planner prompt. */
export function extractAcceptanceCriteriaSection(text: string): string {
  const idx = text.indexOf(ACCEPTANCE_CRITERIA_MARKER);
  if (idx < 0) return "";
  return text.slice(idx + ACCEPTANCE_CRITERIA_MARKER.length);
}

/** Infer npm script names that must pass from task text or acceptance criteria. */
export function inferRequiredCheckScripts(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, script } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) found.add(script);
  }
  return [...found];
}

/** Infer checks from acceptance criteria only — not title, description, or planner boilerplate. */
export function inferRequiredChecksFromWorkItem(input: {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
}): string[] {
  if (input.acceptanceCriteria?.length) {
    return inferRequiredCheckScripts(input.acceptanceCriteria.join("\n"));
  }
  const fromObjective = extractAcceptanceCriteriaSection(
    [input.title, input.description ?? ""].filter(Boolean).join("\n\n"),
  );
  return inferRequiredCheckScripts(fromObjective);
}

export function inferRequiredChecksFromObjective(objective: string): string[] {
  return inferRequiredCheckScripts(extractAcceptanceCriteriaSection(objective));
}

export function evaluateJobCheckResults(
  required: string[],
  checkResults: Record<string, unknown> | undefined,
): { ok: true } | { ok: false; message: string } {
  if (required.length === 0) return { ok: true };

  const results = checkResults ?? {};
  const missing = required.filter((script) => results[script] !== true);
  if (missing.length === 0) return { ok: true };

  const failed = required.filter(
    (script) => script in results && results[script] !== true,
  );
  if (failed.length > 0) {
    return {
      ok: false,
      message: `Required checks failed: ${failed.join(", ")}.`,
    };
  }

  return {
    ok: false,
    message: `Required checks not run: ${missing.join(", ")}.`,
  };
}
