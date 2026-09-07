import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

const AGENTS_TABS: SubNavTab[] = [
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

export function AgentsSubNav() {
  return <SubNav tabs={AGENTS_TABS} ariaLabel="Agents sections" />;
}
