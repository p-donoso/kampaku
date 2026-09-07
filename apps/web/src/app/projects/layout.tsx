"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

const PROJECTS_NAV_TABS: SubNavTab[] = [
  {
    href: "/projects",
    label: "Roster",
    match: (path: string) =>
      path === "/projects" ||
      (path.startsWith("/projects/") &&
        !path.startsWith("/projects/journal") &&
        !path.startsWith("/projects/wiki")),
  },
  {
    href: "/projects/journal",
    label: "Journal",
    match: (path: string) => path.startsWith("/projects/journal"),
  },
  {
    href: "/projects/wiki",
    label: "Wiki",
    match: (path: string) => path.startsWith("/projects/wiki"),
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
