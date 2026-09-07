"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/models", label: "Models" },
  { href: "/settings/filesystem", label: "Filesystem" },
  { href: "/settings/data", label: "Data controls" },
];

export function SettingsSubNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-border px-4 sm:px-5 lg:px-6">
      {TABS.map((tab) => {
        const active = tab.href === "/settings" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={`shrink-0 border-b-2 px-4 py-3 text-sm transition-colors ${active ? "border-brand text-foreground" : "border-transparent text-muted hover:text-secondary"}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
