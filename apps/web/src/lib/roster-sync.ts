"use client";

import { useEffect } from "react";

export type RosterEntityType = "agent" | "project" | "skill" | "task";

export type RosterSyncDetail =
  | { action: "deleted"; entityType: RosterEntityType; slug: string }
  | { action: "refresh" };

export const ROSTER_SYNC_EVENT = "kampaku:roster-sync";

export function notifyRosterSync(detail: RosterSyncDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RosterSyncDetail>(ROSTER_SYNC_EVENT, { detail }));
}

export function useRosterSyncListener(onSync: (detail: RosterSyncDetail) => void): void {
  useEffect(() => {
    const handler = (event: Event) => {
      onSync((event as CustomEvent<RosterSyncDetail>).detail);
    };
    window.addEventListener(ROSTER_SYNC_EVENT, handler);
    return () => window.removeEventListener(ROSTER_SYNC_EVENT, handler);
  }, [onSync]);
}
