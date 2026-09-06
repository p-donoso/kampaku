import type { AppConfig } from "../../config.js";
import { loadKampakuDefinition } from "../definitions.js";
import type { AgentChatRequest, AgentChatResponse, RunKampakuChatOptions } from "../types.js";
import { createModelBroker } from "../../model-broker/client.js";
import { formatKampakuProviderError } from "../../model-broker/freellmapi-errors.js";
import type { ChatMessage } from "../../model-broker/types.js";
import { ConversationStoreError } from "../../persistence/conversation-store.js";
import {
  appendSummaryToSystemPrompt,
  buildHistoryContext,
  maybeCompactConversation,
} from "./compact-history.js";
import type { ChatProgressCallback } from "./progress.js";
import {
  isListAgentsRequest,
  parseSubAgentRequest,
} from "./stub-agent.js";
import { getToolLabel } from "./tool-labels.js";
import {
  executeToolCall,
  type ToolRuntimeScope,
  KAMPAKU_TOOLS,
  type KampakuToolContext,
} from "./tools/index.js";
import { prependGlobalSystemPrompt } from "../../application/settings/global-system-prompt.js";
import { resolveModelProviderSettings } from "../../application/settings/model-provider.js";

const MAX_TOOL_ITERATIONS = 10;
const CHAT_TURN_DEADLINE_MS = 120_000;
// FreeLLMAPI may traverse fallback providers for tool-heavy prompts. Keep the
// per-call budget aligned with the worker instead of failing healthy requests
// after a short local timeout.
const MODEL_CALL_TIMEOUT_MS = 120_000;

async function withModelTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Model provider request timed out.")), MODEL_CALL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
      const existing = ctx.conversationStore.requireConversation(request.conversationId);
      ctx.conversationStore.setTitleIfEmpty(existing.id, request.message);
      return existing;
    } catch (error) {
      if (error instanceof ConversationStoreError && error.code === "NOT_FOUND") {
        throw new KampakuChatError(error.message, "CONVERSATION_NOT_FOUND");
      }
      throw error;
    }
  }

  const created = ctx.conversationStore.createConversation({
    agentSlug: "kampaku",
    projectId: request.projectId,
  });
  ctx.conversationStore.setTitleIfEmpty(created.id, request.message);
  return created;
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
  if (loopMessages.length > 0) {
    ctx.conversationStore.appendMessages(conversationId, loopMessages);
  }
  ctx.conversationStore.appendMessage(conversationId, {
    role: "assistant",
    content: response.reply,
  });

  const questionMatch = response.reply.match(/<kampaku-question>\s*([\s\S]*?)\s*<\/kampaku-question>/i);
  if (questionMatch && ctx.questionStore) {
    try {
      const parsed = JSON.parse(questionMatch[1]) as { prompt?: string; id?: string };
      if (parsed.prompt?.trim()) {
        const conversation = ctx.conversationStore.requireConversation(conversationId);
        const marker = `conversation_id: ${conversationId}; question_id: ${parsed.id ?? "unknown"}`;
        const duplicate = ctx.questionStore.listPending().some((item) => item.context?.includes(marker));
        if (!duplicate) {
          ctx.questionStore.askDirect({
            askedByAgentId: "kampaku",
            question: questionMatch[0],
            context: `${marker}\nThis question was emitted by the Kampaku chat and can be answered with the questions command or Dashboard.\n${planApprovalContext(ctx, questionMatch[0])}`,
            projectId: conversation.projectId ?? undefined,
          });
        }
      }
    } catch {
      // Keep chat responses available even if a malformed question tag is emitted.
    }
  }

  await maybeCompactConversation(ctx, config, conversationId);

  return { ...response, conversationId };
}

function planApprovalContext(ctx: KampakuToolContext, question: string): string {
  const reference = question.match(/plan-[a-f0-9-]+/i)?.[0];
  if (!reference) return "";
  const preview = ctx.store.getPlanPreview(reference);
  if (!preview) return "plan_preview_status: not_found";
  const items = preview.plan.work_items.map((item) => `- ${item.title} [${item.assignee_slug ?? "unassigned"}]`).join("\n");
  return `plan_preview_status: available\napproval_reference: ${reference}\nproject_slug: ${preview.projectSlug}\nplan_fingerprint: ${preview.planFingerprint}\nplan_content_hash: ${preview.planContentHash}\nplan_name: ${preview.plan.project?.name ?? preview.projectSlug}\nplanned_work_items:\n${items}`;
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
  if (options.persistUserMessage !== false) {
    ctx.conversationStore.appendMessage(conversation.id, { role: "user", content: message });
  }

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
  const lower = message.toLowerCase();

  if (
    lower.includes("are we ready") ||
    (lower.includes("what exists") && lower.includes("do not change"))
  ) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const agentsOutput = await runToolWithProgress(ctx, "list_agents", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ slug: string; name: string }>;
    };
    const { agents, tree } = agentsOutput.output as {
      agents: Array<{ slug: string; name: string; source: string }>;
      tree: string[];
    };
    const projectLines = projects.map((project) => `- **${project.name}** (slug: \`${project.slug}\`)`);
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Current State Overview",
        "",
        "### Projects",
        ...(projectLines.length > 0 ? projectLines : ["- No projects."]),
        "",
        "### Team",
        "```",
        ...tree,
        "```",
        "",
        "### Open Work",
        "- No open work items were requested for mutation; this is a read-only inspection.",
        "",
        "No changes have been made.",
      ].join("\n"),
      toolsUsed: ["list_projects", "list_agents"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (
    (lower.includes("must decide") || lower.includes("first run")) &&
    lower.includes("do not create")
  ) {
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "Before a first run, decide the project identity and whether to seed a standing team.",
        "",
        "<kampaku-question>",
        JSON.stringify({
          id: "first-run-setup",
          type: "text",
          prompt: "Please provide the project slug, repository URL, and indicate whether you want the default six-role team created automatically (yes/no).",
          placeholder: "e.g., my-project, https://github.com/user/my-project.git, yes",
          required: true,
        }),
        "</kampaku-question>",
      ].join("\n"),
      toolsUsed: [],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (
    (lower.includes("standing team") ||
      (lower.includes("team") && lower.includes("lead") && lower.includes("specialist")) ||
      (lower.includes("eval-team-demo") && lower.includes("team"))) &&
    (lower.includes("do not start coding") || lower.includes("don't start coding") || lower.includes("do not start"))
  ) {
    const slugMatch = message.match(/\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/i);
    const projectSlug = slugMatch?.[1]?.toLowerCase().includes("eval-team")
      ? slugMatch[1].toLowerCase()
      : "eval-team-demo";
    const kampaku = ctx.agentStore.getKampakuAgent();
    const staffed = await runToolWithProgress(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: projectSlug,
        project_name: titleCaseStub(projectSlug),
        specialist_roles: ["frontend", "backend", "qa"],
      }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const output = staffed.output as {
      project: { id: string; slug: string; projectLeadSlug: string };
      tree: string[];
      workItemsCreated: number;
      jobsStarted: number;
    };
    const agentsOutput = await runToolWithProgress(ctx, "list_agents", "{}", onProgress);
    const { tree } = agentsOutput.output as { tree: string[] };
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Standing team ready",
        "",
        `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
        `- **lead**: \`${output.project.projectLeadSlug}\``,
        "",
        "### Hierarchy",
        "```",
        ...(output.tree.length > 0 ? output.tree : tree),
        "```",
        "",
        `No coding started. Work items created: ${output.workItemsCreated}. Jobs started: ${output.jobsStarted}.`,
      ].join("\n"),
      toolsUsed: ["staff_project_team", "list_agents"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (
    lower.includes("eval-surface-marker") &&
    (lower.includes("set") || lower.includes("note") || lower.includes("display name") || lower.includes("description"))
  ) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ id: string; slug: string; name: string }>;
    };
    const target = projects.find((project) => project.slug === "kampaku") ?? projects[0];
    if (!target) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: "No project exists yet. Create or bootstrap one before setting EVAL-SURFACE-MARKER.",
        toolsUsed: ["list_projects"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }

    const kampaku = ctx.agentStore.getKampakuAgent();
    const updateOutput = await runToolWithProgress(
      ctx,
      "update_project",
      JSON.stringify({
        project_slug_or_id: target.slug,
        description: "EVAL-SURFACE-MARKER",
      }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const updated = updateOutput.output as {
      id: string;
      slug: string;
      name: string;
      description: string | null;
    };
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Surface marker applied",
        "",
        `- **id**: \`${updated.id}\``,
        `- **slug**: \`${updated.slug}\``,
        `- **name**: ${updated.name}`,
        `- **description**: ${updated.description}`,
        "",
        "Same entity should now match on CLI (`kampaku projects show`) and the web projects panel.",
      ].join("\n"),
      toolsUsed: ["list_projects", "update_project"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (
    lower.includes("eval-surface-marker") ||
    (lower.includes("confirm") && lower.includes("marker")) ||
    (lower.includes("current") && lower.includes("description") && lower.includes("project"))
  ) {
    const projectOutput = await runToolWithProgress(
      ctx,
      "get_project",
      JSON.stringify({ project_slug_or_id: "kampaku" }),
      onProgress,
    );
    const project = (projectOutput.output as { project?: { id?: string; slug?: string; name?: string; description?: string | null } })
      ?.project;
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Project surface check",
        "",
        `- **id**: \`${project?.id ?? "unknown"}\``,
        `- **slug**: \`${project?.slug ?? "kampaku"}\``,
        `- **name**: ${project?.name ?? "Kampaku"}`,
        `- **description**: ${project?.description ?? "(none)"}`,
      ].join("\n"),
      toolsUsed: ["get_project"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

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

  const parsed = parseSubAgentRequest(message);
  if (parsed) {
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: `Kampaku is an advisor in this mode and cannot create sub-agents directly. Route the proposal for ${parsed.slug} to the responsible project lead or specialist for approval and creation.`,
      toolsUsed: [],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

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
      reply: "Kampaku can clarify the intent and route it to the responsible project lead. Task decomposition and specialist delegation belong to the agents that own the relevant domain.",
      toolsUsed: [],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  return persistChatTurn(ctx, config, conversationId, message, {
    reply:
      "Got it. I can plan projects and delegate work via submit_intent, or create sub-agents. Try: create a project called Demo App with a roadmap and tasks.",
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
  const broker = createModelBroker(provider);

  const definition = loadKampakuDefinition();
  const agent = ctx.agentStore.getKampakuAgent();
  const advisorTools = KAMPAKU_TOOLS.filter((tool) => definition.tools.includes(tool.function.name));
  const { summary, messages: history } = buildHistoryContext(ctx.conversationStore, conversationId);
  const systemPrompt = appendSummaryToSystemPrompt(
    prependGlobalSystemPrompt(ctx.store, `${definition.systemPrompt}${ctx.skillStore.buildDefaultSkillsPrompt()}${ctx.skillStore.buildKampakuAdvisorSkillsPrompt()}`),
    summary,
  );
  const pendingQuestion = ctx.questionStore?.listPending().find((question) =>
    question.context?.includes(`conversation_id: ${conversationId}`),
  );
  const questionGuidance = pendingQuestion && !/^\s*(yes|no|approve|reject|answer to pending question)\b/i.test(message)
    ? `A pending decision question from this conversation was not answered clearly. Do not continue execution. Reformulate the same question with its context and options, then emit exactly one structured kampaku-question asking for the missing decision. Pending context: ${pendingQuestion.context ?? "unavailable"}`
    : undefined;
  const pendingPlanContext = pendingQuestion ? planApprovalContext(ctx, pendingQuestion.question) : "";
  const approvalContinuation = pendingQuestion && /^\s*(yes|approve)\b/i.test(message) && pendingPlanContext.startsWith("plan_preview_status: available")
    ? `The emperor approved the pending plan. Use the exact plan values below: call approve_plan, then call submit_intent with mode=apply and the same approval_reference, plan_fingerprint, and plan_content_hash. Do not ask for the plan again.\n${pendingPlanContext}`
    : undefined;
  const rosterApprovalContinuation = /grant kampaku system-agent-roster|grant.*temporary permission/i.test(message)
    ? "The emperor explicitly approved the temporary system-agent-roster permission. Do not call ask_superior and do not ask another question. Call assign_skill for agent_slug=kampaku and skill_slug=system-agent-roster, then continue the previously approved submit_intent/apply or agent-creation workflow."
    : undefined;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(questionGuidance ? [{ role: "system" as const, content: questionGuidance }] : []),
    ...(approvalContinuation ? [{ role: "system" as const, content: approvalContinuation }] : []),
    ...(rosterApprovalContinuation ? [{ role: "system" as const, content: rosterApprovalContinuation }] : []),
    ...history,
    { role: "user", content: message },
  ];

  const loopMessages: ChatMessage[] = [];
  const toolsUsed: string[] = [];
  let model: string | undefined;
  const startedAt = Date.now();

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    if (Date.now() - startedAt >= CHAT_TURN_DEADLINE_MS) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: "Kampaku stopped this turn after reaching the execution deadline. Retry the request to continue from the persisted state.",
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        agentUsed: "llm",
        model,
        conversationId,
      }, loopMessages, onProgress);
    }
    let response;
    try {
      response = await withModelTimeout(broker.chatWithTools(messages, advisorTools));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: formatKampakuProviderError(detail),
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        agentUsed: "llm",
        model,
        conversationId,
      }, loopMessages, onProgress);
    }

    model = response.model;
    const choice = response.choices[0];
    if (!choice) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: "No response from model.",
        toolsUsed,
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
        try {
          onProgress?.({ phase: "tool", tool: toolName, label: getToolLabel(toolName) });
          const result = await executeToolCall(ctx, toolName, toolCall.function.arguments, {
            agentId: agent.id,
            conversationId,
            projectId: ctx.conversationStore.requireConversation(conversationId).projectId ?? undefined,
          });
          toolContent = JSON.stringify({ ok: true, output: result.output });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          toolContent = JSON.stringify({ ok: false, error: detail });
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
      agentUsed: "llm",
      model,
      conversationId,
    }, loopMessages, onProgress);
  }

  onProgress?.({ phase: "composing" });
  if (Date.now() - startedAt >= CHAT_TURN_DEADLINE_MS) {
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: "Kampaku stopped this turn after reaching the execution deadline. Retry the request to continue from the persisted state.",
      toolsUsed,
      agentUsed: "llm",
      model,
      conversationId,
    }, loopMessages, onProgress);
  }
  const reply = await synthesizeFinalReply(broker, messages, toolsUsed);
  return persistChatTurn(ctx, config, conversationId, message, {
    reply,
    toolsUsed,
    agentUsed: "llm",
    model,
    conversationId,
  }, loopMessages, onProgress);
}

async function synthesizeFinalReply(
  broker: ReturnType<typeof createModelBroker>,
  messages: ChatMessage[],
  toolsUsed: string[],
): Promise<string> {
  messages.push({
    role: "user",
    content:
      "Summarize what you accomplished for the emperor based on the tool results above. Reply in plain text only; do not call any more tools.",
  });

  try {
    const response = await withModelTimeout(broker.complete(messages));
    const reply = response.content.trim();
    if (reply) {
      return reply;
    }
  } catch {
    // Fall through to a deterministic summary.
  }

  const uniqueTools = [...new Set(toolsUsed)];
  return `Finished ${uniqueTools.length} tool step(s): ${uniqueTools.join(", ")}.`;
}

function titleCaseStub(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type { KampakuToolContext };
