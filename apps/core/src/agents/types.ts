import type { ChatProgressCallback } from "./runtime/progress.js";

export type AgentSource = "builtin" | "bootstrap" | "generated";
export type AgentStatus = "active" | "archived";

export interface AgentRecord {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  source: AgentSource;
  responsibilities: string;
  systemPrompt: string;
  status: AgentStatus;
  skills?: string[];
  createdAt: string;
}

export interface AgentTreeNode {
  agent: AgentRecord;
  children: AgentTreeNode[];
}

export interface BuiltinAgentDefinition {
  slug: string;
  name: string;
  description: string;
  immutable: boolean;
  tools: string[];
  systemPrompt: string;
}

export interface CreateSubAgentInput {
  slug: string;
  name: string;
  responsibilities: string;
  systemPrompt: string;
  parentId: string;
  source?: Exclude<AgentSource, "builtin">;
}

export interface UpdateSubAgentInput {
  name?: string;
  responsibilities?: string;
  systemPrompt?: string;
  parentId?: string;
}

export interface AgentChatResponse {
  reply: string;
  conversationId: string;
  toolsUsed?: string[];
  agentUsed?: "llm" | "stub";
  model?: string;
}

export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  projectId?: string;
}

export interface RunKampakuChatOptions {
  onProgress?: ChatProgressCallback;
}

export type { ChatProgressCallback, ChatProgressEvent } from "./runtime/progress.js";
