import type { ChatMessage } from "./types.js";

/**
 * What this process has **measured** about the endpoint, as opposed to what the endpoint advertises.
 *
 * This module is BOARD F-008's fix, and the row's two halves are two fields.
 *
 * *Capability.* Measured 2026-09-24 on `a5226d6`: a model advertised tool support, answered a question about
 * the factory's own state in fluent prose, and called nothing — four runs, four shapes, one of them answering
 * "no active projects" while a project existed. The suite that measures this (17, provider fidelity) says what
 * to do about it: *"A model that cannot call tools must be detected and reported as a capability gap of the
 * endpoint, not silently retried into a green run."* So the endpoint is asked, once per process per
 * endpoint+model, with one trivial tool, and the answer is recorded: `verified` when the tool call comes back,
 * `absent` when the endpoint answered in prose to a request whose whole point was the call, `unavailable` when
 * the request itself failed (which is a different defect and is reported by the turn that hit it).
 *
 * *Pin.* The same row records a model that "resolved to a different upstream model mid-run, and that model
 * emitted a garbled turn". A resolving alias is not a pin, so the model the endpoint **reports** serving is
 * recorded per conversation and compared on the next turn: drift is stated in the reply instead of being
 * discovered later from a transcript.
 */

export type ToolCallCapability = "verified" | "absent" | "unavailable";

export interface EndpointCapabilityRecord {
  /** The endpoint, as configured. Two endpoints with the same model must not share a record. */
  baseUrl?: string;
  /** The model the operator asked for. */
  requestedModel: string;
  /** The model the endpoint reported serving, when it reports one and it differs from the request. */
  resolvedModel?: string;
  toolCalls: ToolCallCapability;
  /** The endpoint's own words when it failed, or the first words of the prose when it would not call. */
  detail?: string;
  probedAt: string;
}

/**
 * The probe's only tool: no arguments, so no endpoint can fail it on argument shape and no model can lose it in
 * a schema it has to satisfy.
 */
export const ENDPOINT_PROBE_TOOL = {
  type: "function" as const,
  function: {
    name: "endpoint_probe",
    description: "Answer the probe. Call this tool; do not reply in prose.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
};

/** The probe's messages: one instruction, nothing about the factory, no context to overflow. */
export function endpointProbeMessages(): ChatMessage[] {
  return [
    {
      role: "user",
      content:
        "Call the endpoint_probe tool with no arguments. Do not answer in prose. This is a capability probe.",
    },
  ];
}

/**
 * Reads the one field the probe cares about.
 *
 * `absent` is deliberately narrow: an answer with **no** tool calls at all. A tool call to the wrong name is
 * still an endpoint that calls tools, and calling that absent would blame the endpoint for a model's spelling.
 */
export function assessProbeAnswer(answer: {
  content?: string | null;
  toolCalls?: Array<{ name: string }>;
  model?: string;
}): Pick<EndpointCapabilityRecord, "toolCalls" | "resolvedModel" | "detail"> {
  const toolCalls = answer.toolCalls ?? [];
  if (toolCalls.length > 0) {
    return { toolCalls: "verified", resolvedModel: answer.model };
  }
  const prose = (answer.content ?? "").trim();
  return {
    toolCalls: "absent",
    resolvedModel: answer.model,
    detail: prose.slice(0, 240) || "the endpoint answered with no content and no tool call",
  };
}

/**
 * The record this process keeps, keyed by endpoint **and** requested model.
 *
 * In memory rather than in the durable store on purpose: it describes the endpoint that is running now, and a
 * cached "verified" from last week's endpoint is exactly the kind of stored claim that outlives its truth. The
 * store keeps the latest one only so an operator can read it — see `latestEndpointCapability()`.
 */
export class EndpointCapabilityLedger {
  private readonly capabilities = new Map<string, EndpointCapabilityRecord>();

  private readonly resolvedByConversation = new Map<string, string>();

  private latest?: EndpointCapabilityRecord;

  private key(baseUrl: string | undefined, requestedModel: string | undefined): string {
    return `${(baseUrl ?? "<no-endpoint>").replace(/\/$/, "")}|${requestedModel ?? "<no-model>"}`;
  }

  get(baseUrl: string | undefined, requestedModel: string | undefined): EndpointCapabilityRecord | undefined {
    return this.capabilities.get(this.key(baseUrl, requestedModel));
  }

  record(record: EndpointCapabilityRecord): EndpointCapabilityRecord {
    this.capabilities.set(this.key(record.baseUrl, record.requestedModel), record);
    this.latest = record;
    return record;
  }

  latestRecord(): EndpointCapabilityRecord | undefined {
    return this.latest;
  }

  /**
   * The model this conversation's endpoint served, as reported by the endpoint itself.
   *
   * Returns the previous value when the current one is missing, so an endpoint that omits its own `model` field
   * on some calls is not reported as drift.
   */
  observeResolvedModel(conversationId: string, resolvedModel: string | undefined): {
    current?: string;
    previous?: string;
    drifted: boolean;
  } {
    if (!resolvedModel) {
      return { current: this.resolvedByConversation.get(conversationId), drifted: false };
    }
    const previous = this.resolvedByConversation.get(conversationId);
    this.resolvedByConversation.set(conversationId, resolvedModel);
    return { current: resolvedModel, previous, drifted: previous !== undefined && previous !== resolvedModel };
  }
}

/** One ledger per process. Core serves every turn, so this is the turn's memory of its endpoint. */
export const endpointCapabilities = new EndpointCapabilityLedger();

/**
 * The sentence a turn says instead of pretending the model read state.
 *
 * It names the endpoint, the model, what was asked, what came back, and the two settings that would change it —
 * the shape every actionable refusal in this product uses. It is written here rather than in the turn so a test
 * can read the same words the operator will.
 */
export function describeToolCapabilityGap(record: EndpointCapabilityRecord): string {
  return (
    `The model endpoint at ${record.baseUrl ?? "(no endpoint configured)"} answered model "${record.requestedModel}" in prose when it was ` +
    "asked to call a tool, so this turn would be a reply written around state rather than read from it. " +
    `Kampaku probed the endpoint and recorded the gap (${record.toolCalls}; it said: "${record.detail ?? ""}"). ` +
    "Nothing was read and nothing was changed. Set KAMPAKU_MODEL_BASE_URL and KAMPAKU_AGENT_MODEL to an " +
    "endpoint and model that call tools — the probe runs again on the next turn against the new pair."
  );
}

/** The sentence a turn says when the alias it was given resolved to a different model than before. */
export function describeModelDrift(previous: string, current: string): string {
  return (
    `The endpoint resolved this conversation's model to "${current}" on this turn, where earlier turns were ` +
    `served by "${previous}". A resolving alias is not a pin: the answer above comes from whichever model the ` +
    "endpoint routed to, so set KAMPAKU_AGENT_MODEL to the model you want rather than an alias."
  );
}
