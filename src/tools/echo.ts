import type { JobInput } from "../worker-api/client.js";

export async function runEchoExecutor(
  input: JobInput,
  sandboxPath: string,
): Promise<{
  status: "succeeded";
  output: Record<string, unknown>;
}> {
  return {
    status: "succeeded",
    output: {
      summary: `[echo] Would run prompt in ${sandboxPath}: ${input.prompt}`,
      executor: "echo",
      repositoryRole: input.repositoryRole,
    },
  };
}
