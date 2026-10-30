import type { Hono } from "hono";
import type { Store } from "../persistence/store.js";
import type { AppConfig } from "../config.js";
import type { Db } from "../persistence/db.js";
import { resetAllData, resetBootstrapAgents } from "../application/system-reset.js";
import {
  addAllowedFolder,
  describeFilesystemBoundaries,
  getFilesystemSettings,
  removeAllowedFolder,
  updateAllowedFolder,
} from "../application/settings/filesystem.js";
import {
  getGlobalSystemPromptSettings,
  saveGlobalSystemPromptSettings,
} from "../application/settings/global-system-prompt.js";
import {
  resolveModelProviderSettings,
  saveModelProviderSettings,
  toPublicModelProviderSettings,
} from "../application/settings/model-provider.js";

export function registerSettingsRoutes(app: Hono, store: Store, config: AppConfig, db?: Db) {
  app.get("/api/v1/settings/model-provider", (c) => {
    return c.json(toPublicModelProviderSettings(resolveModelProviderSettings(store, config)));
  });

  app.put("/api/v1/settings/model-provider", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(saveModelProviderSettings(store, config, body));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid model provider settings" }, 400);
    }
  });

  app.get("/api/v1/settings/global-system-prompt", (c) => {
    return c.json(getGlobalSystemPromptSettings(store));
  });

  app.put("/api/v1/settings/global-system-prompt", async (c) => {
    const body = await c.req.json<{ prompt?: string }>();
    try {
      return c.json(saveGlobalSystemPromptSettings(store, body.prompt ?? ""));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid prompt" }, 400);
    }
  });

  app.post("/api/v1/settings/reset-bootstrap", async (c) => {
    if (!db) return c.json({ error: "Reset operations are unavailable." }, 503);
    const body: { keepLearnings?: boolean } = await c.req.json<{ keepLearnings?: boolean }>().catch(() => ({}));
    try {
      return c.json(resetBootstrapAgents(store, config, db, body.keepLearnings === true));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Bootstrap reset failed" }, 409);
    }
  });

  app.post("/api/v1/settings/reset-all", (c) => {
    if (!db) return c.json({ error: "Reset operations are unavailable." }, 503);
    try {
      return c.json(resetAllData(store, config, db));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Full reset failed" }, 500);
    }
  });

  app.get("/api/v1/settings/filesystem", (c) => {
    // `folders` stays first and unchanged, because it is the field five surfaces already read. `refused` is the
    // half that was missing: an operator can see what is **not** reachable without reading the code path that
    // would refuse it, which is what suite 14's fourth prompt asks for (BOARD F-015).
    const boundaries = describeFilesystemBoundaries(store);
    return c.json({ folders: boundaries.granted, refused: boundaries.refused });
  });

  app.post("/api/v1/settings/filesystem/folders", async (c) => {
    const body = await c.req.json();
    try {
      const settings = addAllowedFolder(store, {
        path: body.path,
        label: body.label,
        readOnly: body.readOnly,
        // A grant that crosses the boundary must say so in its own field. Anything else is the refusal, and the
        // refusal names the boundary rather than answering a bare 400.
        allowOutsideProjectScope: body.allowOutsideProjectScope === true,
      });
      return c.json(settings, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid folder";
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/api/v1/settings/filesystem/folders/:folderId", (c) => {
    const folderId = c.req.param("folderId");
    try {
      const settings = removeAllowedFolder(store, folderId);
      return c.json(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Folder not found";
      return c.json({ error: message }, 404);
    }
  });

  app.patch("/api/v1/settings/filesystem/folders/:folderId", async (c) => {
    const folderId = c.req.param("folderId");
    const body = await c.req.json();
    try {
      const settings = updateAllowedFolder(store, folderId, {
        label: body.label,
        readOnly: body.readOnly,
      });
      return c.json(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Folder not found";
      return c.json({ error: message }, 404);
    }
  });
}
