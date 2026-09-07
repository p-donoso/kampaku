import type { ReactNode } from "react";
import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

export const SETTINGS_NAV_TABS: SubNavTab[] = [
  { href: "/settings", label: "General", exact: true },
  { href: "/settings/models", label: "Models" },
  { href: "/settings/filesystem", label: "Filesystem" },
  { href: "/settings/data", label: "Data controls" },
];

export function SettingsPageFrame({ description, children, wide = false }: { description: string; children: ReactNode; wide?: boolean }) {
  return <>
    <PageHeader title="Settings" description={description} />
    <SubNav tabs={SETTINGS_NAV_TABS} ariaLabel="Settings sections" />
    <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
      <div className={`mx-auto space-y-6 ${wide ? "max-w-4xl" : "max-w-2xl"}`}>{children}</div>
    </div>
  </>;
}
