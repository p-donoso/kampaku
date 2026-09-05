import type { Store } from "../persistence/store.js";
import { KAMPAKU_AGENT_ID, loadKampakuDefinition } from "../agents/definitions.js";

export function bootstrapKampakuAgent(store: Store) {
  const existing = store.getBootstrapState<{ agentId: string; slug: string }>("kampaku_agent");
  const definition = loadKampakuDefinition();

  if (existing?.slug === definition.slug) {
    return { agentId: existing.agentId, slug: definition.slug, created: false };
  }

  store.setBootstrapState("kampaku_agent", {
    agentId: KAMPAKU_AGENT_ID,
    slug: definition.slug,
  });

  return { agentId: KAMPAKU_AGENT_ID, slug: definition.slug, created: true };
}
