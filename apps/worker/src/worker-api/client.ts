import { z } from "zod";
import { createJobControl as buildJobControl } from "../job-runner/control.js";
import type { JobControl } from "../job-runner/control.js";

const allowedFolderSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1),
  label: z.string().optional(),
  readOnly: z.boolean().optional(),
});

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
  modelProvider: z.object({
    provider: z.string().min(1),
    protocol: z.literal("openai-v1"),
    baseUrl: z.string().url(),
    apiKey: z.string().optional(),
    model: z.string().min(1),
  }).optional(),
});

export type JobInput = z.infer<typeof jobInputSchema>;

export interface LeasedJob {
  id: string;
  taskId: string;
  leaseId: string;
  leaseExpiresAt: string;
  capabilities: string[];
  input: JobInput;
}

export interface JobResultPayload {
  jobId: string;
  leaseId: string;
  status: "succeeded" | "failed" | "cancelled" | "expired";
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  finishedAt: string;
}

export interface JobProgressReporter {
  log(line: string): void;
}

export interface JobExecutionContext {
  jobId: string;
  leaseId: string;
  progress: JobProgressReporter;
  control?: JobControl;
}

export class CoreClient {
  constructor(
    private readonly coreUrl: string,
    private readonly workerId: string,
  ) {}

  get baseUrl(): string {
    return this.coreUrl;
  }

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

  async leaseJob(): Promise<LeasedJob | null> {
    return this.leaseJobOnce(false);
  }

  /** Re-register when core wiped workers (e.g. reset-all) then retry once. */
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

  createProgressReporter(jobId: string, leaseId: string): JobProgressReporter {
    return {
      log: (line: string) => {
        void this.reportProgress(jobId, leaseId, line).catch(() => undefined);
      },
    };
  }

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

  async getJobStatus(jobId: string): Promise<{ status: string } | null> {
    const res = await fetch(`${this.coreUrl}/api/v1/jobs/${jobId}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Job status failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<{ status: string }>;
  }

  createJobControl(jobId: string): JobControl {
    return buildJobControl(() => this.getJobStatus(jobId));
  }
}
