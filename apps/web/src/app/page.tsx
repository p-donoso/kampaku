import CloudDoneRounded from "@mui/icons-material/CloudDoneRounded";
import CloudOffRounded from "@mui/icons-material/CloudOffRounded";
import FolderRounded from "@mui/icons-material/FolderRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import Link from "next/link";
import BlockRounded from "@mui/icons-material/BlockRounded";
import { DashboardProjectsOverview } from "@/components/projects/projects-view";
import { DashboardRuntimeStatus } from "@/components/execution/dashboard-runtime-status-card";
import { healthCheck, getProjectsRoster, listQuestions, listBlockers } from "@/lib/api";
import { PendingQuestions } from "@/components/execution/pending-questions-card";
import { PendingBlockers } from "@/components/execution/pending-blockers-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Surface } from "@/components/ui/surface";

export default async function DashboardPage() {
  const online = await healthCheck();
  let projectCount = 0;
  let projects: Awaited<ReturnType<typeof getProjectsRoster>>["projects"] = [];
  let pendingQuestions: Awaited<ReturnType<typeof listQuestions>>["questions"] = [];
  let pendingBlockers: Awaited<ReturnType<typeof listBlockers>>["blockers"] = [];

  if (online) {
    try {
      const [projectsRes, questionsRes, blockersRes] = await Promise.all([
        getProjectsRoster(),
        listQuestions(),
        listBlockers(),
      ]);
      projects = projectsRes.projects;
      projectCount = projects.length;
      pendingQuestions = questionsRes.questions;
      pendingBlockers = blockersRes.blockers;
    } catch {
      /* ignore */
    }
  }

  const needsAttention = pendingQuestions.length + pendingBlockers.length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Project management and execution"
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Core status"
            value={online ? "Online" : "Offline"}
            tone={online ? "success" : "error"}
            icon={online ? <CloudDoneRounded fontSize="inherit" /> : <CloudOffRounded fontSize="inherit" />}
          />
          <StatCard
            label="Projects"
            value={String(projectCount)}
            icon={<FolderRounded fontSize="inherit" />}
          />
          <StatCard
            label="Pending questions"
            value={String(pendingQuestions.length)}
            tone={pendingQuestions.length > 0 ? "warning" : "default"}
            icon={<HelpOutlineRounded fontSize="inherit" />}
            href={pendingQuestions.length > 0 ? "#pending-questions-card" : undefined}
          />
          <StatCard
            label="Pending blockers"
            value={String(pendingBlockers.length)}
            tone={pendingBlockers.length > 0 ? "error" : "default"}
            icon={<BlockRounded fontSize="inherit" />}
          />
        </div>

        <DashboardRuntimeStatus />

        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-secondary">Projects</h2>
              <Link href="/projects" className="text-xs text-brand hover:text-brand-gold">
                View all →
              </Link>
            </div>
            <Surface padding="sm">
              {online ? (
                <DashboardProjectsOverview initialProjects={projects} />
              ) : (
                <p className="text-sm text-muted">
                  Connect the core on :{process.env.KAMPAKU_CORE_PORT ?? "28080"}
                </p>
              )}
            </Surface>
          </section>

          {needsAttention > 0 && (
            <section>
              <div className="mb-3">
                <h2 className="text-sm font-medium text-secondary">Needs your attention</h2>
              </div>
              <div className="space-y-4">
                {pendingBlockers.length > 0 && (
                  <Surface className="border-error/20 bg-error/5" padding="sm">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-error">Blockers</h3>
                    <PendingBlockers initialBlockers={pendingBlockers} />
                  </Surface>
                )}
                {pendingQuestions.length > 0 && (
                  <div id="pending-questions-card" className="scroll-mt-4">
                    <Surface className="border-warning/20 bg-warning/5" padding="sm">
                      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-warning">Questions</h3>
                      <PendingQuestions initialQuestions={pendingQuestions} />
                    </Surface>
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3">
              <h2 className="text-sm font-medium text-secondary">Quick actions</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <QuickLink href="/chat" title="Chat with Kampaku" desc="Plan and delegate projects" />
              <QuickLink href="/projects" title="Manage projects" desc="Status and tasks" />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-surface/30 px-4 py-3 transition-colors hover:border-border hover:bg-elevated/40"
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs text-muted">{desc}</div>
    </Link>
  );
}
