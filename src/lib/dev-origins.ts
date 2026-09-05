const DEFAULT_DEV_ORIGINS = ["127.0.0.1", "localhost"] as const;

/** Builds the Next.js allowedDevOrigins list for dev HMR/client chunks. */
export function resolveAllowedDevOrigins(envValue?: string): string[] {
  const extra =
    envValue
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];

  return [...new Set([...DEFAULT_DEV_ORIGINS, ...extra])];
}

export { DEFAULT_DEV_ORIGINS };
