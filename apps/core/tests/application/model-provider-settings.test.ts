import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import {
  resolveModelProviderSettings,
  saveModelProviderSettings,
} from "../../src/application/settings/model-provider.js";

describe("model provider settings", () => {
  let dir = "";
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  function context() {
    dir = mkdtempSync(join(tmpdir(), "kampaku-model-settings-"));
    const config = loadConfig({
      dataDir: dir,
      dbPath: join(dir, "kampaku.db"),
      freellmapiBaseUrl: "http://localhost:3001/v1",
      freellmapiApiKey: "env-token",
      agentModel: "auto",
    });
    return { config, store: new Store(createDb(config.dbPath).db) };
  }

  it("uses environment configuration until the user saves an override", () => {
    const { store, config } = context();
    expect(resolveModelProviderSettings(store, config)).toMatchObject({ baseUrl: "http://localhost:3001/v1", apiKey: "env-token", model: "auto" });

    const response = saveModelProviderSettings(store, config, { provider: "Local", baseUrl: "http://127.0.0.1:4000/v1", apiKey: "byot", model: "custom-model" });
    expect(response).toEqual({ provider: "Local", protocol: "openai-v1", baseUrl: "http://127.0.0.1:4000/v1", model: "custom-model", apiKeyConfigured: true });
    expect(response).not.toHaveProperty("apiKey");
    expect(resolveModelProviderSettings(store, config).apiKey).toBe("byot");
  });

  it("rejects endpoints that are not OpenAI v1 URLs", () => {
    const { store, config } = context();
    expect(() => saveModelProviderSettings(store, config, { baseUrl: "http://localhost:3001" })).toThrow(/end in \/v1/);
  });
});
