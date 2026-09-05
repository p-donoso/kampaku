"use client";

import { Badge, CELL_NOTES, cellId, PALETTE_IDS, PALETTE_LABELS, type PaletteId } from "@/components/dev/logo-mark";
import { ImperialSealMark } from "@/components/ui/imperial-seal-logo";

type DesignMatrixCellProps = {
  palette: PaletteId;
  theme: "dark" | "light";
  selected: boolean;
  onSelect: () => void;
};

export function DesignMatrixCell({ palette, theme, selected, onSelect }: DesignMatrixCellProps) {
  const id = cellId(palette);

  return (
    <button
      type="button"
      onClick={onSelect}
      data-palette={PALETTE_IDS[palette]}
      data-theme={theme}
      className={`flex w-full flex-col overflow-hidden rounded-xl border text-left transition-shadow ${
        selected ? "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--bg-base)]" : ""
      }`}
      style={{
        backgroundColor: "var(--bg-base)",
        borderColor: "var(--border-default)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
      >
        <span className="font-mono text-xs font-semibold" style={{ color: "var(--brand-gold, var(--brand))" }}>
          {id}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {PALETTE_LABELS[palette]}
        </span>
      </div>

      <div className="flex min-h-[420px]">
        {/* Sidebar */}
        <div
          className="flex w-[92px] shrink-0 flex-col border-r p-2"
          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
        >
          <div className="mb-2 flex flex-col items-center gap-0.5">
            <ImperialSealMark size="sm" />
            <div className="text-center">
              <div className="text-[7px] font-semibold" style={{ color: "var(--brand-gold, var(--brand))" }}>
                Kampaku
              </div>
              <div className="text-[6px]" style={{ color: "var(--text-muted)" }}>Control Plane</div>
            </div>
          </div>
          {["Dashboard", "Projects", "Agents"].map((item, i) => (
            <div
              key={item}
              className="mb-0.5 rounded px-1.5 py-1 text-[7px]"
              style={{
                backgroundColor: i === 0 ? "var(--brand-subtle)" : undefined,
                borderLeft: i === 0 ? "2px solid var(--brand)" : undefined,
                color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {item}
            </div>
          ))}
          <div className="mt-auto flex items-center gap-1 pt-1 text-[6px]" style={{ color: "var(--text-muted)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--success)" }} />
            Online
          </div>
        </div>

        {/* Main + samples */}
        <div className="min-w-0 flex-1 p-2">
          <div className="mb-1.5">
            <div className="text-[10px] font-semibold">Dashboard</div>
            <div className="text-[7px]" style={{ color: "var(--text-muted)" }}>Project management and execution</div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-1">
            <StatSnippet label="Core" value="Online" accent="var(--success)" />
            <StatSnippet label="Projects" value="3" />
            <StatSnippet label="Questions" value="1" accent="var(--warning)" />
            <StatSnippet label="Blockers" value="0" />
          </div>

          <div
            className="mb-2 rounded border p-1.5"
            style={{
              borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border-default))",
              backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
            }}
          >
            <div className="text-[6px] font-medium uppercase tracking-wide" style={{ color: "var(--warning)" }}>
              Needs attention
            </div>
            <div className="text-[7px]" style={{ color: "var(--text-secondary)" }}>Approve deployment?</div>
          </div>

          {/* Table sample */}
          <div className="mb-2 overflow-hidden rounded border text-[7px]" style={{ borderColor: "var(--border-default)" }}>
            <div className="grid grid-cols-3 gap-1 px-1.5 py-1 font-medium uppercase tracking-wide" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}>
              <span>Project</span>
              <span>Status</span>
              <span>Tasks</span>
            </div>
            {[
              ["apps/web", "Running", "12"],
              ["my-app", "Idle", "4"],
            ].map(([name, status, tasks]) => (
              <div key={name} className="grid grid-cols-3 gap-1 border-t px-1.5 py-1" style={{ borderColor: "var(--border-default)" }}>
                <span className="truncate font-medium">{name}</span>
                <span style={{ color: "var(--success)" }}>{status}</span>
                <span style={{ color: "var(--text-secondary)" }}>{tasks}</span>
              </div>
            ))}
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            <Badge color="var(--success)">Running</Badge>
            <Badge color="var(--info)">In progress</Badge>
          </div>

          {/* Floating panel sample */}
          <div
            className="relative rounded border p-1.5"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[8px] font-semibold">Project detail</span>
              <span className="text-[6px]" style={{ color: "var(--text-muted)" }}>panel</span>
            </div>
            <div className="mb-1 flex gap-2 border-b pb-1 text-[6px]" style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
              <span style={{ color: "var(--brand)", borderBottom: "1px solid var(--brand)" }}>Summary</span>
              <span>Tasks</span>
              <span>Wiki</span>
            </div>
            <div className="text-[7px]" style={{ color: "var(--text-secondary)" }}>Execution phase: planning</div>
          </div>

          <div
            className="mt-2 inline-block rounded px-2 py-0.5 text-[7px] font-medium"
            style={{ backgroundColor: "var(--brand)", color: "var(--bg-base)" }}
          >
            Primary action
          </div>
        </div>
      </div>

      <p className="border-t px-3 py-2 text-[9px] leading-snug" style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
        {CELL_NOTES[id]}
      </p>
    </button>
  );
}

function StatSnippet({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded border px-1.5 py-1" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
      <div className="text-[6px]" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-xs font-semibold" style={{ color: accent ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
