/**
 * @module tools/file-search
 * Repository file listing and text search.
 *
 * Prefers ripgrep when it is installed, because it respects `.gitignore` and is
 * faster on large trees. Falls back to a bounded Node traversal so a worker in a
 * clean environment (CI runner, minimal container) keeps working instead of
 * failing with `spawn rg ENOENT`.
 */

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Directories never traversed by the fallback, matching ripgrep's default ignore behavior. */
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".next", "dist", "coverage"]);

/** Upper bound on entries the fallback visits, so a hostile tree cannot hang a job. */
const MAX_ENTRIES = 20_000;

/** Upper bound on bytes read per file while searching. */
const MAX_FILE_BYTES = 512 * 1024;

export interface FileSearchOptions {
  /** Directory to list or search below, relative to the repository root. */
  path: string;
  /** Literal text or regular expression to match. */
  pattern?: string;
  /** Stop after this many output characters. */
  maxOutputChars: number;
}

async function ripgrepAvailable(): Promise<boolean> {
  try {
    await execFileAsync("rg", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

let cachedAvailability: boolean | undefined;

/**
 * Reports whether ripgrep is usable, probing once per process.
 *
 * Set `KAMPAKU_WORKER_FORCE_NODE_SEARCH=1` to force the built-in traversal, for
 * example on a host where ripgrep is present but cannot be trusted with the
 * repository layout.
 */
export async function hasRipgrep(): Promise<boolean> {
  if (process.env.KAMPAKU_WORKER_FORCE_NODE_SEARCH === "1") return false;
  if (cachedAvailability === undefined) cachedAvailability = await ripgrepAvailable();
  return cachedAvailability;
}

/** Resets the cached ripgrep probe. Test-only helper. */
export function resetRipgrepProbe(): void {
  cachedAvailability = undefined;
}

interface WalkEntry {
  absolutePath: string;
  relativePath: string;
}

async function walk(root: string, start: string, filesOnly: boolean): Promise<WalkEntry[]> {
  const entries: WalkEntry[] = [];
  const queue: string[] = [start];

  while (queue.length > 0 && entries.length < MAX_ENTRIES) {
    const current = queue.shift()!;
    let children: string[];
    try {
      children = await readdir(current);
    } catch {
      continue;
    }

    for (const name of children) {
      if (entries.length >= MAX_ENTRIES) break;
      if (SKIPPED_DIRECTORIES.has(name)) continue;
      const absolutePath = join(current, name);
      let info;
      try {
        info = await stat(absolutePath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        queue.push(absolutePath);
        if (!filesOnly) {
          entries.push({ absolutePath, relativePath: relative(root, absolutePath) });
        }
        continue;
      }
      if (info.isFile()) {
        entries.push({ absolutePath, relativePath: relative(root, absolutePath) });
      }
    }
  }

  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Lists repository files below a directory.
 *
 * @returns One relative path per line, or `No files` when nothing matched.
 */
export async function listRepositoryFiles(
  root: string,
  directory: string,
  maxOutputChars: number,
): Promise<string> {
  if (await hasRipgrep()) {
    const result = await execFileAsync("rg", ["--files", "--hidden", "-g", "!.git"], {
      cwd: directory,
      maxBuffer: maxOutputChars * 2,
    }).catch((error: { code?: number }) => {
      if (error.code === 1) return { stdout: "No files\n", stderr: "" };
      throw error;
    });
    return result.stdout;
  }

  const files = await walk(root, resolve(directory), true);
  if (files.length === 0) return "No files\n";
  return `${files.map((entry) => entry.relativePath).join("\n")}\n`;
}

/**
 * Searches file contents with ripgrep when available, otherwise with a bounded
 * Node traversal that matches the same `path:line:text` shape.
 */
export async function searchRepositoryFiles(
  root: string,
  options: FileSearchOptions,
): Promise<string> {
  const pattern = options.pattern ?? "";
  if (await hasRipgrep()) {
    const result = await execFileAsync(
      "rg",
      ["-n", "--hidden", "-g", "!.git", "--", pattern, options.path],
      { cwd: root, maxBuffer: options.maxOutputChars * 2 },
    ).catch((error: { code?: number }) => {
      if (error.code === 1) return { stdout: "No matches\n", stderr: "" };
      throw error;
    });
    return result.stdout;
  }

  let matcher: RegExp;
  try {
    matcher = new RegExp(pattern);
  } catch {
    // An invalid regular expression is reported like ripgrep would report it.
    throw new Error(`Invalid search pattern: ${pattern}`);
  }

  const start = resolve(root, options.path);
  const info = await stat(start).catch(() => undefined);
  const targets = info?.isFile() ? [{ absolutePath: start, relativePath: options.path }] : await walk(root, start, true);

  const lines: string[] = [];
  let characters = 0;

  for (const target of targets) {
    if (characters >= options.maxOutputChars) break;
    let source: string;
    try {
      const fileInfo = await stat(target.absolutePath);
      if (fileInfo.size > MAX_FILE_BYTES) continue;
      source = await readFile(target.absolutePath, "utf8");
    } catch {
      continue;
    }
    if (source.includes("\u0000")) continue;

    const fileLines = source.split("\n");
    for (let index = 0; index < fileLines.length; index += 1) {
      const line = fileLines[index]!;
      if (!matcher.test(line)) continue;
      const rendered = `${target.relativePath}:${index + 1}:${line}\n`;
      lines.push(rendered);
      characters += rendered.length;
      if (characters >= options.maxOutputChars) break;
    }
  }

  return lines.length === 0 ? "No matches\n" : lines.join("");
}
