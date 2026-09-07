import { AgentsManagement } from "@/components/agents/agents-management";
import { AgentsPageFrame } from "@/components/agents/agents-page-frame";
import { getAgentsRoster } from "@/lib/api";
import { countAgents } from "@/lib/agent-roster-utils";

export default async function AgentsPage() {
  let tree: Awaited<ReturnType<typeof getAgentsRoster>>["tree"] = [];
  let error: string | null = null;

  try {
    const res = await getAgentsRoster();
    tree = res.tree ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to core";
  }

  const agentCount = countAgents(tree);

  return (
    <AgentsPageFrame
      description={
        error
          ? error
          : `${agentCount} agents · workload, activity, and learnings`
      }
    >
      {error && !tree.length ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <AgentsManagement initialTree={tree} />
      )}
    </AgentsPageFrame>
  );
}
