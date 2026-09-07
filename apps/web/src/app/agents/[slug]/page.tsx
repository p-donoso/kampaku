import Link from "next/link";
import { getAgent, getAgentDashboard, getAgentMemories } from "@/lib/api";
import { AgentDetailTabs } from "@/components/agents/agent-detail-tabs";
import type { AgentMemory } from "@/lib/types";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let agent = null;
  let dashboard = null;
  let memory: { memories: AgentMemory[]; counts: { logs: number; learnings: number } } = {
    memories: [], counts: { logs: 0, learnings: 0 },
  };
  let error: string | null = null;

  try {
    agent = await getAgent(slug);
    dashboard = await getAgentDashboard(slug);
    memory = await getAgentMemories(slug);
  } catch (e) {
    error = e instanceof Error ? e.message : "Agent not found";
  }

  if (!agent) {
    return (
      <>
        <header className="border-b border-zinc-800 px-6 py-4">
          <h1 className="text-lg font-semibold">Agent</h1>
          <p className="text-sm text-red-400">{error}</p>
        </header>
      </>
    );
  }

  return (
    <>
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/agents" className="hover:text-zinc-300">
            Agents
          </Link>
          <span>/</span>
          <span className="text-zinc-300">{agent.slug}</span>
        </div>
        <h1 className="mt-1 text-lg font-semibold">{agent.name}</h1>
        <p className="text-sm text-zinc-500">{agent.responsibilities}</p>
        {agent.skills?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {agent.skills.map((skill) => (
              <span
                key={skill}
                className="rounded bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <AgentDetailTabs agent={agent} dashboard={dashboard} memories={memory.memories} counts={memory.counts} />
    </>
  );
}
