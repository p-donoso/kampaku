import { execFile } from "node:child_process";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import type { WorkerConfig } from "../config.js";
import type { JobInput } from "../worker-api/client.js";

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
  tool("run_check", "Run an existing package script. Only test, typecheck, and build are allowed.", {
    script: { type: "string", enum: ["test", "typecheck", "build"] },
  }, ["script"]),
];

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

export async function runFreeLlmAgent(
  input: JobInput,
  sandboxPath: string,
  config: WorkerConfig,
  suppliedClient?: ChatClient,
): Promise<{
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  error?: Record<string, unknown>;
}> {
  if (!config.freellmapiApiKey) {
    return {
      status: "failed",
      output: { executor: "freellmapi" },
      error: { message: "FREELLMAPI_API_KEY is required when KAMPAKU_EXECUTOR=freellmapi" },
    };
  }

  const client = suppliedClient ?? new OpenAI({
    baseURL: config.freellmapiBaseUrl,
    apiKey: config.freellmapiApiKey,
  });
  const messages: any[] = [
    {
      role: "system",
      content: [
        "You are Kampaku's coding worker. Implement the requested task in the current repository.",
        "Inspect the code before editing, keep changes scoped, and run relevant checks.",
        "Use only the provided tools. All paths must be relative to the repository root.",
        "When the work is complete, respond with a concise summary and tests run.",
      ].join("\n"),
    },
    { role: "user", content: input.prompt },
  ];
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      const response = await client.chat.completions.create({
        model: config.agentModel,
        messages,
        tools,
        tool_choice: "auto",
      });
      promptTokens += response.usage?.prompt_tokens ?? 0;
      completionTokens += response.usage?.completion_tokens ?? 0;
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error("FreeLLMApi returned no assistant message");
      messages.push(message);

      if (!message.tool_calls?.length) {
        return {
          status: "succeeded",
          output: {
            summary: message.content ?? "Task completed",
            executor: "freellmapi",
            model: response.model ?? config.agentModel,
            iterations: iteration,
            usage: {
              inputTokens: promptTokens,
              outputTokens: completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
          },
        };
      }

      for (const call of message.tool_calls) {
        let content: string;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          content = await executeTool(call.function.name, args, sandboxPath);
        } catch (error) {
          content = JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown tool error",
          });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
    }
    throw new Error(`FreeLLMApi agent exceeded ${MAX_ITERATIONS} iterations`);
  } catch (error) {
    return {
      status: "failed",
      output: { executor: "freellmapi" },
      error: { message: error instanceof Error ? error.message : "Unknown executor error" },
    };
  }
}

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
      const path = await safePath(root, stringArg(args.path), false);
      await writeFile(path, stringArg(args.content), "utf8");
      return JSON.stringify({ ok: true, path: stringArg(args.path) });
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
      if (!new Set(["test", "typecheck", "build"]).has(script)) throw new Error("Check is not allowed");
      const packageJson = JSON.parse(await readFile(await safePath(root, "package.json", true), "utf8"));
      if (!packageJson.scripts?.[script]) throw new Error(`Package script does not exist: ${script}`);
      const result = await execFileAsync("npm", ["run", script], {
        cwd: await realpath(root),
        timeout: 180_000,
        maxBuffer: MAX_OUTPUT_CHARS * 2,
      });
      return truncate(`${result.stdout}\n${result.stderr}`);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

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
