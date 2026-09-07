/**
 * @module tools/freellm-agent
 * Full coding agent loop executing sandboxed filesystem and check tools via FreeLLMAPI.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import type { WorkerConfig } from "../config.js";
import type { JobInput, JobProgressReporter } from "../worker-api/client.js";
import {
  createInitialChatCompletion,
  FREELLMAPI_INITIAL_TIMEOUT_CODE,
  InitialResponseTimeoutError,
  isTimeoutLikeError,
} from "./freellm-chat.js";
import type { JobControl } from "../job-runner/control.js";
import { assertJobContinuing, JobCancelledError, JobPausedError } from "../job-runner/control.js";
import {
  evaluateWorkerCompletion,
  isMutationTool,
  parseToolMutationOk,
} from "./mutation-outcome.js";
import {
  evaluateRequiredChecks,
  recordCheckResult,
  resolveRequiredCheckScripts,
} from "./worker-verification.js";

const execFileAsync = promisify(execFile);
const MAX_ITERATIONS = 30;
const MAX_OUTPUT_CHARS = 40_000;

interface ChatClient {
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<any>;
    };
  };
}

/**
 * Tool definitions exposed to the worker LLM coding agent for file system and test checks.
 */
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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

/** Helper building OpenAI tool definition shapes */
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
 * Result returned by the FreeLLM coding agent executor.
 */
export interface FreeLlmAgentResult {
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  error?: Record<string, unknown>;
}

/**
 * Runs an autonomous LLM coding loop within the target repository sandbox.
 * Inspects files, performs code mutations, runs build/test checks, and reports progress.
 *
 * @param input - Leased job specification.
 * @param sandboxPath - Local path to the isolated sandbox workspace.
 * @param config - Worker configuration.
 * @param suppliedClient - Optional pre-configured chat client for unit testing.
 * @param progress - Real-time progress reporter.
 * @param control - Job lifecycle control checker.
 * @returns Result object containing status, tokens, output, or structured error.
 */
export async function runFreeLlmAgent(
  input: JobInput,
  sandboxPath: string,
  config: WorkerConfig,
  suppliedClient?: ChatClient,
  progress?: JobProgressReporter,
  control?: JobControl,
): Promise<FreeLlmAgentResult> {
  const provider = input.modelProvider ?? {
    baseUrl: config.freellmapiBaseUrl,
    apiKey: config.freellmapiApiKey,
    model: config.agentModel,
  };
  if (!provider.apiKey) {
    return {
      status: "failed",
      output: { executor: "freellmapi" },
      error: { message: "An API key is required for the configured model provider" },
    };
  }

  const client = suppliedClient ?? new OpenAI({
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
  });
  const projectContext = input.project
    ? `\nProject: ${input.project.name} (${input.project.slug}). Work only in this project's repository checkout.`
    : "";
  const messages: any[] = [
    {
      role: "system",
      content: [
        input.globalSystemPrompt,
        "You are Kampaku's coding worker. Implement the requested task in the current repository.",
        "Before editing, read AGENTS.md (if present) and package.json to learn the stack and conventions.",
        "Inspect existing code before editing, keep changes scoped, and run relevant checks.",
        "Use only the provided tools. All paths must be relative to the repository root.",
        "Do not introduce Express, standalone HTTP servers, or frameworks absent from the repository unless explicitly requested.",
        "For Next.js projects, use App Router API routes under app/api/<segment>/route.ts.",
        "Every deliverable must be written with write_file or replace_in_file. Do not finish until required files exist on disk.",
        "Once all required files exist, run every required npm script via run_check (test, build, test:e2e, etc.) and ensure each returns ok:true before finishing.",
        "After required run_check scripts pass, respond with a concise summary and do NOT call more tools.",
        "Avoid exploratory read/list loops after deliverables are written.",
        "When application code changes, run npm run build and npm test via run_check before finishing.",
        "When the work is complete, respond with a concise summary and checks run.",
        projectContext,
      ].filter(Boolean).join("\n\n"),
    },
    { role: "user", content: input.prompt },
  ];
  let promptTokens = 0;
  let completionTokens = 0;
  let failedMutations = 0;
  let successfulMutations = 0;
  let iterationsSinceLastMutation = 0;
  const requiredChecks = resolveRequiredCheckScripts(input.prompt, input.requiredChecks);
  const checkResults = new Map<string, boolean>();

  const log = (line: string) => progress?.log(line);
  log(`Starting code agent in ${input.repositoryRole} repository.`);
  if (input.project) {
    log(`Project: ${input.project.name} (${input.project.slug})`);
  }
  if (input.repositoryPath) {
    log(`Repository checkout: ${input.repositoryPath}`);
  }
  log(`Prompt: ${input.prompt.slice(0, 240)}${input.prompt.length > 240 ? "…" : ""}`);
  if (requiredChecks.length > 0) {
    log(`Required run_check scripts: ${requiredChecks.join(", ")}`);
  }

  function buildUsage(model?: string) {
    return {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  async function autoRunMissingChecks(): Promise<void> {
    for (const script of requiredChecks) {
      if (checkResults.get(script) === true) continue;
      log(`Auto-running required check: ${script}`);
      try {
        const content = await executeTool("run_check", { script }, sandboxPath);
        recordCheckResult(checkResults, content, script);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Check failed";
        checkResults.set(script, false);
        log(`Auto-run ${script} failed: ${message}`);
      }
    }
  }

  async function attemptFinish(finish: {
    summary: string;
    model?: string;
    iterations: number;
    extra?: Record<string, unknown>;
  }): Promise<{
    status: "succeeded" | "failed";
    output: Record<string, unknown>;
    error?: Record<string, unknown>;
  }> {
    const completionFailure = evaluateWorkerCompletion({
      requiresDeliverables: input.requiresDeliverables,
      failedMutations,
      successfulMutations,
    });
    if (completionFailure) {
      log(`Job failed: ${completionFailure.message}`);
      return {
        status: "failed",
        output: {
          summary: finish.summary,
          executor: "freellmapi",
          model: finish.model ?? provider.model,
          iterations: finish.iterations,
          repositoryPath: input.repositoryPath,
          repositoryRole: input.repositoryRole,
          failedMutations,
          successfulMutations,
          requiredChecks,
          checkResults: Object.fromEntries(checkResults),
          usage: buildUsage(finish.model),
          ...finish.extra,
        },
        error: {
          code: completionFailure.code,
          message: completionFailure.message,
          failedMutations,
          successfulMutations,
        },
      };
    }

    await autoRunMissingChecks();

    const checksFailure = evaluateRequiredChecks(requiredChecks, checkResults);
    if (checksFailure) {
      log(`Job failed: ${checksFailure.message}`);
      return {
        status: "failed",
        output: {
          summary: finish.summary,
          executor: "freellmapi",
          model: finish.model ?? provider.model,
          iterations: finish.iterations,
          repositoryPath: input.repositoryPath,
          repositoryRole: input.repositoryRole,
          requiredChecks,
          checkResults: Object.fromEntries(checkResults),
          usage: buildUsage(finish.model),
          ...finish.extra,
        },
        error: {
          code: checksFailure.code,
          message: checksFailure.message,
          requiredChecks,
          checkResults: Object.fromEntries(checkResults),
        },
      };
    }

    return {
      status: "succeeded",
      output: {
        summary: finish.summary,
        executor: "freellmapi",
        model: finish.model ?? provider.model,
        iterations: finish.iterations,
        repositoryPath: input.repositoryPath,
        repositoryRole: input.repositoryRole,
        requiredChecks,
        checkResults: Object.fromEntries(checkResults),
        usage: buildUsage(finish.model),
        ...finish.extra,
      },
    };
  }

  try {
    await assertJobContinuing(control);
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      await assertJobContinuing(control);
      log(`Iteration ${iteration}/${MAX_ITERATIONS}: calling model…`);
      const request = {
        model: provider.model,
        messages,
        tools,
        tool_choice: "auto" as const,
      };
      const chatClient = client as ChatClient;
      const response = (iteration === 1
        ? await createInitialChatCompletion(chatClient, request, {
            timeoutMs: config.freellmapiInitialTimeoutMs,
            maxAttempts: config.freellmapiInitialRetries,
            log,
          })
        : await chatClient.chat.completions.create(request)) as any;
      promptTokens += response.usage?.prompt_tokens ?? 0;
      completionTokens += response.usage?.completion_tokens ?? 0;
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error("FreeLLMApi returned no assistant message");
      messages.push(message);

      if (!message.tool_calls?.length) {
        const summary = message.content ?? "Task completed";
        log(`Model finished: ${summary.slice(0, 500)}${summary.length > 500 ? "…" : ""}`);
        return attemptFinish({
          summary,
          model: response.model ?? provider.model,
          iterations: iteration,
        });
      }

      let mutationThisIteration = false;
      for (const call of message.tool_calls) {
        await assertJobContinuing(control);
        log(`Tool ${call.function.name}(${summarizeToolArgs(call.function.arguments)})`);
        let content: string;
        let checkScript: string | undefined;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          if (call.function.name === "run_check" && typeof args.script === "string") {
            checkScript = args.script;
          }
          content = await executeTool(call.function.name, args, sandboxPath);
        } catch (error) {
          content = JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown tool error",
          });
        }
        log(`Tool ${call.function.name} → ${summarizeToolResult(content)}`);
        if (call.function.name === "run_check") {
          recordCheckResult(checkResults, content, checkScript);
        }
        if (isMutationTool(call.function.name)) {
          const ok = parseToolMutationOk(content);
          if (ok === true) {
            successfulMutations += 1;
            mutationThisIteration = true;
          } else if (ok === false) failedMutations += 1;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }

      if (mutationThisIteration) {
        iterationsSinceLastMutation = 0;
      } else {
        iterationsSinceLastMutation += 1;
      }

      if (successfulMutations > 0 && iterationsSinceLastMutation >= 5) {
        log("Agent stalled after writing files; verifying required checks…");
        return attemptFinish({
          summary: "Agent stalled after writing deliverables.",
          model: provider.model,
          iterations: iteration,
          extra: { stalledAfterDeliverables: true },
        });
      }
    }

    log(`Iteration limit reached (${MAX_ITERATIONS}); verifying deliverables and checks…`);
    return attemptFinish({
      summary: `Task reached iteration limit (${MAX_ITERATIONS}).`,
      model: provider.model,
      iterations: MAX_ITERATIONS,
      extra: { iterationLimitReached: true },
    });
  } catch (error) {
    if (error instanceof JobPausedError) {
      log("Job paused by user.");
      throw error;
    }
    if (error instanceof JobCancelledError) {
      log("Job cancelled by user.");
      throw error;
    }
    if (error instanceof InitialResponseTimeoutError || isTimeoutLikeError(error)) {
      const attempts = config.freellmapiInitialRetries;
      const timeoutMs = config.freellmapiInitialTimeoutMs;
      const message =
        error instanceof Error
          ? error.message
          : `FreeLLMApi did not respond within ${timeoutMs}ms after ${attempts} attempts.`;
      log(`Job failed: ${message}`);
      return {
        status: "failed",
        output: { executor: "freellmapi" },
        error: {
          code: FREELLMAPI_INITIAL_TIMEOUT_CODE,
          message,
          attempts,
          timeoutMs,
        },
      };
    }

    const message = error instanceof Error ? error.message : "Unknown executor error";
    log(`Job failed: ${message}`);
    return {
      status: "failed",
      output: { executor: "freellmapi" },
      error: { message },
    };
  }
}

/**
 * Executes a specific tool requested by the model within the sandbox root.
 */
async function executeTool(name: string, args: Record<string, unknown>, root: string): Promise<string> {
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
      const path = await safePathForWrite(root, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, stringArg(args.content), "utf8");
      return JSON.stringify({ ok: true, path: relativePath });
    }
    case "replace_in_file": {
      const path = await safePath(root, stringArg(args.path), true);
      const oldText = stringArg(args.old_text);
      const source = await readFile(path, "utf8");
      const first = source.indexOf(oldText);
      if (first < 0) throw new Error("old_text was not found");
      if (source.indexOf(oldText, first + oldText.length) >= 0) {
        throw new Error("old_text is not unique; include more context");
      }
      await writeFile(path, source.replace(oldText, stringArg(args.new_text)), "utf8");
      return JSON.stringify({ ok: true, path: stringArg(args.path) });
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
 * Validates and safely resolves a relative destination file path for write operations, ensuring no traversal escape.
 */
async function safePathForWrite(root: string, relativePath: string): Promise<string> {
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
async function safePath(root: string, relativePath: string, mustExist: boolean): Promise<string> {
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

function summarizeToolArgs(raw: string): string {
  try {
    const args = JSON.parse(raw || "{}") as Record<string, unknown>;
    const parts = Object.entries(args)
      .slice(0, 3)
      .map(([key, value]) => {
        const text = typeof value === "string" ? value : JSON.stringify(value);
        const clipped = text.length > 60 ? `${text.slice(0, 60)}…` : text;
        return `${key}=${clipped}`;
      });
    return parts.join(", ") || "—";
  } catch {
    return "—";
  }
}

function summarizeToolResult(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 120) return oneLine;
  return `${oneLine.slice(0, 120)}…`;
}
