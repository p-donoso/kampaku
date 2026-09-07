import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

export const AGENTS_NAV_TABS: SubNavTab[] = [
  {
    href: "/agents",
    label: "Roster",
    match: (path: string) =>
      path === "/agents" ||
      (path.startsWith("/agents/") && !path.startsWith("/agents/skills")),
  },
  {
    href: "/agents/skills",
    label: "Skills",
    match: (path: string) => path.startsWith("/agents/skills"),
  },
];

export function AgentsPageFrame({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader title="Agents" description={description} />
      <SubNav tabs={AGENTS_NAV_TABS} ariaLabel="Agents sections" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </div>
    </>
  );
}
