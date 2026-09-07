import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

const PROJECTS_TABS: SubNavTab[] = [
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

export function ProjectsSubNav() {
  return <SubNav tabs={PROJECTS_TABS} ariaLabel="Projects sections" />;
}
