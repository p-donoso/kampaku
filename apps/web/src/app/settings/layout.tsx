import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

const SETTINGS_NAV_TABS: SubNavTab[] = [
  { href: "/settings", label: "General", exact: true },
  { href: "/settings/models", label: "Models" },
  { href: "/settings/filesystem", label: "Filesystem" },
  { href: "/settings/data", label: "Data controls" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Appearance, model providers, filesystem access, and data controls"
      />
      <SubNav tabs={SETTINGS_NAV_TABS} ariaLabel="Settings sections" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-4xl space-y-6">{children}</div>
      </div>
    </>
  );
}
