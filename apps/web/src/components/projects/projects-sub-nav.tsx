"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
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
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-border px-4 sm:px-5 lg:px-6">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`border-b-2 px-4 py-3 text-sm transition-colors ${
            tab.match(pathname)
              ? "border-brand text-foreground"
              : "border-transparent text-muted hover:text-secondary"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
