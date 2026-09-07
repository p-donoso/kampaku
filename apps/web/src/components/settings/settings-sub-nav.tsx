import { SubNav, type SubNavTab } from "@/components/ui/sub-nav";

const SETTINGS_TABS: SubNavTab[] = [
  { href: "/settings", label: "General", exact: true },
  { href: "/settings/models", label: "Models" },
  { href: "/settings/filesystem", label: "Filesystem" },
  { href: "/settings/data", label: "Data controls" },
];

export function SettingsSubNav() {
  return <SubNav tabs={SETTINGS_TABS} ariaLabel="Settings sections" />;
}
