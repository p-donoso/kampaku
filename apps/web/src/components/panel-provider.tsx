"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgentDetailContent } from "@/components/agent-detail-content";
import { DetailPanelProvider } from "@/components/detail-panel-context";
import { DetailFloatingPanel } from "@/components/detail-floating-panel";
import { ProjectDetailContent } from "@/components/project-detail-content";
import { SkillDetailContent } from "@/components/skill-detail-content";
import { WorkItemDetailContent } from "@/components/work-item-detail-content";
import type { WorkItemTab } from "@/components/work-item-detail-tabs";
import { isNotFoundError } from "@/lib/api-errors";
import { getAgent, getGoalAudit, getProjectOverview, getSkill, getWorkItemDetail } from "@/lib/api";
import { notifyRosterSync, type RosterEntityType } from "@/lib/roster-sync";

type PanelState =
  | { type: "closed" }
  | { type: "project"; slug: string; title?: string }
  | { type: "agent"; slug: string; title?: string }
  | { type: "skill"; slug: string; title?: string }
  | { type: "task"; id: string; title?: string; subtitle?: string; initialTab?: WorkItemTab };

export type OpenTaskOptions = {
  tab?: WorkItemTab;
};

interface PanelContextValue {
  openGoal: (goalId: string) => void;
  openProject: (slug: string) => void;
  openAgent: (slug: string) => void;
  openSkill: (slug: string) => void;
  openTask: (id: string, options?: OpenTaskOptions) => void;
  close: () => void;
  onEntityNotFound: (entityType: RosterEntityType, slug: string) => void;
  markEntityDeleted: (entityType: RosterEntityType, slug: string) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanels() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanels must be used within PanelProvider");
  return ctx;
}

function entityKey(entityType: RosterEntityType, slug: string): string {
  return `${entityType}:${slug}`;
}

function parseTaskTab(value: string | null): WorkItemTab | undefined {
  if (value === "summary" || value === "children" || value === "journal" || value === "job") {
    return value;
  }
  return undefined;
}

function syncUrl(router: ReturnType<typeof useRouter>, panel: PanelState) {
  const params = new URLSearchParams(window.location.search);
  params.delete("open");
  params.delete("goal");
  params.delete("agent");
  params.delete("skill");
  params.delete("task");
  params.delete("tab");

  if (panel.type === "project") params.set("open", panel.slug);
  if (panel.type === "agent") params.set("agent", panel.slug);
  if (panel.type === "skill") params.set("skill", panel.slug);
  if (panel.type === "task") {
    params.set("task", panel.id);
    if (panel.initialTab && panel.initialTab !== "summary") {
      params.set("tab", panel.initialTab);
    }
  }

  const qs = params.toString();
  router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
}

function loadTaskPanel(
  taskId: string,
  initialTab: WorkItemTab | undefined,
  onUpdate: (panel: Extract<PanelState, { type: "task" }>) => void,
  onMissing: (error: unknown) => void,
) {
  getWorkItemDetail(taskId)
    .then((detail) => {
      onUpdate({
        type: "task",
        id: taskId,
        title: detail.item.title,
        subtitle: detail.project.slug,
        initialTab,
      });
    })
    .catch(onMissing);
}

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<PanelState>({ type: "closed" });
  const blockedSlugsRef = useRef(new Set<string>());

  const blockSlug = useCallback((entityType: RosterEntityType, slug: string) => {
    blockedSlugsRef.current.add(entityKey(entityType, slug));
    window.setTimeout(() => {
      blockedSlugsRef.current.delete(entityKey(entityType, slug));
    }, 60_000);
  }, []);

  const isBlocked = useCallback((entityType: RosterEntityType, slug: string) => {
    return blockedSlugsRef.current.has(entityKey(entityType, slug));
  }, []);

  const close = useCallback(() => {
    setPanel({ type: "closed" });
    syncUrl(router, { type: "closed" });
  }, [router]);

  const markEntityDeleted = useCallback(
    (entityType: RosterEntityType, slug: string) => {
      blockSlug(entityType, slug);
      notifyRosterSync({ action: "deleted", entityType, slug });
    },
    [blockSlug],
  );

  const onEntityNotFound = useCallback(
    (entityType: RosterEntityType, slug: string) => {
      markEntityDeleted(entityType, slug);
      close();
    },
    [markEntityDeleted, close],
  );

  const openTask = useCallback(
    (id: string, options?: OpenTaskOptions) => {
      if (isBlocked("task", id)) {
        onEntityNotFound("task", id);
        return;
      }
      const initialTab = options?.tab;
      setPanel({ type: "task", id, initialTab });
      syncUrl(router, { type: "task", id, initialTab });
      loadTaskPanel(
        id,
        initialTab,
        (next) => {
          setPanel((prev) => (prev.type === "task" && prev.id === id ? next : prev));
        },
        (error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("task", id);
          }
        },
      );
    },
    [isBlocked, onEntityNotFound, router],
  );

  const openGoal = useCallback(
    (goalId: string) => {
      getGoalAudit(goalId)
        .then((audit) => {
          if (audit.workItemId) {
            openTask(audit.workItemId, { tab: "job" });
          }
        })
        .catch(() => undefined);
    },
    [openTask],
  );

  const openProject = useCallback(
    (slug: string) => {
      if (isBlocked("project", slug)) {
        onEntityNotFound("project", slug);
        return;
      }
      setPanel({ type: "project", slug });
      syncUrl(router, { type: "project", slug });
      getProjectOverview(slug)
        .then((overview) => {
          setPanel((prev) =>
            prev.type === "project" && prev.slug === slug
              ? { ...prev, title: overview.project.name }
              : prev,
          );
        })
        .catch((error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("project", slug);
          }
        });
    },
    [isBlocked, onEntityNotFound, router],
  );

  const openAgent = useCallback(
    (slug: string) => {
      if (isBlocked("agent", slug)) {
        onEntityNotFound("agent", slug);
        return;
      }
      setPanel({ type: "agent", slug });
      syncUrl(router, { type: "agent", slug });
      getAgent(slug)
        .then((agent) => {
          setPanel((prev) =>
            prev.type === "agent" && prev.slug === slug ? { ...prev, title: agent.name } : prev,
          );
        })
        .catch((error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("agent", slug);
          }
        });
    },
    [isBlocked, onEntityNotFound, router],
  );

  const openSkill = useCallback(
    (slug: string) => {
      if (isBlocked("skill", slug)) {
        onEntityNotFound("skill", slug);
        return;
      }
      setPanel({ type: "skill", slug });
      syncUrl(router, { type: "skill", slug });
      getSkill(slug)
        .then((skill) => {
          setPanel((prev) =>
            prev.type === "skill" && prev.slug === slug ? { ...prev, title: skill.name } : prev,
          );
        })
        .catch((error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("skill", slug);
          }
        });
    },
    [isBlocked, onEntityNotFound, router],
  );

  useEffect(() => {
    const openSlug = searchParams.get("open");
    const goalId = searchParams.get("goal");
    const agentSlug = searchParams.get("agent");
    const skillSlug = searchParams.get("skill");
    const taskId = searchParams.get("task");
    const taskTab = parseTaskTab(searchParams.get("tab"));

    if (!openSlug && !goalId && !agentSlug && !skillSlug && !taskId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanel({ type: "closed" });
      return;
    }

    if (goalId) {
      getGoalAudit(goalId)
        .then((audit) => {
          if (audit.workItemId) {
            openTask(audit.workItemId, { tab: taskTab ?? "job" });
          }
        })
        .catch(() => undefined);
      return;
    }

    if (taskId) {
      if (isBlocked("task", taskId)) {
        syncUrl(router, { type: "closed" });
        setPanel({ type: "closed" });
        notifyRosterSync({ action: "deleted", entityType: "task", slug: taskId });
        return;
      }
      setPanel({ type: "task", id: taskId, initialTab: taskTab });
      loadTaskPanel(
        taskId,
        taskTab,
        (next) => setPanel(next),
        (error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("task", taskId);
          }
        },
      );
      return;
    }

    if (skillSlug) {
      if (isBlocked("skill", skillSlug)) {
        syncUrl(router, { type: "closed" });
        setPanel({ type: "closed" });
        notifyRosterSync({ action: "deleted", entityType: "skill", slug: skillSlug });
        return;
      }
      setPanel({ type: "skill", slug: skillSlug });
      getSkill(skillSlug)
        .then((skill) => {
          setPanel({ type: "skill", slug: skillSlug, title: skill.name });
        })
        .catch((error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("skill", skillSlug);
          }
        });
      return;
    }

    if (agentSlug) {
      if (isBlocked("agent", agentSlug)) {
        syncUrl(router, { type: "closed" });
        setPanel({ type: "closed" });
        notifyRosterSync({ action: "deleted", entityType: "agent", slug: agentSlug });
        return;
      }
      setPanel({ type: "agent", slug: agentSlug });
      getAgent(agentSlug)
        .then((agent) => {
          setPanel({ type: "agent", slug: agentSlug, title: agent.name });
        })
        .catch((error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("agent", agentSlug);
          }
        });
      return;
    }

    if (openSlug) {
      if (isBlocked("project", openSlug)) {
        syncUrl(router, { type: "closed" });
        setPanel({ type: "closed" });
        notifyRosterSync({ action: "deleted", entityType: "project", slug: openSlug });
        return;
      }
      setPanel({ type: "project", slug: openSlug });
      getProjectOverview(openSlug)
        .then((overview) => {
          setPanel({ type: "project", slug: openSlug, title: overview.project.name });
        })
        .catch((error) => {
          if (isNotFoundError(error)) {
            onEntityNotFound("project", openSlug);
          }
        });
    }
  }, [searchParams, isBlocked, onEntityNotFound, openTask, router]);

  const panelTitle =
    panel.type === "project"
      ? panel.title ?? "Project details"
      : panel.type === "agent"
        ? panel.title ?? "Agent details"
        : panel.type === "skill"
          ? panel.title ?? "Skill details"
          : panel.type === "task"
            ? panel.title ?? "Task details"
            : "";

  const panelSubtitle =
    panel.type === "project" || panel.type === "agent" || panel.type === "skill"
      ? panel.slug
      : panel.type === "task"
        ? panel.subtitle
        : undefined;

  const detailEntityType =
    panel.type === "agent"
      ? "agent"
      : panel.type === "project"
        ? "project"
        : panel.type === "skill"
          ? "skill"
          : panel.type === "task"
            ? "task"
            : null;
  const detailSlug =
    panel.type === "agent" || panel.type === "project" || panel.type === "skill"
      ? panel.slug
      : panel.type === "task"
        ? panel.id
        : null;

  return (
    <PanelContext.Provider
      value={{ openGoal, openProject, openAgent, openSkill, openTask, close, onEntityNotFound, markEntityDeleted }}
    >
      {children}
      <DetailPanelProvider entityType={detailEntityType} slug={detailSlug}>
        <DetailFloatingPanel
          open={panel.type !== "closed"}
          onClose={close}
          title={panelTitle}
          subtitle={panelSubtitle}
          showDetailActions={detailEntityType !== null}
        >
          {panel.type === "project" && <ProjectDetailContent slug={panel.slug} />}
          {panel.type === "agent" && <AgentDetailContent slug={panel.slug} />}
          {panel.type === "skill" && <SkillDetailContent slug={panel.slug} />}
          {panel.type === "task" && (
            <WorkItemDetailContent id={panel.id} initialTab={panel.initialTab} />
          )}
        </DetailFloatingPanel>
      </DetailPanelProvider>
    </PanelContext.Provider>
  );
}
