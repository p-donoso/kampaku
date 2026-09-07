import { AgentsManagement } from "@/components/agents/agents-view";
import { getAgentsRoster } from "@/lib/api";

export default async function AgentsPage() {
  let tree: Awaited<ReturnType<typeof getAgentsRoster>>["tree"] = [];
  let error: string | null = null;

  try {
    const res = await getAgentsRoster();
    tree = res.tree ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to core";
  }

  if (error && !tree.length) {
    return <p className="text-sm text-error">{error}</p>;
  }

  return <AgentsManagement initialTree={tree} />;
}
