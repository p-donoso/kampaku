import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

const PROJECTS_NAV_TABS: SubNavTab[] = [
  {
    href: "/projects",
    label: "Roster",
    excludePrefixes: ["/projects/journal", "/projects/wiki"],
  },
  {
    href: "/projects/journal",
    label: "Journal",
  },
  {
    href: "/projects/wiki",
    label: "Wiki",
  },
];

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Progress, execution status, journal handoffs, and shared documentation"
      />
      <SubNav tabs={PROJECTS_NAV_TABS} ariaLabel="Projects sections" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </div>
    </>
  );
}
