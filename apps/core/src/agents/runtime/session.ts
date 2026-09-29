import type { AppConfig } from "../../config.js";
import { loadKampakuDefinition } from "../definitions.js";
import type { AgentChatRequest, AgentChatResponse, RunKampakuChatOptions } from "../types.js";
import { createModelBroker } from "../../model-broker/client.js";
import { formatKampakuProviderError } from "../../model-broker/endpoint-errors.js";
import { ContextOverflowError, type ContextTruncation } from "../../model-broker/context-limit.js";
import type { ChatMessage } from "../../model-broker/types.js";
import { ConversationStoreError } from "../../persistence/conversation-store.js";
import { parsePendingQuestion } from "./pending-question.js";
import {
  auditTurnClaims,
  snapshotDurableState,
  type ClaimAuditContext,
  type ClaimFinding,
  type DurableSnapshot,
} from "./claim-audit.js";
import { renderDurableState, renderProjectDetail, snapshotForPrompt } from "./durable-state.js";
import { TurnAccountingBuilder, renderAccounting, type TurnAccounting } from "./turn-accounting.js";
import {
  appendSummaryToSystemPrompt,
  buildHistoryContext,
  maybeCompactConversation,
} from "./compact-history.js";
import type { ChatProgressCallback } from "./progress.js";
import {
  buildStubSystemPrompt,
  isListAgentsRequest,
  isStateInventoryRequest,
  parseSubAgentRequest,
} from "./stub-agent.js";
import { getToolLabel } from "./tool-labels.js";
import {
  boundToolResult,
  clearStaleToolResults,
  duplicateCallNotice,
  TurnToolCalls,
} from "./turn-budget.js";
import {
  executeToolCall,
  type ToolRuntimeScope,
  KAMPAKU_TOOLS,
  type KampakuToolContext,
} from "./tools/index.js";
import { prependGlobalSystemPrompt } from "../../application/settings/global-system-prompt.js";
import { brokerOptionsFor, resolveModelProviderSettings } from "../../application/settings/model-provider.js";

/**
 * How many model calls one front-office turn may make.
 *
 * Ten was chosen when this loop had no clock, and it is now the binding constraint instead of the budget.
 * Measured 2026-09-26 taking suite 07 (run 8, after the turn was made cheap): prompt 1 ended in **50
 * seconds** — and the reason was this cap, not time. The turn made ten model calls, **eight of them
 * `read_repository` on a twelve-file checkout**, and stopped before it could delegate. Runs 4 and 7, with
 * 15- and 60-minute budgets, both ended the same way after 8 calls: the number that has bound every run of
 * this suite is this one, and no budget was ever the binder.
 *
 * The turn's deadline from `AppConfig.turnBudgetMs` is the real bound — it travels into every tool call and
 * every delegated session (F-048, F-051), and it fails closed. A turn that must read, delegate, wait for a
 * lead to preview-approve-apply and then read the plan back cannot do it in ten calls.
 */
/**
 * Exported so the lock on the iteration limit reads the limit instead of restating it.
 *
 * It was **not** exported, and the test that locks this cap kept asserting `10` after the cap was raised to
 * 24 — so `apps/core/tests/agents/agents.test.ts` failed on a clean tree for as long as nobody ran the whole
 * suite, which is how a lock stops being one. A test that restates a number drifts from it; a test that
 * imports it cannot.
 */
export const MAX_TOOL_ITERATIONS = 24;

export class KampakuChatError extends Error {
  constructor(
    message: string,
    readonly code: "PROVIDER_UNAVAILABLE" | "BROKER_ERROR" | "CONVERSATION_NOT_FOUND",
  ) {
    super(message);
    this.name = "KampakuChatError";
  }
}

function resolveConversation(ctx: KampakuToolContext, request: AgentChatRequest) {
  if (request.conversationId) {
    try {
      return ctx.conversationStore.requireConversation(request.conversationId);
    } catch (error) {
      if (error instanceof ConversationStoreError && error.code === "NOT_FOUND") {
        throw new KampakuChatError(error.message, "CONVERSATION_NOT_FOUND");
      }
      throw error;
    }
  }

  return ctx.conversationStore.createConversation({
    agentSlug: "kampaku",
    projectId: request.projectId,
  });
}

async function persistChatTurn(
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  userMessage: string,
  response: AgentChatResponse,
  loopMessages: ChatMessage[],
  onProgress?: ChatProgressCallback,
): Promise<AgentChatResponse> {
  onProgress?.({ phase: "composing" });
  ctx.conversationStore.setTitleIfEmpty(conversationId, userMessage);
  ctx.conversationStore.appendMessage(conversationId, { role: "user", content: userMessage });
  if (loopMessages.length > 0) {
    ctx.conversationStore.appendMessages(conversationId, loopMessages);
  }
  ctx.conversationStore.appendMessage(conversationId, {
    role: "assistant",
    content: response.reply,
  });

  persistEmperorQuestion(ctx, conversationId, response.reply);

  await maybeCompactConversation(ctx, config, conversationId);

  return { ...response, conversationId };
}

/**
 * What the emperor is told when a turn stops at its own budget.
 *
 * It says three things, and each is load-bearing: the numbers (so the turn's cost is visible rather
 * than guessed), that nothing was created or changed by it (so the reply is not read as a partial
 * success), and what to do next (so the operator is not left holding a silence). Measured 2026-09-25:
 * a turn that ran 40 minutes and returned nothing at all left the operator unable to tell a runaway
 * from a hung process, and the CLI's own client gave up at its timeout while Core kept working —
 * BOARD F-048.
 */
export function budgetExhaustedReply(
  budget: { modelCalls: number; elapsedMs: number; budgetMs: number },
  toolsUsed: string[],
  /**
   * What the turn changed in durable state, measured rather than assumed.
   *
   * The reply used to assert flatly that *"nothing was created or changed by this turn — no project, no work
   * item, no repository change"*. Measured 2026-09-25 taking suite 06: the turn that hit the budget had
   * created project `seed-demo`, created the seat `seed-demo-lead`, and written eight files plus a git
   * repository into the checkout the emperor asked to seed — and the reply said none of that had happened.
   * A durable claim that durable state contradicts is the defect this product exists to prevent, and the
   * sentence was added to prevent the opposite error. An unreconciled sentence is not safer than an
   * unreconciled claim.
   *
   * What this cannot see is stated as such rather than denied: the delta knows the durable objects, and a
   * file the turn wrote is on disk where the operator can check it.
   */
  delta?: { createdProjects: string[]; createdAgents: string[]; newWorkItems: number; reposLinked: number },
  /**
   * Where the time actually went, when the caller measured it.
   *
   * This is the half BOARD F-060 asks for and the reply did not have. Measured 2026-09-26 taking suite 07
   * (run 3): a stop that reported *"5 model calls"* over 16 minutes, on an endpoint that answered the same
   * question in 3.1 s when called directly, told the operator nothing about which of the two it had been —
   * and `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS` (120 s) × 8 ≈ the 955 s observed was a candidate explanation the
   * product could neither confirm nor rule out. A stop that cannot distinguish a slow provider from slow work
   * is the silent failure U6 exists to catch, so the numbers are stated when they exist and their absence is
   * stated when they do not.
   */
  accounting?: TurnAccounting,
): string {
  const minutes = (budget.elapsedMs / 60_000).toFixed(1);
  const limit = (budget.budgetMs / 60_000).toFixed(1);
  const did = toolsUsed.length > 0
    ? `It took ${budget.modelCalls} model calls and ${toolsUsed.length} tool calls before stopping.`
    : `It took ${budget.modelCalls} model calls before stopping.`;

  const changed: string[] = [];
  if (delta) {
    if (delta.createdProjects.length > 0) {
      changed.push(`${delta.createdProjects.length} project(s): ${delta.createdProjects.join(", ")}`);
    }
    if (delta.createdAgents.length > 0) {
      changed.push(`${delta.createdAgents.length} agent(s): ${delta.createdAgents.join(", ")}`);
    }
    if (delta.newWorkItems > 0) changed.push(`${delta.newWorkItems} work item(s)`);
    if (delta.reposLinked > 0) {
      changed.push(`${delta.reposLinked} repository link(s) — check the checkout for files this turn wrote`);
    }
  }

  const breakdown = accounting
    ? renderAccounting(accounting)
    : "This turn did not record per-call latency, so it cannot say how the time was split.";

  return [
    `I stopped this turn at its own time budget: ${minutes} of ${limit} minutes. ${did}`,
    "",
    `Where it went: ${breakdown}.`,
    "",
    changed.length > 0
      ? `Durable state changed during this turn: ${changed.join("; ")}. Anything it wrote on disk is there ` +
        "for you to check, and nothing is reported as done — a partly-formed plan is not a plan."
      : "Nothing was created or changed in durable state by this turn, and nothing is reported as done — " +
        "a partly-formed plan is not a plan.",
    "",
    "Tell me to continue if this was the work you wanted, or narrow it first: one project, one outcome, one",
    "deciding question is a turn I can finish.",
  ].join("\n");
}

/**
 * The turn's own footprint, read from the stores rather than from its reply.
 *
 * Only the four durable facts the claim audit already snapshots: projects, generated agents, work items and
 * linked `file://` repositories. It deliberately does not try to see file writes — nothing durable records
 * them, and summarising the transcript would be a description of what the model *said*.
 */
export function turnStateDelta(
  before: DurableSnapshot,
  after: DurableSnapshot,
): { createdProjects: string[]; createdAgents: string[]; newWorkItems: number; reposLinked: number } {
  const added = (previous: string[], now: string[]) => {
    const seen = new Set(previous);
    return now.filter((item) => !seen.has(item));
  };
  return {
    createdProjects: added(before.projects, after.projects),
    createdAgents: added(before.agents, after.agents),
    newWorkItems: Math.max(0, after.workItems - before.workItems),
    reposLinked: added(before.repositoryPaths, after.repositoryPaths).length,
  };
}

/**
 * Turns a `<kampaku-question>` block into a durable pending question.
 *
 * The tag is the documented way the root agent asks the emperor for a decision, but it
 * used to be rendered by the web client and stored nowhere, so a required question was
 * invisible to `questions list` and `GET /api/v1/questions` (LangProbe G-01). Persisting
 * it here makes the human gate answerable from the CLI and the UI.
 *
 * A failure to record the gate must never take down the reply that carries it.
 */
function persistEmperorQuestion(
  ctx: KampakuToolContext,
  conversationId: string,
  reply: string,
): void {
  const pending = parsePendingQuestion(reply);
  if (!pending?.required) return;
  if (!ctx.questionStore) return;

  try {
    const conversation = ctx.conversationStore.requireConversation(conversationId);
    ctx.questionStore.askEmperor({
      askedByAgentId: conversation.agentSlug,
      question: pending.raw,
      questionId: pending.id,
      projectId: conversation.projectId ?? undefined,
    });
  } catch (error) {
    console.error(
      `[chat] could not record pending question "${pending.id}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function runToolWithProgress(
  ctx: KampakuToolContext,
  toolName: string,
  args: string,
  onProgress?: ChatProgressCallback,
  meta?: ToolRuntimeScope,
) {
  onProgress?.({ phase: "tool", tool: toolName, label: getToolLabel(toolName) });
  return executeToolCall(ctx, toolName, args, meta);
}

export async function runKampakuChat(
  ctx: KampakuToolContext,
  config: AppConfig,
  request: AgentChatRequest | string,
  options: RunKampakuChatOptions = {},
): Promise<AgentChatResponse> {
  const chatRequest = typeof request === "string" ? { message: request } : request;
  const message = chatRequest.message.trim();
  const conversation = resolveConversation(ctx, chatRequest);
  const { onProgress } = options;

  onProgress?.({ phase: "thinking" });

  if (config.agentMode === "stub") {
    return runStubChat(ctx, config, conversation.id, message, onProgress);
  }

  return runLlmChat(ctx, config, conversation.id, message, onProgress);
}

async function runStubChat(
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  message: string,
  onProgress?: ChatProgressCallback,
): Promise<AgentChatResponse> {
  if (isListAgentsRequest(message)) {
    const output = await runToolWithProgress(ctx, "list_agents", "{}", onProgress);
    const { agents, tree } = output.output as {
      agents: Array<{ slug: string; name: string; source: string }>;
      tree: string[];
    };
    const lines = agents.map((agent) => `- ${agent.slug} (${agent.source}): ${agent.name}`);
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: `Registered agents:\n${lines.join("\n")}\n\nTree:\n${tree.join("\n")}`,
      toolsUsed: ["list_agents"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  // **Order matters, and this branch goes after the specific one.** `list agents` is an inventory question by
  // shape, and putting the general matcher first swallowed it: the reply became the durable-state block while
  // the web test that asserts the "Registered agents" listing went red. A specific handler produces a better
  // answer than a general one, so it is asked first — the same rule as reading a command before a question.
  //
  // An inventory question is otherwise answered from the stores, rendered rather than composed. The offline
  // mode has the same stores every other surface reads, so there is nothing to guess and no reason to answer
  // with a description of what Kampaku can do instead of what exists.
  if (isStateInventoryRequest(message)) {
    const activeProjectId =
      ctx.conversationStore.requireConversation(conversationId).projectId ?? undefined;
    // The inventory block, and — when the conversation is about one project — its detail as well. The block
    // answers "what exists" and compresses; the detail answers "what is this one" and carries the id, the
    // owner as a slug, and the repository **urls** rather than a count, which is what suite 02 requires of
    // every surface that shows project metadata.
    const detail = activeProjectId ? renderProjectDetail(ctx, activeProjectId) : null;
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [renderDurableState(snapshotForPrompt(ctx, activeProjectId)), detail]
        .filter(Boolean)
        .join("\n\n"),
      toolsUsed: ["get_project", "list_agents"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  const parsed = parseSubAgentRequest(message);
  if (parsed) {
    const result = await runToolWithProgress(
      ctx,
      "create_sub_agent",
      JSON.stringify({
        slug: parsed.slug,
        name: parsed.name,
        responsibilities: parsed.responsibilities,
        system_prompt: buildStubSystemPrompt(parsed.name, parsed.responsibilities),
      }),
      onProgress,
      { agentId: ctx.agentStore.getKampakuAgent().id, conversationId },
    );
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: `Created sub-agent ${parsed.slug} and made it available for delegated work.`,
      toolsUsed: [result.toolName],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  const lower = message.toLowerCase();
  if (
    lower.includes("proyecto") ||
    lower.includes("project") ||
    lower.includes("roadmap") ||
    lower.includes("tarea") ||
    lower.includes("task") ||
    lower.includes("sprint") ||
    lower.includes("deleg")
  ) {
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: "Kampaku can clarify this intent, appoint a responsible project lead, and delegate durable planning and execution through that lead.",
      toolsUsed: [],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  return persistChatTurn(ctx, config, conversationId, message, {
    reply:
      "Got it. I can clarify intent, delegate work through responsible agents, and report verified durable outcomes.",
    agentUsed: "stub",
    conversationId,
  }, [], onProgress);
}

async function runLlmChat(
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  message: string,
  onProgress?: ChatProgressCallback,
): Promise<AgentChatResponse> {
  const provider = resolveModelProviderSettings(ctx.store, config);
  // The front office's turn is execution, not planning: it reads, delegates, and reports, and the plans it
  // opens are made by the planner's own broker at the planner's own budget.
  const broker = createModelBroker(brokerOptionsFor("execution", config, provider));
  // Tracked across the whole turn, because a later iteration can be the one that overflows while an
  // earlier one fit. Reported once, on the reply, so the operator sees the turn was not fully read.
  let truncation: ContextTruncation | undefined;

  const definition = loadKampakuDefinition();
  const agent = ctx.agentStore.getKampakuAgent();
  const orchestratorTools = KAMPAKU_TOOLS.filter((tool) => definition.tools.includes(tool.function.name));
  // The same list, as the **grant** the dispatcher enforces.
  //
  // It used to be advertisement only: the model was offered `orchestratorTools`, and whatever name came
  // back in a tool call was executed. Measured 2026-09-24, a turn that named `update_project` — a tool this
  // role's own contract test forbids it to hold — **rewrote the project's repositories and created and
  // seeded a directory**, and a turn that named `delete_sub_agent` deleted the project lead. See
  // `ToolNotGrantedError` for the measurement and the rule.
  const orchestratorGrant = {
    allowed: new Set(definition.tools),
    label: `the front office's toolset (${definition.tools.length} tools); the line owns the rest`,
  };
  const { summary, messages: history } = buildHistoryContext(ctx.conversationStore, conversationId);
  // The orchestrator carries the operator skills and nothing else. It used to also carry
  // `buildDefaultSkillsPrompt()` — the eleven `workflow-*` fragments, which instruct the reader to call
  // `execute_work_item`, `report_blocker`, `recall`, `propose_wiki_edit` and similar tools that the
  // front office does not hold. See `buildOrchestratorSkillsPrompt` for the measurement.
  const systemPrompt = appendSummaryToSystemPrompt(
    prependGlobalSystemPrompt(
      ctx.store,
      `${definition.systemPrompt}${ctx.skillStore.buildOrchestratorSkillsPrompt()}`,
    ),
    summary,
  );
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    // Ground truth is injected immediately before the turn, AFTER the history, so a stale claim the
    // model made in an earlier reply cannot outrank the current stores. The block states that
    // precedence explicitly. See durable-state.ts for the failure this addresses.
    {
      role: "system",
      content: renderDurableState(
        snapshotForPrompt(ctx, ctx.conversationStore.requireConversation(conversationId).projectId ?? undefined),
      ),
    },
    { role: "user", content: message },
  ];

  const loopMessages: ChatMessage[] = [];
  const toolsUsed: string[] = [];
  // One per user turn. A repeat call inside a turn is not new information, and re-sending an identical
  // result costs its full size for nothing: measured, `list_agents` was called twice with identical
  // arguments for 2 725 duplicated characters. See turn-budget.ts.
  const turnCalls = new TurnToolCalls();
  let model: string | undefined;
  // Durable state is captured around the turn so the reply can be reconciled against what actually
  // changed. A turn with zero tool calls cannot have created anything, whatever its reply says.
  const stateBefore = snapshotDurableState(claimAuditContext(ctx));
  // One clock for the whole turn, and it travels with every tool call so a delegated session spends the
  // same budget rather than starting a fresh one. The per-session iteration cap alone was not a bound: one
  // front-office turn can nest ten delegated sessions of ten iterations each. See `AppConfig.turnBudgetMs`
  // for the measurement (BOARD F-048).
  const turnStartedAt = Date.now();
  const deadlineAt = turnStartedAt + config.turnBudgetMs;
  let modelCalls = 0;
  // Where the time went, per call and per tool, so the reply and the meta line can state it instead of
  // leaving the operator to guess between a slow endpoint and slow work (BOARD F-060).
  const accounting = new TurnAccountingBuilder();
  /**
   * The same numbers, in the shape the response and the CLI already publish.
   *
   * `modelCalls` here is the **total** the turn paid for — its own calls plus every delegated session's —
   * because that is the question an operator asks when a turn ran long. Run 16 reported its own one call
   * and left the delegation's seventeen out, which is the defect this sum closes.
   */
  const turnSpend = (): { snapshot: TurnAccounting; budget: { modelCalls: number; elapsedMs: number; budgetMs: number } } => {
    const snapshot = accounting.finish(turnStartedAt);
    return {
      snapshot,
      budget: {
        modelCalls: snapshot.modelCalls + snapshot.nestedModelCalls,
        // The **measured** elapsed time, not the declared budget.
        //
        // These were the same number until run 19, and therefore always read as a perfect fit: run 19 stopped
        // on a 300 000 ms budget and reported *"5.1 of 5.0 minutes"* while the budget field said `300000` for
        // both sides of that comparison. The budget makes no promise about when the check that enforces it
        // runs — it runs **before** a model call or a tool call, never during one, so a turn always overshoots
        // by whatever the last call took. Reporting the bound instead of the measurement would have hidden the
        // one number the operator needs, on the very turn that demonstrates the overshoot.
        elapsedMs: snapshot.elapsedMs,
        budgetMs: config.turnBudgetMs,
      },
    };
  };

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    // Checked **before** the model call, so a turn with no budget left spends nothing: a budget that stops
    // the work only after paying for one more call is not a budget. The turn then answers honestly rather
    // than hanging, which is what makes the exhaustion visible instead of silent.
    if (Date.now() >= deadlineAt) {
      const spend = turnSpend();
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: budgetExhaustedReply(
          spend.budget,
          toolsUsed,
          turnStateDelta(stateBefore, snapshotDurableState(claimAuditContext(ctx))),
          spend.snapshot,
        ),
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        budgetExhausted: spend.budget,
        accounting: spend.snapshot,
        agentUsed: "llm",
        model,
        conversationId,
      }, loopMessages, onProgress);
    }
    // The cheapest context lever, applied before every model call: older re-fetchable tool results lose
    // their payload and keep their record. Deterministic, no model call, and reversible by asking again.
    // The strongest published evidence for this over summarization is JetBrains' SWE-bench result — see
    // turn-budget.ts.
    const pruning = clearStaleToolResults(messages);
    if (pruning.cleared > 0) {
      onProgress?.({ phase: "pruning", cleared: pruning.cleared, tokensSaved: pruning.tokensSaved });
    }
    let response;
    try {
      modelCalls += 1;
      response = await broker.chatWithTools(messages, orchestratorTools);
      accounting.modelCall({
        latencyMs: response.latencyMs ?? 0,
        attempts: response.attempts ?? 1,
      });
    } catch (error) {
      // A turn that cannot fit is not a provider failure: the endpoint is reachable and the limit was
      // measured. Reporting it as "failed to contact the provider" would send the operator to check a
      // healthy endpoint. Answer the turn with the reason, and leave the conversation usable.
      if (error instanceof ContextOverflowError) {
        return persistChatTurn(ctx, config, conversationId, message, {
          reply: error.message,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
          agentUsed: "llm",
          model,
          conversationId,
        }, loopMessages, onProgress);
      }
      const detail = error instanceof Error ? error.message : String(error);
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: formatKampakuProviderError(detail),
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        agentUsed: "llm",
        model,
        conversationId,
      }, loopMessages, onProgress);
    }

    truncation = response.truncated ?? truncation;
    model = response.model;
    const choice = response.choices[0];
    if (!choice) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: "No response from model.",
        toolsUsed,
        accounting: accounting.finish(turnStartedAt),
        agentUsed: "llm",
        model,
        conversationId,
      }, loopMessages, onProgress);
    }

    const assistantMessage = choice.message;
    if (assistantMessage.tool_calls?.length) {
      const assistantChatMessage = {
        role: "assistant" as const,
        content: assistantMessage.content ?? "",
        tool_calls: assistantMessage.tool_calls,
      };
      messages.push(assistantChatMessage);
      loopMessages.push(assistantChatMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        toolsUsed.push(toolName);
        let toolContent: string;
        if (turnCalls.isRepeat(toolName, toolCall.function.arguments)) {
          // Withheld, not re-executed: the result is already in this turn and re-running it would cost
          // the work again to say the same thing.
          toolContent = duplicateCallNotice(toolName);
        } else {
          const toolStartedAt = Date.now();
          try {
            onProgress?.({ phase: "tool", tool: toolName, label: getToolLabel(toolName) });
            const result = await executeToolCall(
              ctx,
              toolName,
              toolCall.function.arguments,
              {
                agentId: agent.id,
                conversationId,
                projectId: ctx.conversationStore.requireConversation(conversationId).projectId ?? undefined,
                // The turn's own deadline, so a nested session inherits it instead of starting a fresh one.
                deadlineAt,
              },
              orchestratorGrant,
            );
            toolContent = boundToolResult(JSON.stringify({ ok: true, output: result.output }));
            accounting.toolCall({
              name: toolName,
              elapsedMs: Date.now() - toolStartedAt,
              nestedModelCalls: result.usage?.modelCalls,
              nestedElapsedMs: result.usage?.elapsedMs,
            });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            toolContent = JSON.stringify({ ok: false, error: detail });
            accounting.toolCall({ name: toolName, elapsedMs: Date.now() - toolStartedAt });
          }
        }
        const toolChatMessage = {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: toolContent,
        };
        messages.push(toolChatMessage);
        loopMessages.push(toolChatMessage);
      }
      continue;
    }

    const reply = assistantMessage.content?.trim() || "No response.";
    return persistChatTurn(ctx, config, conversationId, message, {
      reply,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
      unverifiedClaims: auditReply(ctx, reply, stateBefore, toolsUsed),
      contextTruncation: truncation,
      accounting: accounting.finish(turnStartedAt),
      agentUsed: "llm",
      model,
      conversationId,
    }, loopMessages, onProgress);
  }

  // The loop ran out of iterations. Everything above this line is a real result; this is not one, and the
  // two are not interchangeable. `synthesizeFinalReply` asks the model for a summary of what it did, which is
  // honest when it answers — and its deterministic fallback says plainly that the turn stopped instead.
  onProgress?.({ phase: "composing" });
  const synthesized = await synthesizeFinalReply(broker, messages, toolsUsed);
  return persistChatTurn(ctx, config, conversationId, message, {
    reply: synthesized.reply,
    toolsUsed,
    unverifiedClaims: auditReply(ctx, synthesized.reply, stateBefore, toolsUsed),
    contextTruncation: synthesized.truncated ?? truncation,
    accounting: accounting.finish(turnStartedAt),
    agentUsed: "llm",
    model,
    conversationId,
  }, loopMessages, onProgress);
}

/**
 * Builds the claim-audit view over the durable stores, and runs one audit.
 */
function claimAuditContext(ctx: KampakuToolContext): ClaimAuditContext {
  return {
    listProjectSlugs: () => ctx.store.listProjects().map((project) => project.slug),
    listGeneratedAgentSlugs: () => ctx.agentStore.listGeneratedAgents().map((a) => a.slug),
    listProjectRepositoryUrls: () =>
      ctx.store
        .listProjects()
        .flatMap((project) => project.repositories.map((repo) => repo.url))
        .filter((url) => url.startsWith("file://")),
    countWorkItems: () => ctx.pmStore.listAllWorkItems().length,
  };
}

function auditReply(
  ctx: KampakuToolContext,
  reply: string,
  before: DurableSnapshot,
  toolsUsed: string[],
): ClaimFinding[] | undefined {
  try {
    const after = snapshotDurableState(claimAuditContext(ctx));
    const findings = auditTurnClaims({ reply, before, after, toolsUsed });
    return findings.length > 0 ? findings : undefined;
  } catch {
    // An audit failure must never take down the reply it was auditing.
    return undefined;
  }
}

async function synthesizeFinalReply(
  broker: ReturnType<typeof createModelBroker>,
  messages: ChatMessage[],
  toolsUsed: string[],
): Promise<{ reply: string; truncated?: ContextTruncation }> {
  messages.push({
    role: "user",
    content:
      "Summarize what you accomplished for the emperor based on the tool results above. Reply in plain text only; do not call any more tools.",
  });

  try {
    const response = await broker.complete(messages);
    const reply = response.content.trim();
    if (reply) {
      return { reply, truncated: response.truncated };
    }
  } catch {
    // Fall through to a deterministic summary. A turn that cannot fit still has to answer.
  }

  const uniqueTools = [...new Set(toolsUsed)];
  // **Not** "Finished": this is the path taken when the turn ran out of its own step budget and the model
  // could not even be reached to summarise. Measured 2026-09-26, third instance of one family: suite 07's
  // run 4 relayed `"Finished 14 tool step(s): read_repository, submit_intent, approve_plan."` to the emperor
  // as a completed planning delegation, for a session that never applied anything (BOARD F-063). The same
  // string lived here, in the front office's own fallback, and was fixed in the delegated session first.
  return {
    reply:
      `Stopped at this turn's own step limit after ${toolsUsed.length} tool call(s) ` +
      `(${uniqueTools.join(", ") || "none"}); no conclusion was reached, and nothing is reported as done. ` +
      "Ask again with a narrower request, or raise the turn's budget and retry.",
  };
}

export type { KampakuToolContext };
