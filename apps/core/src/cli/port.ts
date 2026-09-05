import { execSync } from "node:child_process";

function listListenerPids(port: number): number[] {
  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null`, {
      encoding: "utf8",
    });
    return output
      .trim()
      .split("\n")
      .map((value) => Number(value.trim()))
      .filter((pid) => !Number.isNaN(pid));
  } catch {
    try {
      const output = execSync(`fuser -n tcp ${port} 2>/dev/null`, { encoding: "utf8" });
      return output
        .trim()
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((pid) => !Number.isNaN(pid));
    } catch {
      return [];
    }
  }
}

export function stopListenersOnPort(port: number): number[] {
  const stopped: number[] = [];

  for (const pid of listListenerPids(port)) {
    if (pid === process.pid) continue;

    try {
      process.kill(pid, "SIGTERM");
      stopped.push(pid);
    } catch {
      // Process already exited.
    }
  }

  return stopped;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
