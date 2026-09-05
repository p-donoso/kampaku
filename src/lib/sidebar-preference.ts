export const SIDEBAR_STORAGE_KEY = "kampaku-sidebar-collapsed";

export function readInitialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;

  const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;

  const w = window.innerWidth;
  return w >= 768 && w < 1024;
}

export function persistSidebarCollapsed(collapsed: boolean) {
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
}
