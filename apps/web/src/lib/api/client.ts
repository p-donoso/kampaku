import { toApiError } from "../api-errors";

/**
 * Resolves the API base URL based on execution environment (browser vs SSR).
 * @returns Base URL prefix for API requests.
 */
export function getBaseUrl(): string {
  // Browser: same-origin proxy via next.config rewrites (avoids localhost vs 127.0.0.1).
  if (typeof window !== "undefined") return "";
  // SSR: talk to core directly.
  return (
    process.env.KAMPAKU_CORE_URL ??
    process.env.NEXT_PUBLIC_KAMPAKU_API_URL ??
    "http://127.0.0.1:28080"
  ).replace(/\/$/, "");
}

/**
 * Performs an HTTP request with JSON serialization and consistent error handling.
 * @param path - API path.
 * @param init - Request options.
 * @returns Deserialized JSON response.
 */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw toApiError(path, res.status, body);
  }
  return res.json() as Promise<T>;
}
