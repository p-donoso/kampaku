import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceEnv } from "../../src/cli/context.js";
import {
  probeFreellmapiInference,
  validateFreellmapiKey,
} from "../../src/cli/freellmapi-dev.js";
import { describeFreellmapiInferenceError } from "../../src/model-broker/freellmapi-errors.js";

describe("loadWorkspaceEnv", () => {
  let workspace: string;
  const previousFreellm = process.env.FREELLMAPI_API_KEY;
  const previousKampaku = process.env.KAMPAKU_AGENT;
  const previousOverride = process.env.KAMPAKU_DOTENV_OVERRIDE;

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    if (previousFreellm === undefined) delete process.env.FREELLMAPI_API_KEY;
    else process.env.FREELLMAPI_API_KEY = previousFreellm;
    if (previousKampaku === undefined) delete process.env.KAMPAKU_AGENT;
    else process.env.KAMPAKU_AGENT = previousKampaku;
    if (previousOverride === undefined) delete process.env.KAMPAKU_DOTENV_OVERRIDE;
    else process.env.KAMPAKU_DOTENV_OVERRIDE = previousOverride;
  });

  it("preserves explicit environment values for isolated eval runs", () => {
    workspace = mkdtempSync(join(tmpdir(), "kampaku-env-"));
    process.env.KAMPAKU_DOTENV_OVERRIDE = "0";
    process.env.KAMPAKU_AGENT = "stub";
    writeFileSync(join(workspace, ".env"), "KAMPAKU_AGENT=llm\n");

    loadWorkspaceEnv(workspace);

    expect(process.env.KAMPAKU_AGENT).toBe("stub");
  });

  it("overrides KAMPAKU_ and FREELLMAPI_ keys from workspace .env", () => {
    workspace = mkdtempSync(join(tmpdir(), "kampaku-env-"));
    process.env.FREELLMAPI_API_KEY = "stale-key";
    process.env.KAMPAKU_AGENT = "stub";
    writeFileSync(
      join(workspace, ".env"),
      "FREELLMAPI_API_KEY=from-env-file\nKAMPAKU_AGENT=llm\n",
    );

    loadWorkspaceEnv(workspace);

    expect(process.env.FREELLMAPI_API_KEY).toBe("from-env-file");
    expect(process.env.KAMPAKU_AGENT).toBe("llm");
  });
});

describe("validateFreellmapiKey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when models endpoint accepts the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await expect(
      validateFreellmapiKey("http://localhost:3001/v1", "freellmapi-test"),
    ).resolves.toBe(true);
  });

  it("returns false on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false }),
    );

    await expect(
      validateFreellmapiKey("http://localhost:3001/v1", "bad-key"),
    ).resolves.toBe(false);
  });
});

describe("probeFreellmapiInference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok when chat completions succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await expect(
      probeFreellmapiInference("http://localhost:3001/v1", "freellmapi-test"),
    ).resolves.toEqual({ ok: true });
  });

  it("returns provider error message from response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () =>
          JSON.stringify({
            error: { message: "All models exhausted: no usable key configured" },
          }),
      }),
    );

    await expect(
      probeFreellmapiInference("http://localhost:3001/v1", "freellmapi-test"),
    ).resolves.toEqual({
      ok: false,
      reason: "All models exhausted: no usable key configured",
    });
  });
});

describe("describeFreellmapiInferenceError", () => {
  it("explains missing upstream provider keys", () => {
    expect(
      describeFreellmapiInferenceError("All models exhausted: no usable key configured"),
    ).toContain("upstream provider keys");
  });
});
