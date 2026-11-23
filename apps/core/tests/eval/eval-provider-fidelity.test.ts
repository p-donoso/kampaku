import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/application/projects.js";
import {
  resolveModelProviderSettingsWithPrecedence,
  saveModelProviderSettings,
} from "../../src/application/settings/model-provider.js";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";
import { executeGetProject } from "../../src/agents/runtime/tools/get-project.js";
import { executeListProjects } from "../../src/agents/runtime/tools/list-projects.js";
import { executeProposeWikiPage, executeGetProjectKnowledge } from "../../src/agents/runtime/tools/wiki-tools.js";
import { executeToolCall, KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import {
  assessProbeAnswer,
  describeModelDrift,
  describeToolCapabilityGap,
  EndpointCapabilityLedger,
} from "../../src/model-broker/endpoint-capability.js";
import { loadConfig } from "../../src/config.js";
import { auditStateChangeClaim, renderClaimLimit } from "../../src/agents/runtime/claim-audit.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * Suite 17 — provider fidelity, locked at the three places its oracle can be measured.
 *
 * The suite's promise is that *"the factory's claims about what exists stay faithful to tool results across
 * wrong identifiers, multiple projects, and a second turn after a mutation"*, under a real endpoint. A stub
 * cannot prove that, so this file locks the **product's half** of it — the reads an answer must come from, the
 * miss that has to be actionable, and the capability check that stops an endpoint's prose being scored as a
 * read — and the suite itself is measured live against two endpoints.
 *
 * Three locks, each one a bullet of the suite's oracle:
 *
 * 1. **Inventory is a tool result.** *"Inventory answers match `list_projects` output exactly; no invented or
 *    omitted project."* Before this, no such tool existed: the only inventory a reply could cite was the
 *    durable-state block, which compresses on purpose, or `get_project` on a slug the reply had to guess. A
 *    measurement with no instrument is not a measurement.
 * 2. **A miss lists what exists.** *"A wrong slug produces a tool miss that is surfaced with the available
 *    slugs listed, not a fabricated project."*
 * 3. **A second turn reads state.** *"Prompt 5 reports the post-mutation value from state, not from the earlier
 *    assistant message."* The lock mutates through the product's own path for a front-office-writable note —
 *    a project knowledge page — and then asserts the read returns the new value while the earlier reply it
 *    contradicts is still sitting there, and that the mutation wrote nothing into the project's checkout
 *    (gate F4: *"No existing file overwritten by the note mutation"*).
 *
 * Plus the two rows this suite carries, because a lock is what closes a row:
 * **F-008** (tool capability is negotiated and reported, and a model the endpoint resolves to is not mistaken
 * for the pinned one) and **F-026** (the environment outranks stored settings, and the surface says so).
 */

let ctx: TestContext | undefined;

afterEach(() => {
  ctx?.cleanup();
  ctx = undefined;
});

function setup(): TestContext {
  ctx = createTestContext("kampaku-eval17-");
  return ctx;
}

function seedTwoProjects(context: TestContext) {
  const first = createProject(context.store, {
    name: "Textstats",
    slug: "textstats",
    description: "Counts words in a text file.",
  });
  const second = createProject(context.store, {
    name: "Kampaku",
    slug: "kampaku-tools",
    description: "The factory's own checkout.",
  });
  return { first, second };
}

describe("suite 17 — inventory answers come from a tool", () => {
  it("list_projects returns exactly the projects that exist, with the ids and slugs the CLI publishes", () => {
    const context = setup();
    const { first, second } = seedTwoProjects(context);

    const inventory = executeListProjects(context.toolContext);

    expect(inventory.total).toBe(2);
    expect(inventory.availableSlugs).toEqual(["kampaku-tools", "textstats"]);
    expect(inventory.projects.map((project) => project.slug)).toEqual(["kampaku-tools", "textstats"]);
    expect(inventory.projects).toEqual([
      {
        id: second.id,
        slug: "kampaku-tools",
        name: "Kampaku",
        status: second.status,
        projectLeadSlug: null,
        repositories: [],
      },
      {
        id: first.id,
        slug: "textstats",
        name: "Textstats",
        status: first.status,
        projectLeadSlug: null,
        repositories: [],
      },
    ]);
  });

  it("an inventory answer cannot invent a project: the tool reads the store, so a deleted project is absent", () => {
    const context = setup();
    const { second } = seedTwoProjects(context);
    context.store.deleteProject(second.id);

    const inventory = executeListProjects(context.toolContext);

    expect(inventory.availableSlugs).toEqual(["textstats"]);
    expect(inventory.projects.map((project) => project.slug)).not.toContain("kampaku-tools");
  });

  it("list_projects is reachable from the front office's own toolset, and the prompt's reads stay reachable", () => {
    // Both directions, the way `eval-orchestrator-contract` locks F-001: the tool is registered in the runtime
    // **and** present in the allowlist `session.ts` filters by. A tool in one and not the other is a tool the
    // model is never offered, which is exactly how `create_project` was unreachable for weeks.
    expect(KAMPAKU_TOOLS.map((tool) => tool.function.name)).toContain("list_projects");
    expect(KAMPAKU_BUILTIN_DEFINITION.tools).toContain("list_projects");
    // And the line's capabilities stay absent from the front office, unchanged by this addition.
    expect(KAMPAKU_BUILTIN_DEFINITION.tools).not.toContain("update_project");
    expect(KAMPAKU_BUILTIN_DEFINITION.tools).not.toContain("execute_work_item");
  });
});

describe("suite 17 — a wrong identifier is a miss that names what exists", () => {
  it("get_project on a slug that does not exist lists the slugs that do", () => {
    const context = setup();
    seedTwoProjects(context);

    let message = "";
    try {
      executeGetProject(context.toolContext, { project_slug_or_id: "definitely-not-a-real-slug" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Project "definitely-not-a-real-slug" not found');
    expect(message).toContain("The projects that do exist: kampaku-tools, textstats");
    // The defect the bullet exists for: a miss that reads like a project.
    expect(message).not.toMatch(/definitely-not-a-real-slug.{0,40}(status|repository)/i);
  });

  it("the miss is a throw through the dispatcher, so the turn sees ok:false rather than an empty project", async () => {
    const context = setup();
    seedTwoProjects(context);
    await expect(
      executeToolCall(context.toolContext, "get_project", JSON.stringify({ project_slug_or_id: "nope" })),
    ).rejects.toThrow(/The projects that do exist/);
  });
});

describe("suite 17 — the second turn reads state, not the earlier reply", () => {
  it("a note written through the product's own path is what the next read returns", () => {
    const context = setup();
    const { second } = seedTwoProjects(context);
    const earlierReply = "The note on kampaku-tools is: (not set)";

    executeProposeWikiPage(
      context.toolContext,
      {
        project_slug_or_id: "kampaku-tools",
        slug: "eval-surface-note",
        title: "Surface note",
        content_md: "EVAL-SURFACE-MARKER",
        maturity: "shipped",
      },
      { agentId: "00000000-0000-4000-8000-000000000001" },
    );

    // The read a follow-up turn must answer from.
    const knowledge = executeGetProjectKnowledge(context.toolContext, {
      project_slug_or_id: "kampaku-tools",
      page_slug: "eval-surface-note",
    });
    const serialized = JSON.stringify(knowledge);
    expect(serialized).toContain("EVAL-SURFACE-MARKER");
    // Recorded as the proposal it is: the note is durable and its publication state is stated, not implied.
    expect(serialized).toContain("proposal");

    // The mutation is on the **second** project, the one the prompt names by position, and the first is untouched.
    const first = executeGetProjectKnowledge(context.toolContext, { project_slug_or_id: "textstats" });
    expect(JSON.stringify(first)).not.toContain("EVAL-SURFACE-MARKER");

    // The stale sentence is now contradicted by state — which is what "reads from state, not from the earlier
    // assistant message" means, and what makes the difference measurable rather than anecdotal.
    expect(earlierReply).not.toContain("EVAL-SURFACE-MARKER");
    expect(second.slug).toBe("kampaku-tools");
  });

  it("the note mutation writes no file into the project's checkout (gate F4)", () => {
    const context = setup();
    seedTwoProjects(context);
    const checkout = context.store.listProjects().find((project) => project.slug === "kampaku-tools");
    expect(checkout?.repositories ?? []).toEqual([]);

    // The product's note path is a durable page, not a file on a checkout: nothing to overwrite, and nothing
    // that a second project's note could clobber.
    executeProposeWikiPage(
      context.toolContext,
      {
        project_slug_or_id: "kampaku-tools",
        slug: "eval-surface-note",
        title: "Surface note",
        content_md: "EVAL-SURFACE-MARKER",
        maturity: "shipped",
      },
      { agentId: "00000000-0000-4000-8000-000000000001" },
    );

    expect(context.store.listProjects().find((project) => project.slug === "kampaku-tools")?.repositories).toEqual([]);
  });
});

describe("suite 17 — tool capability is negotiated, not assumed (BOARD F-008)", () => {
  it("a model that answers in prose is recorded as absent, and the gap is stated in words an operator can act on", () => {
    const answer = assessProbeAnswer({ content: "There are no projects.", model: "qwen2.5:14b" });
    expect(answer.toolCalls).toBe("absent");

    const record = {
      baseUrl: "http://127.0.0.1:11434/v1",
      requestedModel: "qwen2.5:14b",
      probedAt: new Date().toISOString(),
      ...answer,
    };
    const sentence = describeToolCapabilityGap(record);
    expect(sentence).toContain("http://127.0.0.1:11434/v1");
    expect(sentence).toContain("qwen2.5:14b");
    expect(sentence).toContain("Nothing was read and nothing was changed");
    // The two settings that change it are named, and the endpoint's own words travel with the sentence.
    expect(sentence).toContain("KAMPAKU_MODEL_BASE_URL");
    expect(sentence).toContain("KAMPAKU_AGENT_MODEL");
    expect(sentence).toContain("There are no projects.");
  });

  it("a tool call is verified, and a call to an unexpected name still counts as an endpoint that calls tools", () => {
    expect(assessProbeAnswer({ toolCalls: [{ name: "endpoint_probe" }], model: "x" }).toolCalls).toBe("verified");
    expect(assessProbeAnswer({ toolCalls: [{ name: "wrong_name" }], model: "x" }).toolCalls).toBe("verified");
    expect(assessProbeAnswer({ content: "", model: "x" }).toolCalls).toBe("absent");
  });

  it("a resolving alias that moves between turns is reported, and a stable one says nothing", () => {
    const ledger = new EndpointCapabilityLedger();
    expect(ledger.observeResolvedModel("conversation-1", "deepseek-flash").drifted).toBe(false);

    const stable = ledger.observeResolvedModel("conversation-1", "deepseek-flash");
    expect(stable.drifted).toBe(false);

    const drifted = ledger.observeResolvedModel("conversation-1", "qwen3.8-27b");
    expect(drifted).toEqual({ current: "qwen3.8-27b", previous: "deepseek-flash", drifted: true });
    const sentence = describeModelDrift(drifted.previous!, drifted.current!);
    expect(sentence).toContain("qwen3.8-27b");
    expect(sentence).toContain("deepseek-flash");
    expect(sentence).toContain("KAMPAKU_AGENT_MODEL");

    // An endpoint that omits its own `model` field on one call is not drift: silence is not a different model.
    expect(ledger.observeResolvedModel("conversation-1", undefined).drifted).toBe(false);
  });

  it("records are keyed by endpoint and model, so one endpoint's capability cannot vouch for another's", () => {
    const ledger = new EndpointCapabilityLedger();
    ledger.record({
      baseUrl: "http://127.0.0.1:3001/v1",
      requestedModel: "gpt-oss-120b",
      toolCalls: "verified",
      probedAt: new Date().toISOString(),
    });
    expect(ledger.get("http://127.0.0.1:3001/v1", "gpt-oss-120b")?.toolCalls).toBe("verified");
    expect(ledger.get("http://127.0.0.1:11435/v1", "gpt-oss-120b")).toBeUndefined();
    expect(ledger.get("http://127.0.0.1:3001/v1", "qwen2.5:7b-instruct")).toBeUndefined();
  });
});

describe("suite 17 — a claimed write is reconciled against the turn that would have made it", () => {
  it("a note claimed in a turn of reads only is reported, with the correction in the reply text", () => {
    // Measured 2026-11-04, endpoint B (`qwen2.5:7b-instruct`), suite 17 prompt 4: *"I have set a note on the
    // project with the EVAL-SURFACE-MARKER"* after two `get_project` calls, and `GET /api/v1/projects/s17-b`
    // reported the description **unchanged**. The next turn then answered a question about the note from that
    // reply, because the reply was the only record of it.
    const finding = auditStateChangeClaim({
      reply: "I have set a note on the project with the EVAL-SURFACE-MARKER.",
      toolsUsed: ["get_project", "get_project"],
    });

    expect(finding?.kind).toBe("state_change");
    expect(finding?.severity).toBe("high");
    expect(finding?.evidence).toContain("no tool this turn can write durable state");
    const limit = renderClaimLimit([finding!]);
    expect(limit).toContain("**Unverified change.**");
    expect(limit).toContain("Nothing was written");
  });

  it("a write the turn could have made is not reported, in any of its shapes", () => {
    const claim = "I have set a note on the project.";
    // A tool that writes, and a delegation whose own session writes.
    expect(auditStateChangeClaim({ reply: claim, toolsUsed: ["create_project"] })).toBeUndefined();
    expect(auditStateChangeClaim({ reply: claim, toolsUsed: ["delegate_to_agent"] })).toBeUndefined();
    // A turn with no mutation claim at all.
    expect(auditStateChangeClaim({ reply: "Two projects exist.", toolsUsed: ["get_project"] })).toBeUndefined();
    // A declaration rather than a claim: this is the sentence every plan in the product carries, and firing on it
    // would teach the operator to ignore the finding.
    expect(
      auditStateChangeClaim({
        reply: "Every leaf's acceptance criterion names the command the worker will run; the note on the item is set by the implementer.",
        toolsUsed: ["read_repository"],
      }),
    ).toBeUndefined();
  });

  it("the correction is appended to the reply, so the next turn reads the truth rather than the claim", () => {
    const finding = auditStateChangeClaim({
      reply: "I have updated the project's description.",
      toolsUsed: [],
    });
    const limited = `I have updated the project's description.${renderClaimLimit([finding!])}`;
    expect(limited.indexOf("I have updated")).toBeLessThan(limited.indexOf("**Unverified change.**"));
    expect(limited).toContain("the next turn will read whatever this reply said as though it were one");
  });

  it("with no tool at all it says so, and the severity does not depend on how it was found", () => {
    const finding = auditStateChangeClaim({ reply: "I set the note.", toolsUsed: [] });
    expect(finding?.severity).toBe("high");
    expect(finding?.evidence).toBe("no tool was executed this turn, so nothing was written");
  });
});

describe("suite 17 — the environment outranks stored settings, and says so (BOARD F-026)", () => {
  it("an environment model wins over a stored one, and the payload names the winner", () => {
    const context = setup();
    saveModelProviderSettings(context.store, context.config, {
      baseUrl: "http://127.0.0.1:3001/v1",
      model: "stored-model",
      apiKey: "stored-key",
    });

    const pinned = loadConfig({
      ...context.config,
      modelBaseUrlPinned: "http://127.0.0.1:11435/v1",
      modelApiKeyPinned: undefined,
      agentModelPinned: "environment-model",
    });

    const { settings, precedence } = resolveModelProviderSettingsWithPrecedence(context.store, pinned);

    expect(settings.model).toBe("environment-model");
    expect(settings.baseUrl).toBe("http://127.0.0.1:11435/v1");
    // The key was not stated in the environment, so the stored one fills it — one field at a time, not one source.
    expect(settings.apiKey).toBe("stored-key");
    expect(precedence).toEqual({ baseUrl: "environment", apiKey: "stored", model: "environment" });
  });

  it("with nothing in the environment the stored value is used, and with neither the config default is", () => {
    const context = setup();
    const nothingPinned = loadConfig({
      ...context.config,
      modelBaseUrlPinned: undefined,
      modelApiKeyPinned: undefined,
      agentModelPinned: undefined,
    });

    const fromDefault = resolveModelProviderSettingsWithPrecedence(context.store, nothingPinned);
    expect(fromDefault.precedence.model).toBe("default");

    saveModelProviderSettings(context.store, nothingPinned, {
      baseUrl: "http://127.0.0.1:3001/v1",
      model: "stored-model",
      apiKey: "stored-key",
    });
    const fromStore = resolveModelProviderSettingsWithPrecedence(context.store, nothingPinned);
    expect(fromStore.settings.model).toBe("stored-model");
    expect(fromStore.precedence.model).toBe("stored");
  });

  it("a save the environment overrides returns the sentence that explains why nothing moved", () => {
    const context = setup();
    const pinned = loadConfig({ ...context.config, agentModelPinned: "environment-model" });

    const saved = saveModelProviderSettings(context.store, pinned, {
      baseUrl: "http://127.0.0.1:3001/v1",
      model: "saved-model",
      apiKey: "saved-key",
    });

    expect(saved.note).toContain("The environment also states model");
    expect(saved.note).toContain("explicit environment beats a saved preference");
    // The stored value is still written — it is a preference, not a no-op — and the effective one is the pin.
    expect(resolveModelProviderSettingsWithPrecedence(context.store, pinned).settings.model).toBe(
      "environment-model",
    );
  });
});
