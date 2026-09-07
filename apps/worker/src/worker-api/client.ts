/**
 * @module worker-api/client
 * Typed HTTP client and schemas for communicating with Kampaku Core from the Worker execution plane.
 */

import { z } from "zod";
import { createJobControl as buildJobControl } from "../job-runner/control.js";
import type { JobControl } from "../job-runner/control.js";

/** Schema validating folder boundaries allowed in a filesystem policy */
const allowedFolderSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1),
  label: z.string().optional(),
  readOnly: z.boolean().optional(),
});

/** Schema for validating incoming leased job input payloads from Core */
export const jobInputSchema = z.object({
  globalSystemPrompt: z.string().min(1).max(4_000).optional(),
  prompt: z.string().min(1),
  repositoryRole: z.enum(["core", "worker", "contracts", "docs", "web"]),
  repositoryPath: z.string().min(1).optional(),
  workspaceDir: z.string().min(1).optional(),
  requiresDeliverables: z.boolean().optional(),
  requiredChecks: z.array(z.string().min(1)).optional(),
  project: z
    .object({
      id: z.string().uuid(),
      slug: z.string().min(1),
      name: z.string().min(1),
      workItemId: z.string().uuid().optional(),
    })
    .optional(),
  executor: z.enum(["freellmapi", "github", "echo"]).optional(),
  github: z
    .object({
      operation: z.enum(["create_repo"]),
      owner: z.string().min(1),
      name: z.string().min(1),
      private: z.boolean().optional(),
    })
    .optional(),
  context: z
    .object({
      goalId: z.string().uuid().optional(),
      taskId: z.string().uuid().optional(),
    })
    .optional(),
  filesystemPolicy: z
    .object({
      folders: z.array(allowedFolderSchema),
    })
    .optional(),
  modelProvider: z
    .object({
      provider: z.string().min(1),
      protocol: z.literal("openai-v1"),
      baseUrl: z.string().url(),
      apiKey: z.string().optional(),
      model: z.string().min(1),
    })
    .optional(),
});

/** Input definition for a leased execution job */
export type JobInput = z.infer<typeof jobInputSchema>;

/** Leased job record structure returned from Core */
export interface LeasedJob {
  id: string;
  taskId: string;
  leaseId: string;
  leaseExpiresAt: string;
  capabilities: string[];
  input: JobInput;
}

/** Result payload submitted back to Core upon job completion or termination */
export interface JobResultPayload {
  jobId: string;
  leaseId: string;
  status: "succeeded" | "failed" | "cancelled" | "expired";
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  finishedAt: string;
}

/** Interface for reporting real-time progress events back to Core */
export interface JobProgressReporter {
  /** Emit an operational log line for the leased job */
  log(line: string): void;
}

/** Execution context supplied to a running executor session */
export interface JobExecutionContext {
  jobId: string;
  leaseId: string;
  progress: JobProgressReporter;
  control?: JobControl;
}

/**
 * HTTP client managing worker registration, job leasing, progress streaming, and result reporting to Core.
 */
export class CoreClient {
  /**
   * Initializes the Core API client.
   *
   * @param coreUrl - Base URL of the Kampaku Core service.
   * @param workerId - Stable unique identifier for this worker.
   */
  constructor(
    private readonly coreUrl: string,
    private readonly workerId: string,
  ) {}

  /** Base URL for the target Core API */
  get baseUrl(): string {
    return this.coreUrl;
  }

  /**
   * Polls Core health endpoint until it responds successfully or max attempts are exceeded.
   *
   * @param attempts - Maximum number of health check retries (defaults to 30).
   * @throws If Core does not become reachable in time.
   */
  async waitUntilReady(attempts = 30): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(`${this.coreUrl}/api/v1/health`);
        if (res.ok) return;
      } catch {
        // Core may still be starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Core is not reachable");
  }

  /**
   * Registers this worker instance and its declared execution capabilities with Core.
   */
  async registerWorker(): Promise<void> {
    const capabilities = ["code.agent", "cursor.agent"];
    if (process.env.GITHUB_TOKEN) {
      capabilities.push("github.api");
    }

    const res = await fetch(`${this.coreUrl}/api/v1/workers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: this.workerId,
        name: "kampaku-local-worker",
        version: "0.1.0",
        capabilities,
        contractVersion: "0.1.0",
        registeredAt: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      throw new Error(`Worker registration failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * Attempts to lease an available pending job from Core.
   *
   * @returns Leased job details, or null if no matching job is available.
   */
  async leaseJob(): Promise<LeasedJob | null> {
    return this.leaseJobOnce(false);
  }

  /**
   * Internal lease request with auto-re-registration if Core returned 404 (e.g. following database reset).
   */
  private async leaseJobOnce(retriedAfter404: boolean): Promise<LeasedJob | null> {
    const res = await fetch(`${this.coreUrl}/api/v1/workers/${this.workerId}/jobs:lease`, {
      method: "POST",
    });
    if (res.status === 204) return null;
    if (res.status === 404 && !retriedAfter404) {
      await this.registerWorker();
      console.log(`Worker ${this.workerId} re-registered (core data was reset).`);
      return this.leaseJobOnce(true);
    }
    if (!res.ok) {
      throw new Error(`Job lease failed: ${res.status} ${await res.text()}`);
    }
    const job = (await res.json()) as LeasedJob;
    return job;
  }

  /**
   * Submits the final output or failure result for a leased job to Core.
   *
   * @param result - Structured result payload including status, output, and optional error.
   */
  async submitResult(result: JobResultPayload): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/v1/jobs/${result.jobId}/result`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      throw new Error(`Result submission failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * Creates an asynchronous progress reporter bound to a specific leased job.
   *
   * @param jobId - Leased job identifier.
   * @param leaseId - Active lease token identifier.
   */
  createProgressReporter(jobId: string, leaseId: string): JobProgressReporter {
    return {
      log: (line: string) => {
        void this.reportProgress(jobId, leaseId, line).catch(() => undefined);
      },
    };
  }

  /**
   * Posts an incremental progress line to Core.
   *
   * @param jobId - Leased job identifier.
   * @param leaseId - Active lease token identifier.
   * @param line - Progress log message.
   */
  async reportProgress(jobId: string, leaseId: string, line: string): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/v1/jobs/${jobId}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leaseId, line }),
    });
    if (!res.ok) {
      throw new Error(`Progress report failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * Fetches the current lifecycle status for a given job.
   *
   * @param jobId - Target job identifier.
   * @returns Job status record or null if not found.
   */
  async getJobStatus(jobId: string): Promise<{ status: string } | null> {
    const res = await fetch(`${this.coreUrl}/api/v1/jobs/${jobId}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Job status failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<{ status: string }>;
  }

  /**
   * Builds a JobControl instance for inspecting cancellation/pause signals during execution.
   *
   * @param jobId - Target job identifier.
   */
  createJobControl(jobId: string): JobControl {
    return buildJobControl(() => this.getJobStatus(jobId));
  }
}
