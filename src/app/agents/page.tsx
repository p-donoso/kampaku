import { AgentsManagement } from "@/components/agents-management";
import { AgentsSubNav } from "@/components/agents-sub-nav";
import { PageHeader } from "@/components/ui/page-header";
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
    <>
      <PageHeader
        title="Agents"
        description={
          error
            ? error
            : `${agentCount} agents · workload, activity, and learnings`
        }
      />

      <AgentsSubNav />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-7xl">
          {error && !tree.length ? (
            <p className="text-sm text-error">{error}</p>
          ) : (
            <AgentsManagement initialTree={tree} />
          )}
        </div>
      </div>
    </>
  );
}
