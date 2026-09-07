/**
 * @module tools/file-tools
 * Filesystem and check tool definitions and handlers provided to LLM coding agents.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type OpenAI from "openai";
import { assertContentHasNoSecrets, assertPathNotSensitive } from "./secret-hygiene.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 40_000;

/**
 * Builds standard OpenAI Function Tool specification.
 */
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required, additionalProperties: false },
    },
  };
}

/**
 * Tool definitions exposed to the worker LLM coding agent for filesystem navigation,
 * editing, and package script validation.
 */
export const WORKER_CODING_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  tool("list_files", "List repository files, optionally below a directory.", {
    path: { type: "string", description: "Relative directory; defaults to repository root" },
  }),
  tool("search_files", "Search text in repository files with a regular expression.", {
    pattern: { type: "string" },
    path: { type: "string", description: "Relative file or directory; defaults to repository root" },
  }, ["pattern"]),
  tool("read_file", "Read a UTF-8 repository file.", {
    path: { type: "string" },
  }, ["path"]),
  tool("write_file", "Create or fully overwrite a UTF-8 repository file.", {
    path: { type: "string" },
    content: { type: "string" },
  }, ["path", "content"]),
  tool("replace_in_file", "Replace one exact, unique string in a UTF-8 repository file.", {
    path: { type: "string" },
    old_text: { type: "string" },
    new_text: { type: "string" },
  }, ["path", "old_text", "new_text"]),
  tool("run_check", "Run an npm script declared in package.json (e.g. test, build, test:e2e). Returns JSON { ok, script, output }.", {
    script: { type: "string", description: "Script name from package.json scripts" },
  }, ["script"]),
];

/**
 * Executes a tool requested by the model against the sandboxed repository root.
 *
 * @param name - Tool function name.
 * @param args - Tool arguments object.
 * @param root - Absolute path to the sandboxed repository root.
 * @returns Result string or JSON representation for tool response.
 */
export async function executeCodingTool(
  name: string,
  args: Record<string, unknown>,
  root: string,
): Promise<string> {
  switch (name) {
    case "list_files": {
      const cwd = await safePath(root, stringArg(args.path, "."), true);
      const result = await execFileAsync("rg", ["--files", "--hidden", "-g", "!.git"], {
        cwd,
        maxBuffer: MAX_OUTPUT_CHARS * 2,
      });
      return truncate(result.stdout);
    }
    case "search_files": {
      const cwd = await realpath(root);
      const target = stringArg(args.path, ".");
      await safePath(root, target, true);
      const result = await execFileAsync("rg", ["-n", "--hidden", "-g", "!.git", "--", stringArg(args.pattern), target], {
        cwd,
        maxBuffer: MAX_OUTPUT_CHARS * 2,
      }).catch((error: any) => {
        if (error.code === 1) return { stdout: "No matches\n", stderr: "" };
        throw error;
      });
      return truncate(result.stdout);
    }
    case "read_file": {
      const path = await safePath(root, stringArg(args.path), true);
      return truncate(await readFile(path, "utf8"));
    }
    case "write_file": {
      const relativePath = stringArg(args.path);
      const content = stringArg(args.content);
      assertPathNotSensitive(relativePath);
      assertContentHasNoSecrets(content, relativePath);
      const path = await safePathForWrite(root, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      return JSON.stringify({ ok: true, path: relativePath });
    }
    case "replace_in_file": {
      const relativePath = stringArg(args.path);
      assertPathNotSensitive(relativePath);
      const path = await safePath(root, relativePath, true);
      const oldText = stringArg(args.old_text);
      const newText = stringArg(args.new_text);
      assertContentHasNoSecrets(newText, relativePath);
      const source = await readFile(path, "utf8");
      const first = source.indexOf(oldText);
      if (first < 0) throw new Error("old_text was not found");
      if (source.indexOf(oldText, first + oldText.length) >= 0) {
        throw new Error("old_text is not unique; include more context");
      }
      await writeFile(path, source.replace(oldText, newText), "utf8");
      return JSON.stringify({ ok: true, path: relativePath });
    }
    case "run_check": {
      const script = stringArg(args.script);
      if (!/^[\w:-]+$/.test(script)) throw new Error("Invalid script name");
      const packageJson = JSON.parse(await readFile(await safePath(root, "package.json", true), "utf8"));
      if (!packageJson.scripts?.[script]) throw new Error(`Package script does not exist: ${script}`);
      try {
        const result = await execFileAsync("npm", ["run", script], {
          cwd: await realpath(root),
          timeout: 180_000,
          maxBuffer: MAX_OUTPUT_CHARS * 2,
        });
        return JSON.stringify({
          ok: true,
          script,
          output: truncate(`${result.stdout}\n${result.stderr}`),
        });
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        return JSON.stringify({
          ok: false,
          script,
          output: truncate(`${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? "Check failed"}`),
        });
      }
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Validates and safely resolves a relative destination file path for write operations, preventing traversal escape.
 */
export async function safePathForWrite(root: string, relativePath: string): Promise<string> {
  assertPathNotSensitive(relativePath);
  if (isAbsolute(relativePath)) throw new Error("Absolute paths are not allowed");
  const realRoot = await realpath(root);
  const candidate = resolve(realRoot, relativePath);
  const rel = relative(realRoot, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Path escapes the repository root");

  let check = candidate;
  while (true) {
    try {
      const resolved = await realpath(check);
      const resolvedRel = relative(realRoot, resolved);
      if (resolvedRel.startsWith("..") || isAbsolute(resolvedRel)) {
        throw new Error("Path escapes the repository root");
      }
      break;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") throw error;
      const parent = resolve(check, "..");
      if (parent === check || relative(realRoot, parent).startsWith("..")) {
        throw new Error("Path escapes the repository root");
      }
      check = parent;
    }
  }

  return candidate;
}

/**
 * Validates and safely resolves a relative path for reading or directory traversal.
 */
export async function safePath(root: string, relativePath: string, mustExist: boolean): Promise<string> {
  assertPathNotSensitive(relativePath);
  if (isAbsolute(relativePath)) throw new Error("Absolute paths are not allowed");
  const realRoot = await realpath(root);
  const candidate = resolve(realRoot, relativePath);
  const rel = relative(realRoot, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Path escapes the repository root");
  if (mustExist) {
    const resolved = await realpath(candidate);
    const resolvedRel = relative(realRoot, resolved);
    if (resolvedRel.startsWith("..") || isAbsolute(resolvedRel)) throw new Error("Symlink escapes the repository root");
    return resolved;
  }
  const parent = await realpath(resolve(candidate, ".."));
  const parentRel = relative(realRoot, parent);
  if (parentRel.startsWith("..") || isAbsolute(parentRel)) throw new Error("Parent escapes the repository root");
  return candidate;
}

function stringArg(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error("Required string argument is missing");
}

function truncate(value: string): string {
  return value.length <= MAX_OUTPUT_CHARS
    ? value
    : `${value.slice(0, MAX_OUTPUT_CHARS)}\n... output truncated`;
}
