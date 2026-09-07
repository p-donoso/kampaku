"use client";

import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import ChatBubbleOutlineRounded from "@mui/icons-material/ChatBubbleOutlineRounded";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import FolderRounded from "@mui/icons-material/FolderRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import MenuBookRounded from "@mui/icons-material/MenuBookRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImperialSealLogo, ImperialSealMark } from "@/components/ui/imperial-seal-logo";
import { StatusDot } from "@/components/ui/status-dot";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof DashboardRounded;
  section?: "work" | "system";
  children?: Array<{ href: string; label: string; Icon?: typeof DashboardRounded }>;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", Icon: DashboardRounded, section: "work" },
  { href: "/chat", label: "Chat", Icon: ChatBubbleOutlineRounded, section: "work" },
  {
    href: "/projects",
    label: "Projects",
    Icon: FolderRounded,
    section: "work",
    children: [
      { href: "/projects", label: "Roster", Icon: FolderRounded },
      { href: "/projects/journal", label: "Journal", Icon: HistoryRounded },
      { href: "/projects/wiki", label: "Wiki", Icon: MenuBookRounded },
    ],
  },
  {
    href: "/agents",
    label: "Agents",
    Icon: AccountTreeRounded,
    section: "work",
    children: [
      { href: "/agents", label: "Roster", Icon: AccountTreeRounded },
      { href: "/agents/skills", label: "Skills", Icon: AutoAwesomeRounded },
    ],
  },
  { href: "/settings", label: "Settings", Icon: SettingsRounded, section: "system" },
];

type SidebarProps = {
  online: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

function SidebarContent({
  online,
  compact,
  mobile,
  onCollapsedChange,
  onMobileClose,
}: {
  online: boolean;
  compact: boolean;
  mobile: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  let lastSection: NavItem["section"] | undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div
        className={`flex shrink-0 items-center border-b border-border ${
          compact ? "h-16 justify-center px-2" : "h-16 justify-between px-4"
        }`}
      >
        {compact ? (
          <ImperialSealMark size="sm" />
        ) : (
          <ImperialSealLogo />
        )}
        {mobile && (
          <button type="button" onClick={onMobileClose} className="sidebar-control" aria-label="Close menu">
            <CloseRounded fontSize="small" />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
        {NAV.map(({ href, label, Icon, children, section }) => {
          const groupActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          const hasChildren = Boolean(children?.length);
          const showSectionLabel = !compact && section && section !== lastSection;
          if (showSectionLabel) lastSection = section;

          return (
            <div key={href}>
              {showSectionLabel && (
                <div className="mb-1 mt-3 px-3 text-[10px] font-medium uppercase tracking-wider text-muted first:mt-0">
                  {section === "work" ? "Work" : "System"}
                </div>
              )}
              {hasChildren && !compact ? (
                <div className="space-y-1">
                  <div
                    className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm ${
                      groupActive ? "text-foreground" : "text-secondary"
                    }`}
                  >
                    <Icon fontSize="small" aria-hidden="true" />
                    <span className="font-medium">{label}</span>
                  </div>
                  <div className="ml-3 space-y-1 border-l border-border pl-3">
                    {children!.map((child) => {
                      const isGroupRoot = child.href === href;
                      const childActive = isGroupRoot
                        ? pathname === child.href ||
                          (pathname.startsWith(`${child.href}/`) &&
                            !children!.some(
                              (sibling) => sibling.href !== href && pathname.startsWith(sibling.href),
                            ))
                        : pathname === child.href || pathname.startsWith(`${child.href}/`);
                      const ChildIcon = child.Icon ?? Icon;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onMobileClose}
                          aria-current={childActive ? "page" : undefined}
                          className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
                            childActive
                              ? "nav-link-active pl-[calc(0.75rem-2px)]"
                              : "text-secondary hover:bg-elevated/50 hover:text-foreground"
                          }`}
                        >
                          <ChildIcon fontSize="inherit" aria-hidden="true" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                (() => {
                  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                  return (
                    <Link
                      href={hasChildren ? children![0]!.href : href}
                      onClick={onMobileClose}
                      aria-current={active ? "page" : undefined}
                      aria-label={compact ? label : undefined}
                      title={compact ? label : undefined}
                      className={`flex min-h-10 items-center rounded-lg text-sm transition-colors ${
                        compact ? "justify-center px-2" : "gap-3 px-3"
                      } ${
                        active
                          ? compact
                            ? "bg-elevated text-foreground ring-1 ring-brand/40"
                            : "nav-link-active pl-[calc(0.75rem-2px)]"
                          : "text-secondary hover:bg-elevated/50 hover:text-foreground"
                      }`}
                    >
                      <Icon fontSize="small" aria-hidden="true" />
                      {!compact && <span>{label}</span>}
                    </Link>
                  );
                })()
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <ThemeToggle compact={compact} className={compact ? "mx-auto" : "w-full justify-start px-3"} />
        {!mobile && (
          <button
            type="button"
            onClick={() => onCollapsedChange(!compact)}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm text-secondary hover:bg-elevated/50 hover:text-foreground"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar to icons"}
            title={compact ? "Expand sidebar" : undefined}
            data-testid="sidebar-collapse-toggle"
          >
            {compact ? (
              <ChevronRightRounded fontSize="small" />
            ) : (
              <>
                <ChevronLeftRounded fontSize="small" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
        <div
          className={`flex items-center text-xs ${compact ? "justify-center" : "gap-2 px-2"}`}
          title={online ? "Core connected" : "Core offline"}
        >
          <StatusDot status={online ? "online" : "offline"} label={online ? "Core connected" : "Core offline"} />
          {!compact && (
            <span className="text-muted">{online ? "Core connected" : "Core offline"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside
      data-testid="app-sidebar"
      className={`hidden h-full shrink-0 border-r border-border transition-[width] duration-200 md:block ${
        props.collapsed ? "w-16" : "w-56"
      }`}
    >
      <SidebarContent
        online={props.online}
        compact={props.collapsed}
        mobile={false}
        onCollapsedChange={props.onCollapsedChange}
        onMobileClose={() => undefined}
      />
    </aside>
  );
}

export function MobileSidebar({ online, onClose }: { online: boolean; onClose: () => void }) {
  return (
    <SidebarContent
      online={online}
      compact={false}
      mobile
      onCollapsedChange={() => undefined}
      onMobileClose={onClose}
    />
  );
}
