/**
 * @module executor/model-agent
 * Provider-agnostic coding-agent loop over an OpenAI-compatible model interface.
 */

import type OpenAI from "openai";
import OpenAIApi from "openai";
import type { WorkerConfig } from "../config.js";
import type { JobInput, JobProgressReporter } from "../worker-api/client.js";
import {
  createInitialChatCompletion,
  MODEL_INITIAL_TIMEOUT_CODE,
  InitialResponseTimeoutError,
  isTimeoutLikeError,
} from "./openai-compatible-chat.js";
import type { JobControl } from "../job-runner/control.js";
import { assertJobContinuing, JobCancelledError, JobPausedError } from "../job-runner/control.js";
import {
  evaluateWorkerCompletion,
  isMutationTool,
  parseToolMutationOk,
} from "../tools/mutation-outcome.js";
import {
  evaluateRequiredChecks,
  recordCheckResult,
  resolveRequiredCheckScripts,
} from "../tools/worker-verification.js";
import {
  WORKER_CODING_TOOLS,
  executeCodingTool,
} from "../tools/file-tools.js";
import { buildWorkerSystemPrompt } from "./worker-system-prompt.js";

const MAX_ITERATIONS = 30;

interface ChatClient {
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<any>;
    };
  };
}

/**
 * Result returned by the model coding-agent executor.
 */
export interface ModelAgentResult {
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  error?: Record<string, unknown>;
}

type EvidenceRecord = {
  subjectType: "behavior" | "artifact";
  format: "code" | "other";
  verificationMethod: "command" | "file-inspection";
  subject: string;
  passed: boolean;
  observedAt: string;
  criterionId?: string;
  sourceTool: string;
  /**
   * Whether the observation came from a mechanism that was executed, as opposed to being asserted.
   *
   * Always true here, and true by construction rather than by confidence: every record in this array is built
   * from the result of a tool that was invoked — a check that ran, a file that was inspected, or an attempt
   * that could not run and returned its own refusal. `passed` carries the outcome, and the two are different
   * questions: a check that ran and failed is `verified: true, passed: false`.
   *
   * It is a required field for a reason. Measured 2026-09-30 (BOARD F-077): the closure gate requires
   * `passed`, `verified` and `reference` on every evidence record, and this producer sent none of `verified`
   * or `reference`, so `evaluateQualityGate` refused every job with *"Evidence is failed, unverified, or
   * unreferenced"* — three jobs, 189 248 tokens, 0 of 8 leaves closed, and each refusal queued another job.
   */
  verified: boolean;
  /**
   * Where to look: the command that was actually run, or the path that was inspected.
   *
   * Resolved from the repository rather than restated, so `make lint` rather than `lint` — the operator can
   * paste it back into a shell. Read by the closure gate and by the objective audit, which reports a passing
   * observation with no reference as `unverified`.
   */
  reference: string;
  /** Bounded tool output that produced this observation. */
  output?: string;
  /** Structured diagnostics, for example the check exit state. */
  diagnostics?: Record<string, unknown>;
};

const MAX_EVIDENCE_OUTPUT_CHARS = 600;

function evidenceOutput(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= MAX_EVIDENCE_OUTPUT_CHARS
    ? trimmed
    : `${trimmed.slice(0, MAX_EVIDENCE_OUTPUT_CHARS)}…`;
}

/**
 * The command a check name resolved to, read back out of the check's own output.
 *
 * `run_check` answers with the repository's declared command (`{"ok":true,"script":"lint","command":"make
 * lint",…}`), which is what a person would paste into a shell and therefore what belongs in a reference. When
 * the output is not JSON — a legacy or failed run — the check name stands as the reference rather than the
 * record losing one.
 */
function resolveCheckReference(script: string, raw: string | undefined): string {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { command?: unknown };
      if (typeof parsed.command === "string" && parsed.command.trim()) return parsed.command.trim();
    } catch {
      // Fall through to the check name: a reference that is less precise is still a reference.
    }
  }
  return script;
}

function buildEvidence(
  checkResults: Map<string, boolean>,
  verificationResults: Array<{ path: string; ok: boolean }>,
  diagnostics: {
    checkOutput: Map<string, string>;
    artifactOutput: Map<string, string>;
    logRef?: string;
  },
): EvidenceRecord[] {
  const observedAt = new Date().toISOString();
  return [
    ...[...checkResults.entries()].map(([subject, passed]) => ({
      subjectType: "behavior" as const,
      format: "code" as const,
      verificationMethod: "command" as const,
      subject,
      passed,
      verified: true,
      reference: resolveCheckReference(subject, diagnostics.checkOutput.get(subject)),
      observedAt,
      criterionId: `check:${subject}`,
      sourceTool: "run_check",
      output: evidenceOutput(diagnostics.checkOutput.get(subject)),
      diagnostics: { script: subject, passed, ...(diagnostics.logRef ? { logRef: diagnostics.logRef } : {}) },
    })),
    ...verificationResults.map(({ path, ok: passed }) => ({
      subjectType: "artifact" as const,
      format: "other" as const,
      verificationMethod: "file-inspection" as const,
      subject: path,
      passed,
      verified: true,
      reference: path,
      observedAt,
      criterionId: `artifact:${path}`,
      sourceTool: "verify_file",
      output: evidenceOutput(diagnostics.artifactOutput.get(path)),
      diagnostics: { path, present: passed, ...(diagnostics.logRef ? { logRef: diagnostics.logRef } : {}) },
    })),
  ];
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
export async function runModelAgent(
  input: JobInput,
  sandboxPath: string,
  config: WorkerConfig,
  suppliedClient?: ChatClient,
  progress?: JobProgressReporter,
  control?: JobControl,
): Promise<ModelAgentResult> {
  // Compatibility for programmatic WorkerConfig callers during the configuration migration.
  // Environment loading always supplies the provider-neutral fields above.
  const legacyConfig = config as WorkerConfig & {
    modelBaseUrl?: string;
    modelApiKey?: string;
    modelInitialTimeoutMs?: number;
    modelInitialRetries?: number;
  };
  const provider = input.modelProvider ?? {
    baseUrl: config.modelBaseUrl ?? legacyConfig.modelBaseUrl,
    apiKey: config.modelApiKey ?? legacyConfig.modelApiKey,
    model: config.agentModel,
  };
  if (!provider.apiKey) {
    return {
      status: "failed",
      output: { executor: "model" },
      error: { message: "An API key is required for the configured model provider" },
    };
  }

  const client = suppliedClient ?? new OpenAIApi({
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
  });
  const projectContext = input.project
    ? `\nProject: ${input.project.name} (${input.project.slug}). Work only in this project's repository checkout.`
    : "";
  const messages: any[] = [
    {
      role: "system",
      content: buildWorkerSystemPrompt({ globalSystemPrompt: input.globalSystemPrompt, projectContext }),
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
  const mutatedPaths = new Set<string>();
  const verificationResults: Array<{ path: string; ok: boolean }> = [];
  const checkOutput = new Map<string, string>();
  const artifactOutput = new Map<string, string>();
  const evidenceDiagnostics = {
    checkOutput,
    artifactOutput,
    logRef: `role:${input.repositoryRole}`,
  };
  const fetchedSourceUrls = new Set<string>();
  // Citation integrity applies to any artifact that cites a source. It is deliberately not a
  // "research deliverable" detector: open-ended research and non-technical documents are out of
  // scope and are refused at intake, so the worker has no research artifact class to gate.
  const citesSources = /\b(cited sources?|citations?|cite (the )?sources?|with sources)\b/i.test(input.prompt);

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
        const content = await executeCodingTool("run_check", { script }, sandboxPath);
        recordCheckResult(checkResults, content, script);
        checkOutput.set(script, content);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Check failed";
        checkResults.set(script, false);
        log(`Auto-run ${script} failed: ${message}`);
      }
    }
  }

  /**
   * Verifies every file the job wrote, so an artifact criterion has evidence at all.
   *
   * This used to return early whenever the work item required a check, on the reasoning that a passing check
   * was evidence enough. It is not: a criterion about the deliverable (`docs/x.md exists and contains …`) is
   * routed to an artifact inspection, and with no artifact record it stayed `missing` and blocked closure no
   * matter how green the checks were. Measured 2026-09-30 (BOARD F-077): the job ran `make check` and
   * `make lint`, both passed, it had written the file, and the criterion-level gate had nothing to read about
   * the file because this returned before it looked.
   */
  async function verifyWrittenDeliverables(): Promise<void> {
    for (const path of mutatedPaths) {
      try {
        const content = await executeCodingTool("verify_file", { path }, sandboxPath);
        const parsed = JSON.parse(content) as { ok?: unknown };
        const ok = parsed.ok === true;
        verificationResults.push({ path, ok });
        artifactOutput.set(path, content);
        log(`Verified deliverable ${path}: ${ok ? "ok" : "failed"}`);
      } catch (error) {
        verificationResults.push({ path, ok: false });
        log(`Verified deliverable ${path}: failed (${error instanceof Error ? error.message : "unknown error"})`);
      }
    }
  }

  async function validateCitationEvidence(): Promise<{ message: string; code: string } | undefined> {
    if (!citesSources) return undefined;
    const minimumSources = /at least three cited sources|three cited sources/i.test(input.prompt) ? 3 : 1;
    if (fetchedSourceUrls.size < minimumSources) {
      return {
        code: "WORKER_CITATIONS_SOURCES_MISSING",
        message: `A cited artifact requires at least ${minimumSources} fetched public source${minimumSources === 1 ? "" : "s"}; found ${fetchedSourceUrls.size}.`,
      };
    }
    const citedUrls = new Set<string>();
    for (const path of mutatedPaths) {
      const content = await executeCodingTool("read_file", { path }, sandboxPath);
      for (const match of content.matchAll(/https:\/\/[^\s)\]}>]+/g)) citedUrls.add(match[0]);
    }
    const unknown = [...citedUrls].filter((url) => !fetchedSourceUrls.has(url));
    if (unknown.length > 0) {
      return {
        code: "WORKER_CITATIONS_UNVERIFIED_CITATION",
        message: `Artifact cited URL(s) not returned by fetch_public_source: ${unknown.join(", ")}`,
      };
    }
    return undefined;
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
          executor: "model",
          model: finish.model ?? provider.model,
          iterations: finish.iterations,
          repositoryPath: input.repositoryPath,
          repositoryRole: input.repositoryRole,
          failedMutations,
          successfulMutations,
          requiredChecks,
          checkResults: Object.fromEntries(checkResults),
          verificationResults,
          filesChanged: [...mutatedPaths],
          evidence: buildEvidence(checkResults, verificationResults, evidenceDiagnostics),
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
    await verifyWrittenDeliverables();

    const citationFailure = await validateCitationEvidence();
    if (citationFailure) {
      log(`Job failed: ${citationFailure.message}`);
      return {
        status: "failed",
        output: {
          summary: finish.summary,
          executor: "model",
          model: finish.model ?? provider.model,
          iterations: finish.iterations,
          repositoryPath: input.repositoryPath,
          repositoryRole: input.repositoryRole,
          requiredChecks,
          checkResults: Object.fromEntries(checkResults),
          verificationResults,
          filesChanged: [...mutatedPaths],
          evidence: buildEvidence(checkResults, verificationResults, evidenceDiagnostics),
          fetchedSourceUrls: [...fetchedSourceUrls],
          usage: buildUsage(finish.model),
          ...finish.extra,
        },
        error: citationFailure,
      };
    }

    const checksFailure = evaluateRequiredChecks(requiredChecks, checkResults);
    if (checksFailure) {
      log(`Job failed: ${checksFailure.message}`);
      return {
        status: "failed",
        output: {
          summary: finish.summary,
          executor: "model",
          model: finish.model ?? provider.model,
          iterations: finish.iterations,
          repositoryPath: input.repositoryPath,
          repositoryRole: input.repositoryRole,
          requiredChecks,
          checkResults: Object.fromEntries(checkResults),
          verificationResults,
          filesChanged: [...mutatedPaths],
          evidence: buildEvidence(checkResults, verificationResults, evidenceDiagnostics),
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
        executor: "model",
        model: finish.model ?? provider.model,
        iterations: finish.iterations,
        repositoryPath: input.repositoryPath,
        repositoryRole: input.repositoryRole,
        requiredChecks,
        checkResults: Object.fromEntries(checkResults),
        verificationResults,
        // The files this job actually created or changed, from the paths its own mutation tools reported as
        // successful — the durable file list a reader uses instead of the summary's prose. It was absent, and
        // measured 2026-09-30 (BOARD F-080) a job that wrote `docs/architecture/cli.md` reported
        // `filesChanged: null`, so the journal's post-action carried `"files": []` and the front office told
        // the operator that nothing had landed on a checkout that had a new file in it.
        filesChanged: [...mutatedPaths],
        evidence: buildEvidence(checkResults, verificationResults, evidenceDiagnostics),
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
        tools: WORKER_CODING_TOOLS,
        tool_choice: "auto" as const,
        // The coding loop carries a plan out; it is not where the plan is made. Sent only when configured, so
        // an endpoint that does not know the field sees the same request it saw before.
        ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
      };
      const chatClient = client as ChatClient;
      const response = (iteration === 1
        ? await createInitialChatCompletion(chatClient, request, {
            timeoutMs: config.modelInitialTimeoutMs ?? legacyConfig.modelInitialTimeoutMs ?? 120_000,
            maxAttempts: config.modelInitialRetries ?? legacyConfig.modelInitialRetries ?? 3,
            log,
          })
        : await chatClient.chat.completions.create(request)) as any;
      promptTokens += response.usage?.prompt_tokens ?? 0;
      completionTokens += response.usage?.completion_tokens ?? 0;
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error("Model endpoint returned no assistant message");
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
        let toolArgs: Record<string, unknown> = {};
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          toolArgs = args;
          const capabilityForTool: Record<string, string> = { run_check: "run_check", verify_file: "inspect_artifact", inspect_artifact: "inspect_artifact", request_endpoint: "request_endpoint", inspect_ui: "inspect_ui", inspect_media: "inspect_media" };
          const requiredCapability = capabilityForTool[call.function.name];
          if (requiredCapability && input.verificationCapabilities && !input.verificationCapabilities.includes(requiredCapability)) {
            throw new Error(`Capability denied by work-item policy: ${requiredCapability}`);
          }
          if (call.function.name === "run_check" && typeof args.script === "string") {
            checkScript = args.script;
          }
          content = await executeCodingTool(call.function.name, args, sandboxPath);
        } catch (error) {
          content = JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown tool error",
          });
        }
        log(`Tool ${call.function.name} → ${summarizeToolResult(content)}`);
        if (call.function.name === "run_check") {
          recordCheckResult(checkResults, content, checkScript);
          if (checkScript) checkOutput.set(checkScript, content);
        }
        if (call.function.name === "verify_file" && typeof toolArgs.path === "string") {
          artifactOutput.set(toolArgs.path, content);
        }
        if (call.function.name === "fetch_public_source") {
          try {
            const parsed = JSON.parse(content) as { url?: unknown };
            if (typeof parsed.url === "string") fetchedSourceUrls.add(parsed.url);
          } catch {
            // Failed source fetches are returned to the model and cannot count as evidence.
          }
        }
        if (isMutationTool(call.function.name)) {
          const ok = parseToolMutationOk(content);
          if (ok === true) {
            successfulMutations += 1;
            mutationThisIteration = true;
            try {
              const parsed = JSON.parse(content) as { path?: unknown };
              if (typeof parsed.path === "string") mutatedPaths.add(parsed.path);
            } catch {
              // A successful mutation is required to return JSON, but preserve the completion outcome if it does not.
            }
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
      const attempts = config.modelInitialRetries ?? legacyConfig.modelInitialRetries ?? 3;
      const timeoutMs = config.modelInitialTimeoutMs ?? legacyConfig.modelInitialTimeoutMs ?? 120_000;
      const message =
        error instanceof Error
          ? error.message
          : `Model endpoint did not respond within ${timeoutMs}ms after ${attempts} attempts.`;
      log(`Job failed: ${message}`);
      return {
        status: "failed",
        output: { executor: "model" },
        error: {
          code: MODEL_INITIAL_TIMEOUT_CODE,
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
      output: { executor: "model" },
      error: { message },
    };
  }
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
