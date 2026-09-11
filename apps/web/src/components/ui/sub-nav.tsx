"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tab specification for secondary section navigation.
 */
export interface SubNavTab {
  /** Target link destination URL */
  href: string;
  /** Human-readable tab label */
  label: string;
  /** When true, only active if path exactly matches href */
  exact?: boolean;
  /** Nested route prefixes that do not belong to this tab */
  excludePrefixes?: string[];
}

export interface SubNavProps {
  /** List of navigation tabs */
  tabs: SubNavTab[];
  /** Accessibility label for the navigation element */
  ariaLabel?: string;
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * Universal horizontal tabbed sub-navigation bar for views and section layouts.
 */
export function SubNav({
  tabs,
  ariaLabel = "Section navigation",
  className = "",
}: SubNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex gap-1 overflow-x-auto border-b border-border px-4 sm:px-5 lg:px-6 ${className}`}
    >
      {tabs.map((tab) => {
        const matchesPath = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const active =
          matchesPath &&
          !tab.excludePrefixes?.some((prefix) => pathname.startsWith(prefix));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm transition-colors ${
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted hover:text-secondary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
