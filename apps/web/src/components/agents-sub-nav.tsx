"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/agents", label: "Roster", match: (path: string) => path === "/agents" || (path.startsWith("/agents/") && !path.startsWith("/agents/skills")) },
  { href: "/agents/skills", label: "Skills", match: (path: string) => path.startsWith("/agents/skills") },
];

export function AgentsSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-border px-4 sm:px-5 lg:px-6">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 px-4 py-3 text-sm transition-colors ${
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted hover:text-secondary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
