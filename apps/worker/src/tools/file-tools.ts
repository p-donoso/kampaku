/**
 * @module tools/file-tools
 * Filesystem and check tool definitions and handlers provided to LLM coding agents.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, realpath, writeFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type OpenAI from "openai";
import { assertContentHasNoSecrets, assertPathNotSensitive } from "./secret-hygiene.js";
import { fetchPublicSource } from "./public-source.js";
import {
  compareImages,
  inspectAudio,
  inspectDataset,
  inspectDocx,
  inspectImageVisual,
  inspectPdf,
  inspectVideo,
  queryDataset,
} from "./deliverable-inspection.js";
import { runBrowserSession } from "./browser-runtime.js";
import { listRepositoryFiles, searchRepositoryFiles } from "./file-search.js";
import {
  discoverProjectToolchain,
  findToolchainCommand,
  runToolchainCommand,
  TOOLCHAIN_MARKERS,
  type ToolchainCommand,
} from "./project-toolchain.js";

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
  tool(
    "run_check",
    "Run one of this repository's own checks and return JSON { ok, script, output }. The check name is toolchain-neutral: test, build, lint, typecheck, or e2e. It resolves to the command the repository itself declares — a package script, `cargo test`, `go test ./...`, `pytest`, `mvn verify`, a Makefile target, and so on. Naming a check the repository does not declare is an error that lists what was found.",
    {
      script: {
        type: "string",
        enum: ["test", "build", "lint", "typecheck", "e2e"],
        description: "Check name, resolved against the repository's own declared commands.",
      },
    },
    ["script"],
  ),
  tool(
    "install_dependencies",
    "Install this repository's declared dependencies using its own package manager (npm, poetry, pip, cargo, go, bundle, composer, mix, dart). Fails with the list of manifests it looked for when the repository declares none.",
    {},
  ),
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
  tool("inspect_document", "Extract text and structure from a PDF or DOCX deliverable so a document criterion can be verified from real content.", {
    path: { type: "string" },
  }, ["path"]),
  tool("inspect_image", "Inspect a PNG or JPEG deliverable: dimensions, ink ratio, and whether the render is blank.", {
    path: { type: "string" },
  }, ["path"]),
  tool("compare_images", "Compare two repository images pixel by pixel and report the changed ratio. Both images must share the same dimensions.", {
    left_path: { type: "string" },
    right_path: { type: "string" },
    threshold: { type: "integer", description: "Per-channel delta counted as a change (default 8)." },
  }, ["left_path", "right_path"]),
  tool("inspect_audio", "Inspect a WAV or MP3 deliverable: duration, codec, channels, sample rate, and bounded signal statistics.", {
    path: { type: "string" },
  }, ["path"]),
  tool("inspect_video", "Inspect an MP4 deliverable: duration, dimensions, and track count.", {
    path: { type: "string" },
  }, ["path"]),
  tool("inspect_dataset", "Inspect a CSV or JSON dataset: rows, schema, null counts, duplicate rows, and invariant violations.", {
    path: { type: "string" },
    format: { type: "string", enum: ["csv", "json"] },
    unique: { type: "array", items: { type: "string" }, description: "Columns that must be unique." },
    non_negative: { type: "array", items: { type: "string" }, description: "Columns that must not contain negative values." },
  }, ["path", "format"]),
  tool("query_dataset", "Filter a CSV or JSON dataset by column equality or numeric bounds and return the matching rows.", {
    path: { type: "string" },
    format: { type: "string", enum: ["csv", "json"] },
    column: { type: "string" },
    equals: { type: "string" },
    min: { type: "number" },
    max: { type: "number" },
    limit: { type: "integer" },
  }, ["path", "format"]),
  tool("run_browser_session", "Drive a browser workflow over localhost or HTTPS: navigate, click, fill, select, press, and wait for elements. Returns per-action outcomes, console errors, and an accessibility snapshot.", {
    url: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["click", "fill", "press", "select", "waitFor", "goto"] },
          selector: { type: "string" },
          by: { type: "string", enum: ["css", "text", "role"] },
          role: { type: "string" },
          value: { type: "string" },
          url: { type: "string" },
        },
        required: ["type"],
      },
    },
    screenshot_path: { type: "string" },
  }, ["url"]),
];

/**
 * Resolves a check name against the commands this repository actually declares.
 *
 * Order matters. A package script wins when it exists, because that is the project's own entry
 * point; otherwise the discovered toolchain answers. When neither does, the error lists the
 * profiles and near misses, so the caller learns what was found rather than being told a default
 * command it cannot run.
 */
async function resolveCheckCommand(root: string, script: string): Promise<ToolchainCommand> {
  const toolchain = await discoverProjectToolchain(root);
  const declared = findToolchainCommand(toolchain, script);
  if (declared) return declared;

  const profiles = toolchain.profiles.map((profile) => `${profile.id} (${profile.evidence.join(", ")})`);
  const nearMiss = toolchain.nearMisses.find((miss) => miss.name === script);
  const found = profiles.length > 0 ? `Discovered toolchains: ${profiles.join("; ")}.` : `No toolchain marker found among: ${TOOLCHAIN_MARKERS.join(", ")}.`;
  const reason = nearMiss ? ` ${nearMiss.reason}.` : "";
  throw new Error(`This repository declares no "${script}" check.${reason} ${found}`);
}

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
  options: {
    frozenPaths?: readonly string[];
    declaredPaths?: readonly string[];
    readOnly?: boolean;
    protectedPaths?: readonly string[];
  } = {},
): Promise<string> {
  const frozenPaths = options.frozenPaths ?? [];
  const declaredPaths = options.declaredPaths;
  const readOnly = options.readOnly === true;
  const protectedPaths = options.protectedPaths ?? [];
  switch (name) {
    case "list_files": {
      const cwd = await safePath(root, stringArg(args.path, "."), true);
      return truncate(await listRepositoryFiles(await realpath(root), cwd, MAX_OUTPUT_CHARS));
    }
    case "search_files": {
      const target = stringArg(args.path, ".");
      await safePath(root, target, true);
      return truncate(
        await searchRepositoryFiles(await realpath(root), {
          path: target,
          pattern: stringArg(args.pattern),
          maxOutputChars: MAX_OUTPUT_CHARS,
        }),
      );
    }
    case "read_file": {
      const path = await safePath(root, stringArg(args.path), true);
      return truncate(await readFile(path, "utf8"));
    }
    case "write_file": {
      const relativePath = stringArg(args.path);
      const content = stringArg(args.content);
      assertJobMayWrite(relativePath, readOnly);
      assertPathNotProtected(relativePath, protectedPaths, declaredPaths);
      assertPathNotSensitive(relativePath);
      assertPathNotFrozen(relativePath, frozenPaths);
      assertContentHasNoSecrets(content, relativePath);
      const path = await safePathForWrite(root, relativePath);
      // A **new** file at the root of somebody else's checkout is the one place a job must have been asked.
      // Measured 2026-11-05 on suite 19 (`s19r1`/`s19r2`): a job diagnosed a legacy repository and left
      // `report-slice1-parse-comments.md` and `triage-824ca55d.md` beside its `README.rst`, in a checkout whose
      // `CONTRIBUTING.md` says nothing may be moved between directories — while its own reply told the emperor
      // "no file has been added". Suite 19's first oracle bullet is that any created file is justified by the
      // request; a job's report belongs to its record, not to the repository it was asked to repair.
      await assertReportPathDeclared(root, relativePath, declaredPaths);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      return JSON.stringify({ ok: true, path: relativePath });
    }
    case "replace_in_file": {
      const relativePath = stringArg(args.path);
      assertJobMayWrite(relativePath, readOnly);
      assertPathNotProtected(relativePath, protectedPaths, declaredPaths);
      assertPathNotSensitive(relativePath);
      assertPathNotFrozen(relativePath, frozenPaths);
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
      // A name is a neutral name (`test`, `lint`) or the relative path of a check the repository declares as a
      // file its own runner enumerates (`checks/test_parse.py`). Nothing else resolves: `resolveCheckCommand`
      // answers only from the declarations, so this pattern widens the syntax, never the authority.
      if (!/^[\w:.@-]+(?:\/[\w:.@-]+)*$/.test(script)) throw new Error("Invalid script name");
      const command = await resolveCheckCommand(root, script);
      const result = await runToolchainCommand(await realpath(root), command);
      return JSON.stringify({
        ok: result.ok,
        script,
        // The evidence travels with the result so a reader can see why this command, not another.
        evidence: command.evidence,
        command: [command.command, ...command.args].join(" "),
        output: truncate(result.output),
      });
    }
    case "install_dependencies": {
      const toolchain = await discoverProjectToolchain(root);
      const install = findToolchainCommand(toolchain, "install");
      if (!install) {
        // Fail closed and name what was searched for: this is a Python/Rust/Go checkout, not a
        // broken Node one, and inventing `npm install` here is the defect this replaces.
        throw new Error(
          `This repository declares no dependency manifest this tool can install from. Looked for: ${TOOLCHAIN_MARKERS.join(", ")}.`,
        );
      }
      const result = await runToolchainCommand(await realpath(root), install);
      return JSON.stringify({
        ok: result.ok,
        command: [install.command, ...install.args].join(" "),
        evidence: install.evidence,
        output: truncate(result.output),
      });
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
    case "inspect_document": {
      const relativePath = stringArg(args.path);
      const path = await safePath(root, relativePath, true);
      const extension = relativePath.slice(relativePath.lastIndexOf(".") + 1).toLowerCase();
      if (extension === "pdf") return JSON.stringify({ ok: true, path: relativePath, ...inspectPdf(await readFile(path)) });
      if (extension === "docx") return JSON.stringify({ ok: true, path: relativePath, ...inspectDocx(await readFile(path)) });
      throw new Error(`inspect_document supports pdf and docx, received ${extension || "no extension"}`);
    }
    case "inspect_image": {
      const relativePath = stringArg(args.path);
      const path = await safePath(root, relativePath, true);
      return JSON.stringify({ ok: true, path: relativePath, ...inspectImageVisual(await readFile(path)) });
    }
    case "compare_images": {
      const leftPath = stringArg(args.left_path);
      const rightPath = stringArg(args.right_path);
      const threshold = typeof args.threshold === "number" ? args.threshold : 8;
      const comparison = compareImages(
        await readFile(await safePath(root, leftPath, true)),
        await readFile(await safePath(root, rightPath, true)),
        threshold,
      );
      return JSON.stringify({ ok: true, left: leftPath, right: rightPath, ...comparison });
    }
    case "inspect_audio": {
      const relativePath = stringArg(args.path);
      const path = await safePath(root, relativePath, true);
      return JSON.stringify({ ok: true, path: relativePath, ...inspectAudio(await readFile(path)) });
    }
    case "inspect_video": {
      const relativePath = stringArg(args.path);
      const path = await safePath(root, relativePath, true);
      return JSON.stringify({ ok: true, path: relativePath, ...inspectVideo(await readFile(path)) });
    }
    case "inspect_dataset": {
      const relativePath = stringArg(args.path);
      const format = stringArg(args.format) === "json" ? "json" as const : "csv" as const;
      const path = await safePath(root, relativePath, true);
      const unique = Array.isArray(args.unique) ? args.unique.filter((entry): entry is string => typeof entry === "string") : [];
      const nonNegative = Array.isArray(args.non_negative) ? args.non_negative.filter((entry): entry is string => typeof entry === "string") : [];
      const inspection = inspectDataset(format, await readFile(path, "utf8"), { unique, nonNegative });
      return JSON.stringify({ ok: inspection.invariantViolations.length === 0, path: relativePath, ...inspection });
    }
    case "query_dataset": {
      const relativePath = stringArg(args.path);
      const format = stringArg(args.format) === "json" ? "json" as const : "csv" as const;
      const path = await safePath(root, relativePath, true);
      const result = queryDataset(format, await readFile(path, "utf8"), {
        column: typeof args.column === "string" ? args.column : undefined,
        equals: typeof args.equals === "string" ? args.equals : undefined,
        min: typeof args.min === "number" ? args.min : undefined,
        max: typeof args.max === "number" ? args.max : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      return JSON.stringify({ ok: true, path: relativePath, ...result });
    }
    case "run_browser_session": {
      const url = stringArg(args.url);
      const actions = Array.isArray(args.actions) ? (args.actions as never[]) : [];
      const screenshotPath = typeof args.screenshot_path === "string"
        ? await safePathForWrite(root, args.screenshot_path)
        : undefined;
      const session = await runBrowserSession(url, actions, { screenshotPath });
      const failed = session.actions.filter((action) => !action.ok);
      return JSON.stringify({
        ok: failed.length === 0 && session.consoleErrors.length === 0,
        ...session,
        screenshotPath: screenshotPath ? stringArg(args.screenshot_path) : undefined,
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Refuses a write to a path the plan froze.
 *
 * The freeze reaches the worker in the job input, derived on Core's side from the plan's own words
 * (`deriveFrozenPaths`) or declared by the planner — never inferred here. This is the *boundary* half of the
 * rule: the file is not written, so there is nothing to notice, report, or review, and no model turn is spent
 * re-reading the constraint.
 *
 * Measured 2026-10-04 on suite 08's fourth re-run (BOARD F-098, F-099): a plan froze two files in prose, the
 * splitter read that sentence as a deliverable list and handed the slice those two files as its touch scope,
 * and the job resolved a failing check by editing one of them back — `make check` went green and the platform
 * reported success. The refusal below is what that run was missing.
 *
 * The message names the rule and the alternative rather than only refusing, because a refusal a model cannot
 * act on costs the turns it takes to discover that retrying does not help.
 */
export function assertPathNotFrozen(relativePath: string, frozenPaths: readonly string[]): void {
  if (frozenPaths.length === 0) return;
  const normalized = relativePath.replace(/^\.\//, "").trim();
  const frozen = frozenPaths.find((path) => path.replace(/^\.\//, "").trim() === normalized);
  if (!frozen) return;
  throw new Error(
    `The plan freezes ${frozen}: it must not be modified by this job. Change the files this work item names ` +
      `instead of this one, and if the frozen file genuinely needs to change, report that as a blocker rather ` +
      `than editing it.`,
  );
}

/**
 * Refuses **every** write for a job whose work item is evidence-only, before any path or shape check.
 *
 * This is the other half of the deliverables exemption, and it is the half that was missing. Measured
 * 2026-11-08 on suite 19 run `s19r6` (BOARD F-093): an audit leaf whose own description read *"Independent
 * verification only - make NO source edits"* was exempted from the deliverables rule, ran the checks, recorded
 * them green — and then succeeded by writing `packages/orders/test/by-status.audit.md` into the checkout. The
 * reader of that reply was told the repository was untouched. A job asked to observe has to be refused, not
 * trusted, and the refusal names where its report belongs so it can act on it: the job's own summary.
 *
 * Deliberately the first check in both write tools and deliberately unconditional: a path inside a directory the
 * work item works in is exactly the shape the measurement had.
 */
export function assertJobMayWrite(relativePath: string, readOnly: boolean): void {
  if (!readOnly) return;
  throw new Error(
    `This job is read-only: its work item asks for observation and verification, so it may not write ` +
      `${relativePath || "any file"}. Record the evidence in your summary instead; every check it names is ` +
      `recorded from run_check already.`,
  );
}

/**
 * Refuses a write to a file the checkout runs as one of its own checks.
 *
 * **Existing tests win.** That is suite 19's second oracle bullet, and until now it was a rule in the suite rather
 * than in the runtime. Measured 2026-11-08 on run `s19r7`: asked to repair `parse_lines` in a legacy checkout whose
 * checks are `checks/test_parse.py` and `checks/test_totals.py`, a job edited **`checks/test_parse.py`** — adding an
 * indented-comment case and rewording the assertion message — which makes the check agree with the new code instead
 * of the code satisfying the check. The step then reported success.
 *
 * The protected set is the checkout's own: the files its runner enumerates and the runner itself, read from disk at
 * dispatch (`project-toolchain.ts`). A work item that genuinely has to change a check names it, and naming it in
 * the item's own text is what `declaredPaths` carries — so the refusal is "name it or leave it", never a blanket ban
 * that would make a test-repair task impossible.
 */
export function assertPathNotProtected(
  relativePath: string,
  protectedPaths: readonly string[],
  declaredPaths: readonly string[] | undefined,
): void {
  if (protectedPaths.length === 0) return;
  const normalized = relativePath.replace(/^\.\//, "").trim();
  if (!protectedPaths.includes(normalized)) return;
  if (declaredPaths?.some((declared) => declared.replace(/^\.\//, "").trim() === normalized)) return;
  throw new Error(
    `This job may not modify ${normalized}: it is one of this checkout's own checks. Existing tests win — ` +
      `change the source the check exercises instead of the check. If the check itself is the work, name it in the ` +
      `work item and it becomes writable.`,
  );
}

/**
 * Refuses a **new** entry at the repository root that no text of the work item names.
 *
 * The scope of this refusal is deliberately narrow, because a refusal that is too wide costs legitimate work:
 * it applies to a top-level entry (a file, or the first directory of a path) that does not exist yet, and only
 * when the caller states the paths the work item named. Everything else — editing an existing file, writing
 * inside a top level that already exists — is left to the freeze list and to the scope the plan states.
 *
 * Both shapes were measured on suite 19's legacy scenario within one run: a job first left
 * `report-slice1-parse-comments.md` and `triage-824ca55d.md` at the root, and after the file half was refused it
 * created a **directory** — `journal/` — and wrote its notes there. The defect is the top-level entry, not the
 * file, so the rule is about the entry.
 *
 * `declaredPaths === undefined` means the caller did not state them, and a job that states nothing is not
 * refused on a guess.
 */
export async function assertReportPathDeclared(
  root: string,
  relativePath: string,
  declaredPaths: readonly string[] | undefined,
): Promise<void> {
  if (declaredPaths === undefined) return;
  // A work item that names no path has no boundary to hold this write to, and inventing one is how a greenfield
  // task ("create the CI workflow") gets refused its first file. The rule bites where the measurement was: an item
  // that names its files, and an artifact landing somewhere none of them lives.
  if (declaredPaths.length === 0) return;
  const normalized = relativePath.replace(/^\.\//, "").trim();
  const firstSegment = normalized.split("/")[0];
  if (!firstSegment) return;
  // Nothing to preserve: an empty checkout is one this job is creating, and a rule that protects a layout nobody
  // wrote would refuse the first file of a greenfield task (`Create CI workflow` in an empty directory).
  try {
    if ((await readdir(root)).length === 0) return;
  } catch {
    return;
  }
  try {
    await stat(join(root, firstSegment));
    return; // an existing top-level entry is not an addition to somebody else's layout
  } catch {
    // absent: this is the case the rule is about
  }
  const declared = declaredPaths.map((path) => path.replace(/^\.\//, "").trim().split("/")[0]);
  if (declared.includes(firstSegment)) return;
  const named = declaredPaths.length > 0 ? declaredPaths.join(", ") : "none";
  throw new Error(
    `This job may not add a new top-level entry "${firstSegment}" to this checkout: the work item names no ` +
      `such path (${named}). Record the report in your summary instead, or write it under one of those paths.`,
  );
}

/**
 * Validates and safely resolves a relative destination file path for write operations, preventing traversal escape.
 */
export async function safePathForWrite(root: string, relativePath: string): Promise<string> {
  assertPathNotSensitive(relativePath);
  const realRoot = await realpath(root);
  if (isAbsolute(relativePath)) throw outsideBoundary(relativePath, realRoot);
  const candidate = resolve(realRoot, relativePath);
  const rel = relative(realRoot, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) throw outsideBoundary(relativePath, realRoot);

  let check = candidate;
  while (true) {
    try {
      const resolved = await realpath(check);
      const resolvedRel = relative(realRoot, resolved);
      if (resolvedRel.startsWith("..") || isAbsolute(resolvedRel)) {
        throw outsideBoundary(relativePath, realRoot);
      }
      break;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") throw error;
      const parent = resolve(check, "..");
      if (parent === check || relative(realRoot, parent).startsWith("..")) {
        throw outsideBoundary(relativePath, realRoot);
      }
      check = parent;
    }
  }

  return candidate;
}

/**
 * The refusal a path outside the job's own root earns, naming the boundary instead of saying "denied".
 *
 * One wording for `..`, an absolute path, a symlink and a relative path that resolves out, because the resolved
 * comparison is what refuses them and an operator should not have to learn four sentences for one rule. Suite 14's
 * oracle asks for exactly this: the refusal must name the boundary, so the operator knows what to change.
 */
function outsideBoundary(relativePath: string, root: string): Error {
  return new Error(
    `Refusing ${relativePath}: the boundary is this job's own checkout (${root}). A job writes inside the ` +
      "repository it was leased for and nowhere else — the host, the home directory, system paths and every " +
      "other project are outside it, including through `..`, an absolute path, or a symlink.",
  );
}

/**
 * Validates and safely resolves a relative path for reading or directory traversal.
 */
export async function safePath(root: string, relativePath: string, mustExist: boolean): Promise<string> {
  assertPathNotSensitive(relativePath);
  const realRoot = await realpath(root);
  if (isAbsolute(relativePath)) throw outsideBoundary(relativePath, realRoot);
  const candidate = resolve(realRoot, relativePath);
  const rel = relative(realRoot, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) throw outsideBoundary(relativePath, realRoot);
  if (mustExist) {
    const resolved = await realpath(candidate);
    const resolvedRel = relative(realRoot, resolved);
    if (resolvedRel.startsWith("..") || isAbsolute(resolvedRel)) throw outsideBoundary(relativePath, realRoot);
    return resolved;
  }
  const parent = await realpath(resolve(candidate, ".."));
  const parentRel = relative(realRoot, parent);
  if (parentRel.startsWith("..") || isAbsolute(parentRel)) throw outsideBoundary(relativePath, realRoot);
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
