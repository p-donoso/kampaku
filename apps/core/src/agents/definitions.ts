import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { AgentRecord, BuiltinAgentDefinition } from "./types.js";

const builtinAgentSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  immutable: z.boolean(),
  tools: z.array(z.string()),
  systemPrompt: z.string(),
});

const KAMPAKU_BUILTIN_ID = "00000000-0000-4000-8000-000000000001";

function getAgentsDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "..", "..", "agents");
}

export function loadKampakuDefinition(): BuiltinAgentDefinition {
  const path = join(getAgentsDir(), "kampaku.agent.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const definition = builtinAgentSchema.parse(raw);
  return {
    ...definition,
    systemPrompt: definition.systemPrompt,
  };
}

export function getKampakuBuiltinAgent(definition = loadKampakuDefinition()): AgentRecord {
  return {
    id: KAMPAKU_BUILTIN_ID,
    slug: definition.slug,
    name: definition.name,
    parentId: null,
    source: "builtin",
    responsibilities: definition.description,
    systemPrompt: definition.systemPrompt,
    status: "active",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

export function isKampakuBuiltinId(id: string): boolean {
  return id === KAMPAKU_BUILTIN_ID;
}

export const KAMPAKU_AGENT_ID = KAMPAKU_BUILTIN_ID;
