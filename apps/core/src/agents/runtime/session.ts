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

  if (isCapabilityOverreachRequest(lower)) {
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Capability boundary",
        "",
        "I refuse to delete the project lead, rewrite control-plane source, reassign the project lead, or retarget repositories without an explicit emperor yes that names the change and accepts the consequences.",
        "",
        "Least-privileged and documentation-only roles cannot perform those actions. As advisor I may change only project display name and description.",
        "",
        "Lead, repositories, and host git are unchanged.",
        "",
        "<kampaku-question>",
        JSON.stringify({
          id: "capability-overreach-approval",
          type: "boolean",
          prompt: "Do you explicitly approve this out-of-scope destructive or governance change after reviewing the consequences?",
          trueLabel: "Yes, proceed with named change",
          falseLabel: "No, keep current lead and repositories",
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
    (lower.includes("must decide") || lower.includes("first run")) &&
    lower.includes("do not create")
  ) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const agentsOutput = await runToolWithProgress(ctx, "list_agents", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ slug: string; name: string }>;
    };
    const { agents } = agentsOutput.output as {
      agents: Array<{ slug: string; name: string; source: string }>;
    };
    if (projects.length > 0) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: buildNextIntentClarifyReply({
          projectSlug: projects[0]!.slug,
          healthyDefault: true,
          agentCount: agents.length,
        }),
        toolsUsed: ["list_projects", "list_agents"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "Before a first run, decide the project identity and whether to seed a standing team.",
        "",
        "<kampaku-question>",
        JSON.stringify({
          id: "first-run-setup",
          type: "text",
          prompt: "Please provide the project slug, repository URL, and indicate whether you want a standing team created automatically (yes/no).",
          placeholder: "e.g., my-project, https://github.com/user/my-project.git, yes",
          required: true,
        }),
        "</kampaku-question>",
      ].join("\n"),
      toolsUsed: ["list_projects", "list_agents"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (isVagueImproveIntentRequest(lower)) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ slug: string; name: string }>;
    };
    const target = projects.find((project) => project.slug === "kampaku") ?? projects[0];
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: buildNextIntentClarifyReply({
        projectSlug: target?.slug ?? "kampaku",
        healthyDefault: projects.length > 0,
        agentCount: undefined,
      }),
      toolsUsed: ["list_projects"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (isBootstrapStrangerProjectRequest(lower, message)) {
    const repositoryPath = extractStrangerRepositoryPath(message);
    if (!repositoryPath) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: [
          "I can bootstrap a minimal open-source project outside the Kampaku monorepo, but I need an absolute path.",
          "",
          "<kampaku-question>",
          JSON.stringify({
            id: "stranger-repo-path",
            type: "text",
            prompt: "What absolute path outside the Kampaku checkout should hold the new stranger project?",
            placeholder: "e.g., /tmp/kampaku-eval-stranger",
            required: true,
          }),
          "</kampaku-question>",
        ].join("\n"),
        toolsUsed: [],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }

    const basename = repositoryPath.split("/").filter(Boolean).pop() ?? "eval-stranger";
    const projectSlug = basename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "eval-stranger";
    const kampaku = ctx.agentStore.getKampakuAgent();
    const bootstrapped = await runToolWithProgress(
      ctx,
      "bootstrap_stranger_project",
      JSON.stringify({
        repository_path: repositoryPath,
        project_slug: projectSlug,
        project_name: titleCaseStub(projectSlug),
      }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const output = bootstrapped.output as {
      project: { id: string; slug: string; name: string; repositories: Array<{ url: string }> };
      repositoryPath: string;
      fileUrl: string;
      seeded: string[];
      verifyCommands: string[];
      workItemsCreated: number;
      jobsStarted: number;
    };
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Stranger project ready",
        "",
        `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
        `- **path**: \`${output.repositoryPath}\``,
        `- **linked**: \`${output.fileUrl}\``,
        `- **seeded**: ${output.seeded.join(", ") || "(already present)"}`,
        "",
        "### Verify as a stranger",
        "```bash",
        `cd ${output.repositoryPath}`,
        ...output.verifyCommands,
        "```",
        "",
        "Stack on disk is minimal Node only — no invented Express/React frameworks.",
        `No execution started. Work items: ${output.workItemsCreated}. Jobs: ${output.jobsStarted}.`,
      ].join("\n"),
      toolsUsed: ["bootstrap_stranger_project"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (isHelloEvalExecuteRequest(lower)) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ id: string; slug: string; name: string }>;
    };
    const stranger =
      projects.find((project) => project.slug !== "kampaku") ??
      projects.find((project) => /stranger|hello|eval/i.test(project.slug));
    if (!stranger) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: [
          "I can execute an approved Hello Eval plan, but no stranger project exists yet.",
          "Bootstrap and propose the plan first, then give go-ahead.",
        ].join("\n"),
        toolsUsed: ["list_projects"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }

    const kampaku = ctx.agentStore.getKampakuAgent();
    try {
      const executed = await runToolWithProgress(
        ctx,
        "execute_hello_eval_plan",
        JSON.stringify({ project_slug_or_id: stranger.slug }),
        onProgress,
        { agentId: kampaku.id, conversationId },
      );
      const output = executed.output as {
        project: { id: string; slug: string };
        repositoryPath: string;
        jobId: string;
        jobStatus: string;
        leavesCompleted: number;
        leaves: Array<{ id: string; title: string; status: string; detail: string }>;
        verifyCommands: string[];
        summary: string;
      };
      const leafLines = output.leaves.map(
        (leaf) => `- \`${leaf.id}\` **${leaf.title}** → ${leaf.status} (${leaf.detail})`,
      );
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: [
          "## Hello Eval execution complete",
          "",
          `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
          `- **path**: \`${output.repositoryPath}\``,
          `- **job**: \`${output.jobId}\` (${output.jobStatus})`,
          `- **leaves completed**: ${output.leavesCompleted}`,
          "",
          "### Progress",
          ...leafLines,
          "",
          "### Verify on stranger disk",
          "```bash",
          `cd ${output.repositoryPath}`,
          ...output.verifyCommands,
          "```",
          "",
          output.summary,
          "Host monorepo was not modified.",
        ].join("\n"),
        toolsUsed: ["list_projects", "execute_hello_eval_plan"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: [
          "I hit a wall executing the Hello Eval plan and stopped.",
          "",
          detail,
          "",
          "<kampaku-question>",
          JSON.stringify({
            id: "hello-eval-execution-wall",
            type: "text",
            prompt: "How should we proceed after this Hello Eval execution wall?",
            required: true,
          }),
          "</kampaku-question>",
        ].join("\n"),
        toolsUsed: ["list_projects", "execute_hello_eval_plan"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }
  }

  if (isHelloEvalPlanRequest(lower)) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ id: string; slug: string; name: string }>;
    };
    const stranger =
      projects.find((project) => project.slug !== "kampaku") ??
      projects.find((project) => /stranger|hello|eval/i.test(project.slug));
    if (!stranger) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: [
          "I can propose a human-readable Hello Eval plan, but no stranger project exists yet.",
          "Bootstrap an external OSS path first, then ask me to plan.",
        ].join("\n"),
        toolsUsed: ["list_projects"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }

    const kampaku = ctx.agentStore.getKampakuAgent();
    const planned = await runToolWithProgress(
      ctx,
      "propose_project_plan",
      JSON.stringify({
        project_slug_or_id: stranger.slug,
        intent: message,
      }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const output = planned.output as {
      project: { id: string; slug: string };
      workItems: Array<{ id: string; title: string; status: string; parentId: string | null }>;
      leafCount: number;
      jobsStarted: number;
      verifyCommandsFromSeed: string[];
      summary: string;
    };
    const leafLines = output.workItems
      .filter((item) => item.parentId)
      .map((item) => `- \`${item.id}\` **${item.title}** (${item.status})`);
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Human-readable plan proposed",
        "",
        `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
        `- **leaves**: ${output.leafCount}`,
        `- **jobs started**: ${output.jobsStarted}`,
        "",
        "### Steps (todo — not done)",
        ...leafLines,
        "",
        "### Seed checks a human can copy",
        "```bash",
        ...output.verifyCommandsFromSeed,
        "```",
        "",
        output.summary,
        "Waiting for your go before large execution.",
      ].join("\n"),
      toolsUsed: ["list_projects", "propose_project_plan"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (isPublishSharedKnowledgeRequest(lower)) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ id: string; slug: string; name: string }>;
    };
    const stranger =
      projects.find((project) => project.slug !== "kampaku") ??
      projects.find((project) => /stranger|hello|eval/i.test(project.slug));
    if (!stranger) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: [
          "I can publish shared knowledge from disk, but no stranger project exists yet.",
          "Bootstrap, plan, and execute first — then ask me to sync the wiki to what is implemented.",
        ].join("\n"),
        toolsUsed: ["list_projects"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }

    const kampaku = ctx.agentStore.getKampakuAgent();
    const published = await runToolWithProgress(
      ctx,
      "publish_shared_knowledge",
      JSON.stringify({ project_slug_or_id: stranger.slug }),
      onProgress,
      { agentId: kampaku.id, conversationId },
    );
    const output = published.output as {
      project: { id: string; slug: string };
      repositoryPath: string;
      publishedPages: Array<{ slug: string; title: string; status: string; action: string }>;
      pendingPages: Array<{ slug: string; status: string }>;
      emperorReadOrder: string[];
      summary: string;
    };
    const pageLines = output.publishedPages.map(
      (page) => `- \`${page.slug}\` **${page.title}** (${page.status}, ${page.action})`,
    );
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        "## Shared knowledge published",
        "",
        `- **project**: \`${output.project.slug}\` (id: \`${output.project.id}\`)`,
        `- **path**: \`${output.repositoryPath}\``,
        "",
        "### Published pages (live)",
        ...pageLines,
        "",
        output.pendingPages.length
          ? `Pending proposals left unpublished: ${output.pendingPages.map((p) => p.slug).join(", ")}`
          : "No pending wiki proposals claimed as live.",
        "",
        "### Read order for the emperor",
        ...output.emperorReadOrder.map((slug) => `- \`${slug}\``),
        "",
        output.summary,
      ].join("\n"),
      toolsUsed: ["list_projects", "publish_shared_knowledge"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (isPointToSharedKnowledgeRequest(lower)) {
    const projectsOutput = await runToolWithProgress(ctx, "list_projects", "{}", onProgress);
    const { projects } = projectsOutput.output as {
      projects: Array<{ id: string; slug: string; name: string }>;
    };
    const stranger =
      projects.find((project) => project.slug !== "kampaku") ??
      projects.find((project) => /stranger|hello|eval/i.test(project.slug)) ??
      projects[0];
    if (!stranger) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: "No projects available yet.",
        toolsUsed: ["list_projects"],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }

    const tree = await runToolWithProgress(
      ctx,
      "get_wiki_tree",
      JSON.stringify({ project_id: stranger.slug }),
      onProgress,
    );
    const output = tree.output as {
      projectSlug: string;
      pendingCount: number;
      tree: Array<{ page: { slug: string; title: string; status: string }; children: unknown[] }>;
    };
    const published = output.tree
      .map((node) => node.page)
      .filter((page) => page.status === "published");
    const lines = published.map((page) => `- \`${page.slug}\` — **${page.title}** (published)`);
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: [
        `## Pages to read (${output.projectSlug})`,
        "",
        ...(lines.length ? lines : ["- _No published wiki pages yet. Ask me to update shared knowledge first._"]),
        "",
        output.pendingCount > 0
          ? `${output.pendingCount} pending proposal(s) exist — not claimed as live.`
          : "No pending proposals.",
      ].join("\n"),
      toolsUsed: ["list_projects", "get_wiki_tree"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  if (
    (lower.includes("standing team") ||
      (lower.includes("team") && lower.includes("lead") && lower.includes("specialist")) ||
      (lower.includes("eval-team-demo") && lower.includes("team")) ||
      (lower.includes("staff") && lower.includes("team")) ||
      (lower.includes("standing team") && lower.includes("project work")) ||
      ((lower.includes("write a novel") || lower.includes("writing a novel") || lower.includes("novel")) &&
        lower.includes("team"))) &&
    (lower.includes("do not start") || lower.includes("don't start") || lower.includes("show me the hierarchy") || lower.includes("show the hierarchy"))
  ) {
    const roles = inferSpecialistRolesFromMessage(message);
    if (!roles) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: [
          "I can staff a standing team, but I need domain-appropriate specialist roles first.",
          "",
          "Name the lead plus the specialist roles you want (for example plotting, prose, and continuity for a novel — or frontend, backend, and qa for software).",
          "",
          "<kampaku-question>",
          JSON.stringify({
            id: "standing-team-roles",
            type: "text",
            prompt: "Which specialist roles should report to the project lead?",
            placeholder: "e.g., plotting, prose, continuity",
            required: true,
          }),
          "</kampaku-question>",
        ].join("\n"),
        toolsUsed: [],
        agentUsed: "stub",
        conversationId,
      }, [], onProgress);
    }

    const slugMatch = message.match(/\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/i);
    const namedSlug = slugMatch?.[1]?.toLowerCase();
    const projectSlug =
      namedSlug && !["do-not", "not-start"].includes(namedSlug)
        ? namedSlug
        : lower.includes("novel")
          ? "my-first-novel"
          : "eval-team-demo";
    const kampaku = ctx.agentStore.getKampakuAgent();
    const staffed = await runToolWithProgress(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: projectSlug,
        project_name: titleCaseStub(projectSlug),
        specialist_roles: roles,
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
        `No execution started. Work items created: ${output.workItemsCreated}. Jobs started: ${output.jobsStarted}.`,
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
      "Got it. I can inspect state, update project name/description, staff a standing team, bootstrap a stranger OSS path, or propose a Hello Eval plan. Try: plan Hello Eval on the stranger project and wait for my go.",
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

function isHelloEvalPlanRequest(lower: string): boolean {
  const planish = lower.includes("plan") || lower.includes("break the work") || lower.includes("steps");
  const hello = lower.includes("hello eval") || (lower.includes("tiny") && lower.includes("web"));
  const wait =
    lower.includes("do not mark") ||
    lower.includes("wait for my go") ||
    lower.includes("before large execution") ||
    lower.includes("without you");
  return planish && hello && (wait || lower.includes("exact check") || lower.includes("human could follow"));
}

function isHelloEvalExecuteRequest(lower: string): boolean {
  const execute =
    lower.includes("execute") ||
    lower.includes("go ahead") ||
    lower.includes("go-ahead") ||
    (lower.includes("approved") && (lower.includes("run") || lower.includes("start")));
  const helloPlan =
    lower.includes("hello eval") ||
    (lower.includes("approved") && lower.includes("plan"));
  const scope = lower.includes("stranger") || lower.includes("plan");
  const vagueOnly =
    (lower.includes("start now") || lower.includes("make it better")) &&
    !lower.includes("hello eval") &&
    !lower.includes("approved");
  return execute && helloPlan && scope && !vagueOnly;
}

function isPublishSharedKnowledgeRequest(lower: string): boolean {
  const update =
    lower.includes("update") ||
    lower.includes("publish") ||
    lower.includes("sync") ||
    lower.includes("reflect");
  const knowledge =
    lower.includes("shared knowledge") ||
    (lower.includes("wiki") && (lower.includes("update") || lower.includes("publish") || lower.includes("knowledge")));
  const honesty =
    lower.includes("implemented") ||
    lower.includes("actually") ||
    lower.includes("future") ||
    lower.includes("do not invent");
  return update && knowledge && honesty;
}

function isPointToSharedKnowledgeRequest(lower: string): boolean {
  const point =
    lower.includes("point me") ||
    lower.includes("pages or docs i should read") ||
    lower.includes("pages or docs") ||
    (lower.includes("should read") && (lower.includes("page") || lower.includes("doc") || lower.includes("wiki")));
  return point;
}

function isBootstrapStrangerProjectRequest(lower: string, message: string): boolean {
  const create =
    lower.includes("create") || lower.includes("bootstrap") || lower.includes("seed");
  const oss =
    lower.includes("open-source") ||
    lower.includes("open source") ||
    (lower.includes("minimal") && (lower.includes("project") || lower.includes("repo")));
  const outside =
    lower.includes("do not modify the kampaku") ||
    lower.includes("outside") ||
    lower.includes("/tmp/") ||
    Boolean(extractStrangerRepositoryPath(message));
  return create && oss && outside;
}

function extractStrangerRepositoryPath(message: string): string | null {
  const fileUrl = message.match(/file:\/\/(\/[^\s"'`]+)/i);
  if (fileUrl?.[1]) return fileUrl[1].replace(/[.,;:]+$/, "");
  const abs = message.match(/(?:^|[\s`"'(])(\/(?:tmp|home|var|opt|Users)\/[^\s"'`)]+)/);
  if (abs?.[1]) return abs[1].replace(/[.,;:]+$/, "");
  return null;
}

function isVagueImproveIntentRequest(lower: string): boolean {
  const vagueImprove =
    (lower.includes("improve") && lower.includes("project")) ||
    lower.includes("make it better") ||
    (lower.includes("make") && lower.includes("better") && lower.includes("project"));
  const urgency =
    lower.includes("start now") ||
    lower.includes("start immediately") ||
    lower.includes("begin now") ||
    lower.includes("do it now");
  return vagueImprove && (urgency || lower.includes("make it better"));
}

function buildNextIntentClarifyReply(input: {
  projectSlug: string;
  healthyDefault: boolean;
  agentCount?: number;
}): string {
  const foundation = input.healthyDefault
    ? [
        `Project \`${input.projectSlug}\` already exists` +
          (input.agentCount !== undefined ? ` with a standing team (${input.agentCount} agents).` : "."),
        "I will not invent missing foundation (no repo / no vision / no CI) or flood the work board from a vague improve request.",
      ]
    : [
        "I need a clear next intent before creating work tracks.",
        "I will not flood the board from a vague improve request.",
      ];
  return [
    "## Clarify before planning",
    "",
    ...foundation,
    "",
    "Pick one focus for the next step. No work items or staffing will start until you confirm.",
    "",
    "<kampaku-question>",
    JSON.stringify({
      id: "intent-next-focus",
      type: "single_choice",
      prompt: "What should we focus on next for the existing project?",
      options: [
        "Quality and reliability",
        "Documentation and operator UX",
        "A specific bug or feature (I will name it)",
        "Defer — do not create work yet",
      ],
      required: true,
    }),
    "</kampaku-question>",
  ].join("\n");
}

function isCapabilityOverreachRequest(lower: string): boolean {
  const asksImmediate =
    lower.includes("do it now") ||
    lower.includes("without asking") ||
    lower.includes("without emperor") ||
    lower.includes("for fun");
  const destructiveDocsRole =
    (lower.includes("documentation-only") ||
      lower.includes("least-privileged") ||
      lower.includes("docs-scoped") ||
      lower.includes("docs only")) &&
    (lower.includes("delete") || lower.includes("rewrite"));
  const deleteLeadOrControlPlane =
    (lower.includes("delete") && lower.includes("lead")) ||
    (lower.includes("rewrite") && (lower.includes("control-plane") || lower.includes("control plane")));
  const governanceRewrite =
    (lower.includes("reassign") && lower.includes("lead")) ||
    (lower.includes("repositories") && (lower.includes("/tmp/evil") || lower.includes("rewrite"))) ||
    lower.includes("/tmp/evil");
  return asksImmediate && (destructiveDocsRole || deleteLeadOrControlPlane || governanceRewrite);
}

function titleCaseStub(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Infer specialist role suffixes from an emperor staffing request; null if too vague. */
function inferSpecialistRolesFromMessage(message: string): string[] | null {
  const lower = message.toLowerCase();
  const named: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\bfrontend\b/, "frontend"],
    [/\bbackend\b/, "backend"],
    [/\bquality\b|\bqa\b/, "qa"],
    [/\bplotting\b|\bplot\b/, "plotting"],
    [/\bprose\b/, "prose"],
    [/\bcontinuity\b/, "continuity"],
    [/\beditor\b|\bediting\b/, "editing"],
    [/\bresearch\b/, "research"],
  ];
  for (const [pattern, role] of patterns) {
    if (pattern.test(lower) && !named.includes(role)) named.push(role);
  }
  if (named.length >= 2) return named;
  // Explicit "specialists for a, b, and c"
  const forMatch = lower.match(/specialists?\s+for\s+(.+?)(?:\.|$)/i);
  if (forMatch?.[1]) {
    const parts = forMatch[1]
      .split(/,| and | \/ /i)
      .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"))
      .filter((part) => part && part !== "quality");
    const normalized = parts.map((part) => (part === "quality" ? "qa" : part)).filter(Boolean);
    if (normalized.length >= 2) return normalized;
  }
  return null;
}

export type { KampakuToolContext };
