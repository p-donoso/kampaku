import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { PmStore } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";
import { syncWorkItemFromJobResult } from "../pm/execute-work-item.js";

export type ControlledBatchSpec = {
  count: number;
  delayMs: number;
  relativeDir: string;
  filePrefix?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function assertRelativeDir(relativeDir: string): string {
  const trimmed = relativeDir.trim().replace(/^\.\//, "");
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("..")) {
    throw new Error("controlled_batch relative_dir must be a safe relative path.");
  }
  return trimmed;
}

/**
 * Interruptible batch writer for durable-execution lab/oracle paths.
 * Checks job status between files so cancel stops further writes.
 */
export async function runControlledBatch(params: {
  store: Store;
  pmStore: PmStore;
  jobId: string;
  workItemId?: string;
  repositoryPath: string;
  spec: ControlledBatchSpec;
}): Promise<{ written: number; stoppedReason: string; status: string }> {
  const relativeDir = assertRelativeDir(params.spec.relativeDir);
  const count = Math.max(1, Math.min(params.spec.count, 500));
  const delayMs = Math.max(0, Math.min(params.spec.delayMs, 10_000));
  const filePrefix = (params.spec.filePrefix ?? "chunk").replace(/[^\w.-]/g, "_");
  const targetDir = resolve(params.repositoryPath, relativeDir);
  const root = resolve(params.repositoryPath);
  if (targetDir !== root && !targetDir.startsWith(`${root}${sep}`)) {
    throw new Error("controlled_batch refused to write outside the repository path.");
  }

  mkdirSync(targetDir, { recursive: true });
  params.store.appendJobLog(
    params.jobId,
    `Controlled batch started: ${count} files under ${relativeDir} (delay ${delayMs}ms).`,
  );

  let written = 0;
  for (let index = 1; index <= count; index += 1) {
    const job = params.store.getJob(params.jobId);
    if (!job) {
      return { written, stoppedReason: "job_missing", status: "failed" };
    }
    if (job.status === "cancelled" || job.status === "expired" || job.status === "failed") {
      params.store.appendJobLog(
        params.jobId,
        `Controlled batch stopped at ${written}/${count} (${job.status}).`,
      );
      return { written, stoppedReason: job.status, status: job.status };
    }
    if (job.status === "paused") {
      params.store.appendJobLog(params.jobId, `Controlled batch paused at ${written}/${count}.`);
      return { written, stoppedReason: "paused", status: "paused" };
    }

    const fileName = `${filePrefix}-${String(index).padStart(4, "0")}.txt`;
    writeFileSync(join(targetDir, fileName), `chunk ${index} of ${count}\n`, "utf8");
    written += 1;
    params.store.appendJobLog(params.jobId, `Wrote ${relativeDir}/${fileName}`);

    if (delayMs > 0 && index < count) {
      await sleep(delayMs);
    }
  }

  const finishedAt = new Date().toISOString();
  const latest = params.store.getJob(params.jobId);
  if (!latest || latest.status !== "running") {
    params.store.appendJobLog(
      params.jobId,
      `Controlled batch finished writing ${written}/${count} but job is already ${latest?.status ?? "missing"}; not overwriting terminal status.`,
    );
    return {
      written,
      stoppedReason: latest?.status ?? "job_missing",
      status: latest?.status ?? "failed",
    };
  }

  params.store.submitJobResult({
    jobId: params.jobId,
    leaseId: latest.leaseId ?? `controlled-batch-${params.jobId}`,
    status: "succeeded",
    output: {
      executor: "controlled_batch",
      written,
      relativeDir,
      repositoryPath: params.repositoryPath,
    },
    finishedAt,
  });
  params.store.appendJobLog(params.jobId, `Controlled batch succeeded (${written} files).`);
  if (params.workItemId) {
    syncWorkItemFromJobResult(params.pmStore, params.jobId, "succeeded");
  }
  return { written, stoppedReason: "completed", status: "succeeded" };
}
