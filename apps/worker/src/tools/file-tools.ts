/**
 * @module tools/file-tools
 * Filesystem and check tool definitions and handlers provided to LLM coding agents.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type OpenAI from "openai";
import { assertContentHasNoSecrets, assertPathNotSensitive } from "./secret-hygiene.js";
import { fetchPublicSource } from "./public-source.js";

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
  tool("verify_file", "Verify that a repository file exists and, optionally, contains exact text. Use this after writing document-only deliverables.", {
    path: { type: "string" },
    contains: { type: "string", description: "Optional exact text that must occur in the file" },
  }, ["path"]),
  tool("inspect_artifact", "Inspect a repository artifact and return bounded metadata and text for supported text/document formats.", {
    path: { type: "string" },
  }, ["path"]),
  tool("run_check", "Run an npm script declared in package.json (e.g. test, build, test:e2e). Returns JSON { ok, script, output }.", {
    script: { type: "string", description: "Script name from package.json scripts" },
  }, ["script"]),
  tool("install_dependencies", "Install dependencies declared by this repository's package.json using npm install. Use after creating or changing package.json in a new project.", {}),
  tool("fetch_public_source", "Read text from an allowlisted primary-source HTTPS page for standards or current technical documentation. Returns the source URL and bounded text; cite the URL in research artifacts.", {
    url: { type: "string", description: "HTTPS URL on an official standards or documentation domain" },
  }, ["url"]),
  tool("request_endpoint", "Request a project endpoint for verification. Only localhost or HTTPS endpoints are allowed.", {
    url: { type: "string" },
    method: { type: "string", enum: ["GET", "HEAD"] },
  }, ["url"]),
  tool("inspect_ui", "Open a project page over localhost or HTTPS and inspect its HTML for UI verification.", {
    url: { type: "string" },
  }, ["url"]),
  tool("inspect_media", "Inspect local document or media metadata without decoding or uploading content.", {
    path: { type: "string" },
  }, ["path"]),
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
      }).catch((error: any) => {
        if (error.code === 1) return { stdout: "No files\n", stderr: "" };
        throw error;
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
    case "verify_file": {
      const relativePath = stringArg(args.path);
      const path = await safePath(root, relativePath, true);
      const source = await readFile(path, "utf8");
      const contains = typeof args.contains === "string" ? args.contains : undefined;
      const ok = contains === undefined || source.includes(contains);
      return JSON.stringify({ ok, path: relativePath, ...(contains === undefined ? {} : { contains }) });
    }
    case "inspect_artifact": {
      const relativePath = stringArg(args.path);
      const path = await safePath(root, relativePath, true);
      const info = await stat(path);
      const extension = relativePath.includes(".") ? relativePath.slice(relativePath.lastIndexOf(".") + 1).toLowerCase() : "";
      const textFormats = new Set(["txt", "md", "json", "csv", "yaml", "yml", "ts", "tsx", "js", "jsx", "css", "html"]);
      const output: Record<string, unknown> = { ok: true, path: relativePath, sizeBytes: info.size, format: extension || "unknown" };
      if (textFormats.has(extension)) output.text = truncate(await readFile(path, "utf8"));
      return JSON.stringify(output);
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
    case "install_dependencies": {
      await safePath(root, "package.json", true);
      try {
        const result = await execFileAsync("npm", ["install", "--no-audit", "--no-fund"], {
          cwd: await realpath(root),
          timeout: 180_000,
          maxBuffer: MAX_OUTPUT_CHARS * 2,
        });
        return JSON.stringify({ ok: true, output: truncate(`${result.stdout}\n${result.stderr}`) });
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        return JSON.stringify({ ok: false, output: truncate(`${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? "Install failed"}`) });
      }
    }
    case "fetch_public_source": {
      return fetchPublicSource(stringArg(args.url));
    }
    case "request_endpoint": {
      const url = new URL(stringArg(args.url));
      if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Endpoint must use HTTPS or target localhost");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(url, { method: args.method === "HEAD" ? "HEAD" : "GET", signal: controller.signal });
        return JSON.stringify({ ok: response.ok, status: response.status, url: url.toString(), output: truncate(await response.text()) });
      } finally { clearTimeout(timer); }
    }
    case "inspect_ui": {
      const url = new URL(stringArg(args.url));
      if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("UI URL must use HTTPS or target localhost");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        const html = await response.text();
        const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
        return JSON.stringify({ ok: response.ok, status: response.status, url: url.toString(), title, html: truncate(html) });
      } finally { clearTimeout(timer); }
    }
    case "inspect_media": {
      const relativePath = stringArg(args.path);
      const path = await safePath(root, relativePath, true);
      const info = await stat(path);
      const format = relativePath.includes(".") ? relativePath.slice(relativePath.lastIndexOf(".") + 1).toLowerCase() : "unknown";
      const supported = new Set(["pdf", "docx", "png", "jpg", "jpeg", "gif", "webp", "wav", "mp3", "ogg", "mp4", "webm"]);
      return JSON.stringify({ ok: true, path: relativePath, format, sizeBytes: info.size, decoderRequired: supported.has(format), verification: supported.has(format) ? "metadata-only" : "unknown-format" });
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
