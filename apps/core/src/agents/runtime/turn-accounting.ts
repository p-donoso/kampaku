/**
 * Where a turn's time went.
 *
 * This module is the accounting half of two measured defects that share one cause: the product knew how long
 * a turn took and nothing about what it spent the time on.
 *
 * - **F-060.** Measured 2026-09-26 taking suite 07 (run 3): prompt 1 ran **955 s over five in-turn model
 *   calls**, and the same endpoint with the same system prompt and the same question answered in **3.1 s**
 *   when called directly. The turn's reply said how many calls it made and nothing about their latency, so
 *   neither the operator nor the suite could tell a slow endpoint from slow work. Two candidate mechanisms
 *   are indistinguishable without per-call numbers: provider latency varying hour to hour, and
 *   `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS` (120 s) × 8 = 960 s ≈ the 955 s observed.
 * - **F-060, one level up.** Measured 2026-09-28 taking suite 07 (run 16): a **60-minute** turn reported
 *   *"1 model calls and 1 tool calls"* while the single session it delegated to made **5 model calls and 17
 *   tool calls**. The turn's counters did not cross the session boundary, so the stop under-reported the
 *   work by 4× on model calls and 17× on tool calls — and at that point the only account of the run was the
 *   account that was wrong.
 *
 * The shape that answers both: every model call records its latency and attempt count; every tool call
 * records how long it took; a delegated session reports its own totals back through the tool result; and the
 * turn sums them. The numbers are then printed on the meta line an operator actually reads, not only in a
 * log.
 */

/** One model call, as the callee measured it. */
export interface ModelCallRecord {
  latencyMs: number;
  /** 1 unless the endpoint failed and the call was retried. */
  attempts: number;
}

/** One tool call, and the session usage it reported if it started one. */
export interface ToolCallRecord {
  name: string;
  elapsedMs: number;
  /** Model calls the tool's own nested session made. Absent when the tool starts no session. */
  nestedModelCalls?: number;
  /** Wall clock the nested session spent, which is time inside this turn that the turn did not spend. */
  nestedElapsedMs?: number;
}

/**
 * A turn's or a session's spend, in the terms an operator asks about.
 *
 * `modelLatencyMs` is deliberately **not** the same as `elapsedMs`, and the difference is the point: the
 * remainder is tool time, and a large remainder is a nested session rather than a slow endpoint.
 */
export interface TurnAccounting {
  elapsedMs: number;
  modelCalls: number;
  /** Sum of every model call's wall clock, including retried attempts. */
  modelLatencyMs: number;
  slowestCallMs: number;
  /** Model calls that needed more than one attempt, which is the retry policy's visible effect. */
  retriedCalls: number;
  toolCalls: number;
  /** Wall clock across this turn's own tool calls, including nested sessions. */
  toolLatencyMs: number;
  /** Model calls made by sessions this turn delegated to. Counted here, not in the caller (F-060). */
  nestedModelCalls: number;
  nestedElapsedMs: number;
  /** Which tool held the most time, when one did. */
  slowestTool?: { name: string; elapsedMs: number };
}

export function emptyAccounting(): TurnAccounting {
  return {
    elapsedMs: 0,
    modelCalls: 0,
    modelLatencyMs: 0,
    slowestCallMs: 0,
    retriedCalls: 0,
    toolCalls: 0,
    toolLatencyMs: 0,
    nestedModelCalls: 0,
    nestedElapsedMs: 0,
  };
}

export class TurnAccountingBuilder {
  private readonly accounting = emptyAccounting();

  private readonly toolTotals = new Map<string, number>();

  modelCall(record: ModelCallRecord): void {
    this.accounting.modelCalls += 1;
    this.accounting.modelLatencyMs += record.latencyMs;
    if (record.latencyMs > this.accounting.slowestCallMs) {
      this.accounting.slowestCallMs = record.latencyMs;
    }
    if (record.attempts > 1) this.accounting.retriedCalls += 1;
  }

  toolCall(record: ToolCallRecord): void {
    this.accounting.toolCalls += 1;
    this.accounting.toolLatencyMs += record.elapsedMs;
    this.toolTotals.set(record.name, (this.toolTotals.get(record.name) ?? 0) + record.elapsedMs);
    this.accounting.nestedModelCalls += record.nestedModelCalls ?? 0;
    this.accounting.nestedElapsedMs += record.nestedElapsedMs ?? 0;
  }

  /** Total model calls the turn paid for, its own and every nested session's. */
  totalModelCalls(): number {
    return this.accounting.modelCalls + this.accounting.nestedModelCalls;
  }

  finish(startedAt: number): TurnAccounting {
    const slowest = [...this.toolTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      ...this.accounting,
      elapsedMs: Date.now() - startedAt,
      slowestTool: slowest
        ? { name: slowest[0], elapsedMs: slowest[1] }
        : this.accounting.slowestTool,
    };
  }

  /** A snapshot that can be rendered mid-loop, for the stops that return before the loop ends. */
  snapshot(startedAt: number): TurnAccounting {
    return this.finish(startedAt);
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

/**
 * The one-line account of a turn, for the meta line and for the budget stop.
 *
 * Written for the operator's question — *"where did my forty minutes go?"* — so it leads with the split
 * between model time and everything else, names the slowest single call, and states nested sessions
 * separately instead of folding them in. When a nested session made most of the calls, that is the fact the
 * reader needs, and it is invisible in a merged total.
 */
export function renderAccounting(accounting: TurnAccounting): string {
  const parts: string[] = [];
  parts.push(`${seconds(accounting.elapsedMs)} total`);
  const ownCalls = `${accounting.modelCalls} model call${accounting.modelCalls === 1 ? "" : "s"}`;
  parts.push(
    accounting.modelCalls > 0
      ? `${ownCalls} in ${seconds(accounting.modelLatencyMs)} (slowest ${seconds(accounting.slowestCallMs)})`
      : ownCalls,
  );
  if (accounting.retriedCalls > 0) parts.push(`${accounting.retriedCalls} retried`);
  if (accounting.toolCalls > 0) {
    const slowest = accounting.slowestTool
      ? `, slowest ${accounting.slowestTool.name} ${seconds(accounting.slowestTool.elapsedMs)}`
      : "";
    parts.push(`${accounting.toolCalls} tool call${accounting.toolCalls === 1 ? "" : "s"}${slowest}`);
  }
  if (accounting.nestedModelCalls > 0 || accounting.nestedElapsedMs > 0) {
    parts.push(
      `delegated sessions: ${accounting.nestedModelCalls} model call` +
        `${accounting.nestedModelCalls === 1 ? "" : "s"} in ${seconds(accounting.nestedElapsedMs)}`,
    );
  }
  return parts.join(" · ");
}
