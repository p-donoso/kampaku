"use client";

import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentTreeNode } from "@/lib/types";
import Link from "next/link";

function flattenTree(
  nodes: AgentTreeNode[],
  parentId?: string,
): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  for (const entry of nodes) {
    flowNodes.push({
      id: entry.agent.id,
      data: {
        label: (
          <Link href={`/agents/${entry.agent.slug}`} className="text-foreground hover:text-brand">
            <div className="font-medium">{entry.agent.name}</div>
            <div className="text-[10px] text-zinc-500">{entry.agent.slug}</div>
            {entry.agent.skills?.length ? (
              <div className="mt-1 text-[10px] text-violet-400">{entry.agent.skills.join(", ")}</div>
            ) : null}
          </Link>
        ),
      },
      position: { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: {
        background: entry.agent.slug === "kampaku" ? "var(--brand-subtle)" : "var(--bg-surface)",
        border:
          entry.agent.slug === "kampaku"
            ? "1px solid color-mix(in srgb, var(--brand) 40%, transparent)"
            : "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 8,
        width: 180,
        color: "var(--text-primary)",
        fontSize: 12,
      },
    });

    if (parentId) {
      flowEdges.push({
        id: `${parentId}-${entry.agent.id}`,
        source: parentId,
        target: entry.agent.id,
        style: { stroke: "#52525b" },
      });
    }

    const childLayout = flattenTree(entry.children, entry.agent.id);
    flowNodes.push(...childLayout.nodes);
    flowEdges.push(...childLayout.edges);
  }

  return { nodes: flowNodes, edges: flowEdges };
}

function layoutNodes(nodes: Node[]): Node[] {
  const levelMap = new Map<string, number>();

  for (const node of nodes) {
    if (!levelMap.has(node.id)) levelMap.set(node.id, 0);
  }

  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: (index % 4) * 220,
      y: Math.floor(index / 4) * 120,
    },
  }));
}

export function AgentGraph({ tree }: { tree: AgentTreeNode[] }) {
  const { nodes: rawNodes, edges } = useMemo(() => flattenTree(tree), [tree]);
  const nodes = useMemo(() => layoutNodes(rawNodes), [rawNodes]);

  const onInit = useCallback(() => {}, []);

  if (nodes.length === 0) {
    return <p className="text-sm text-zinc-500">No agents to graph.</p>;
  }

  return (
    <div className="h-[480px] rounded-xl border border-zinc-800 bg-zinc-950">
      <ReactFlow nodes={nodes} edges={edges} onInit={onInit} fitView>
        <Background color="#3f3f46" gap={16} />
        <Controls />
        <MiniMap nodeColor="#71717a" maskColor="#09090bcc" />
      </ReactFlow>
    </div>
  );
}
