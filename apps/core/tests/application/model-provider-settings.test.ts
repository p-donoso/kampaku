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
      modelBaseUrl: "http://localhost:3001/v1",
      modelApiKey: "env-token",
      agentModel: "auto",
    });
    return { config, store: new Store(createDb(config.dbPath).db) };
  }

  it("the environment wins over a saved value, and the payload names the source of each field", () => {
    const { store } = context();
    // The environment this test's config states: baseUrl, key and model, all three pinned.
    const pinned = loadConfig({
      dataDir: dir,
      dbPath: join(dir, "kampaku.db"),
      modelBaseUrl: "http://localhost:3001/v1",
      modelApiKey: "env-token",
      modelBaseUrlPinned: "http://localhost:3001/v1",
      modelApiKeyPinned: "env-token",
      agentModelPinned: "env-model",
      agentModel: "env-model",
    });
    expect(resolveModelProviderSettings(store, pinned)).toMatchObject({
      baseUrl: "http://localhost:3001/v1",
      apiKey: "env-token",
      model: "env-model",
    });

    const response = saveModelProviderSettings(store, pinned, {
      provider: "Local",
      baseUrl: "http://127.0.0.1:4000/v1",
      apiKey: "byot",
      model: "custom-model",
    });
    // **Inverted, not deleted.** This assertion used to require the saved value to replace the environment's,
    // which is the silent precedence BOARD F-026 measured. The environment is an instruction; a saved value is
    // a preference that fills what the environment does not state.
    expect(resolveModelProviderSettings(store, pinned)).toMatchObject({
      baseUrl: "http://localhost:3001/v1",
      apiKey: "env-token",
      model: "env-model",
    });
    // The save still lands, so removing the environment pins changes what is in force; and the response says
    // which values the environment is holding, so an operator who saves sees why nothing moved.
    expect(response.apiKeyConfigured).toBe(true);
    expect(response.source).toEqual({ baseUrl: "environment", apiKey: "environment", model: "environment" });
    expect(response.note).toContain("explicit environment beats a saved preference");

    const unpinned = loadConfig({ dataDir: dir, dbPath: join(dir, "kampaku.db") });
    expect(resolveModelProviderSettings(store, unpinned)).toMatchObject({
      baseUrl: "http://127.0.0.1:4000/v1",
      apiKey: "byot",
      model: "custom-model",
    });
  });

  it("rejects endpoints that are not OpenAI v1 URLs", () => {
    const { store, config } = context();
    expect(() => saveModelProviderSettings(store, config, { baseUrl: "http://localhost:3001" })).toThrow(/end in \/v1/);
  });
});
