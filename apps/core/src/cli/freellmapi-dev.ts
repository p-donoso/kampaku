import { execSync } from "node:child_process";
import { describeFreellmapiInferenceError } from "../model-broker/freellmapi-errors.js";

function freellmapiModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/v1") ? `${trimmed}/models` : `${trimmed}/v1/models`;
}

function freellmapiChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/v1")
    ? `${trimmed}/chat/completions`
    : `${trimmed}/v1/chat/completions`;
}

export async function validateFreellmapiKey(
  baseUrl: string,
  apiKey: string | undefined,
): Promise<boolean> {
  if (!apiKey?.trim()) return false;

  try {
    const res = await fetch(freellmapiModelsUrl(baseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function probeFreellmapiInference(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(freellmapiChatUrl(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "auto",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      return { ok: true };
    }

    const body = await res.text();
    let reason = body;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      reason = parsed.error?.message ?? body;
    } catch {
      // Keep raw body.
    }

    return { ok: false, reason };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function readFreellmapiKeyFromContainer(workspace: string): string | undefined {
  try {
    const containerId = execSync("docker compose ps -q freellmapi", {
      cwd: workspace,
      encoding: "utf8",
    }).trim();
    if (!containerId) return undefined;

    const key = execSync(
      `docker exec ${containerId} node -e "const Database=require('better-sqlite3');const db=new Database('/app/server/data/freeapi.db',{readonly:true});const row=db.prepare('SELECT value FROM settings WHERE key=?').get('unified_api_key');process.stdout.write(row?.value??'');"`,
      { encoding: "utf8" },
    ).trim();

    return key || undefined;
  } catch {
    return undefined;
  }
}

export async function waitForFreellmapi(
  baseUrl: string,
  timeoutMs = 60_000,
): Promise<boolean> {
  const pingUrl = baseUrl.replace(/\/v1\/?$/, "/api/ping");
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(pingUrl, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return true;
    } catch {
      // FreeLLMApi is still starting.
    }
    await sleep(500);
  }

  return false;
}

export async function resolveFreellmapiKeyForDev(
  workspace: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const baseUrl = env.FREELLMAPI_BASE_URL ?? "http://localhost:3001/v1";
  const configuredKey = env.FREELLMAPI_API_KEY;

  let resolvedKey = configuredKey;

  if (!(await validateFreellmapiKey(baseUrl, resolvedKey))) {
    const containerKey = readFreellmapiKeyFromContainer(workspace);
    if (containerKey && (await validateFreellmapiKey(baseUrl, containerKey))) {
      resolvedKey = containerKey;
      env.FREELLMAPI_API_KEY = containerKey;
      console.log(
        "FreeLLMApi: using unified API key from container (update FREELLMAPI_API_KEY in .env to persist)",
      );
    }
  }

  if (resolvedKey && (await validateFreellmapiKey(baseUrl, resolvedKey))) {
    const probe = await probeFreellmapiInference(baseUrl, resolvedKey);
    if (!probe.ok) {
      console.warn("");
      console.warn("FreeLLMApi unified key is valid, but inference is not ready.");
      console.warn(`  ${describeFreellmapiInferenceError(probe.reason)}`);
      console.warn("");
    }
    return;
  }

  const suffix = configuredKey ? `…${configuredKey.slice(-8)}` : "(not set)";
  console.warn("");
  console.warn("FreeLLMApi API key mismatch or missing.");
  console.warn(`  Configured key: ${suffix}`);
  console.warn("  Copy the current unified key from http://localhost:3001 into FREELLMAPI_API_KEY in .env");
  console.warn("  Restart `kampaku dev` after updating .env.");
  console.warn("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
