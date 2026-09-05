"use client";

import { WorkItemExecuteProvider } from "@/components/work-item-tree";
import type { WorkItemTreeNode } from "@/lib/types";

export function ProjectWorkItems({ items }: { items: WorkItemTreeNode[] }) {
  return <WorkItemExecuteProvider items={items} />;
}
