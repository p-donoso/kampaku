import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceEnv } from "../../src/cli/context.js";
import {
  probeEndpointInference,
  validateEndpointKey,
} from "../../src/cli/dev-endpoint.js";
import { describeEndpointError } from "../../src/model-broker/endpoint-errors.js";

describe("loadWorkspaceEnv", () => {
  let workspace: string;
  const previousFreellm = process.env.KAMPAKU_MODEL_API_KEY;
  const previousKampaku = process.env.KAMPAKU_AGENT;
  const previousOverride = process.env.KAMPAKU_DOTENV_OVERRIDE;

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    if (previousFreellm === undefined) delete process.env.KAMPAKU_MODEL_API_KEY;
    else process.env.KAMPAKU_MODEL_API_KEY = previousFreellm;
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

  it("overrides KAMPAKU_ and KAMPAKU_MODEL_ keys from workspace .env", () => {
    workspace = mkdtempSync(join(tmpdir(), "kampaku-env-"));
    process.env.KAMPAKU_MODEL_API_KEY = "stale-key";
    process.env.KAMPAKU_AGENT = "stub";
    writeFileSync(
      join(workspace, ".env"),
      "KAMPAKU_MODEL_API_KEY=from-env-file\nKAMPAKU_AGENT=llm\n",
    );

    loadWorkspaceEnv(workspace);

    expect(process.env.KAMPAKU_MODEL_API_KEY).toBe("from-env-file");
    expect(process.env.KAMPAKU_AGENT).toBe("llm");
  });
});

describe("validateEndpointKey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when models endpoint accepts the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await expect(
      validateEndpointKey("http://localhost:3001/v1", "endpoint-test"),
    ).resolves.toBe(true);
  });

  it("returns false on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false }),
    );

    await expect(
      validateEndpointKey("http://localhost:3001/v1", "bad-key"),
    ).resolves.toBe(false);
  });
});

describe("probeEndpointInference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok when chat completions succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await expect(
      probeEndpointInference("http://localhost:3001/v1", "endpoint-test"),
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
      probeEndpointInference("http://localhost:3001/v1", "endpoint-test"),
    ).resolves.toEqual({
      ok: false,
      reason: "All models exhausted: no usable key configured",
    });
  });
});

describe("describeEndpointError", () => {
  it("explains missing upstream provider keys", () => {
    expect(
      describeEndpointError("All models exhausted: no usable key configured"),
    ).toContain("upstream provider keys");
  });
});
