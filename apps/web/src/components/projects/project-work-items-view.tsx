"use client";

import { WorkItemExecuteProvider } from "@/components/work-items/work-item-tree-view";
import type { WorkItemTreeNode } from "@/lib/types";

export function ProjectWorkItems({ items }: { items: WorkItemTreeNode[] }) {
  return <WorkItemExecuteProvider items={items} />;
}
