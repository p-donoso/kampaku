import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsSubNav } from "@/components/settings-sub-nav";

export function SettingsPageFrame({ description, children, wide = false }: { description: string; children: ReactNode; wide?: boolean }) {
  return <>
    <PageHeader title="Settings" description={description} />
    <SettingsSubNav />
    <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
      <div className={`mx-auto space-y-6 ${wide ? "max-w-4xl" : "max-w-2xl"}`}>{children}</div>
    </div>
  </>;
}
