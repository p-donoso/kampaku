"use client";

import MenuRounded from "@mui/icons-material/MenuRounded";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PanelProvider } from "@/components/panel-provider";
import { MobileSidebar, Sidebar } from "@/components/sidebar";
import { ImperialSealMark } from "@/components/ui/imperial-seal-logo";
import { SlideOver } from "@/components/ui/slide-over";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { healthCheck } from "@/lib/api";
import {
  persistSidebarCollapsed,
  readInitialSidebarCollapsed,
} from "@/lib/sidebar-preference";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDevRoute = pathname.startsWith("/dev");
  const [online, setOnline] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isDevRoute) return;
    healthCheck().then(setOnline);
    const interval = setInterval(() => healthCheck().then(setOnline), 10000);
    return () => clearInterval(interval);
  }, [isDevRoute]);

  useEffect(() => {
    if (isDevRoute) return;
    setSidebarCollapsed(readInitialSidebarCollapsed());
    setPrefsReady(true);
  }, [isDevRoute]);

  const changeSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    persistSidebarCollapsed(collapsed);
  };

  if (isDevRoute) {
    return <>{children}</>;
  }

  const collapsedForRender = prefsReady ? sidebarCollapsed : false;

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        online={online}
        collapsed={collapsedForRender}
        onCollapsedChange={changeSidebarCollapsed}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="sidebar-control"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              <MenuRounded fontSize="small" />
            </button>
            <ImperialSealMark size="sm" />
            <span className="brand-wordmark truncate text-lg leading-none text-brand-gold">Kampaku</span>
          </div>
          <ThemeToggle compact />
        </div>

        <SlideOver
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          id="mobile-navigation"
          side="left"
        >
          <MobileSidebar online={online} onClose={() => setMobileMenuOpen(false)} />
        </SlideOver>

        <Suspense fallback={null}>
          <PanelProvider>{children}</PanelProvider>
        </Suspense>
      </main>
    </div>
  );
}
