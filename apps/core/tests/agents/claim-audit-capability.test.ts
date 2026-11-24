import { describe, expect, it } from "vitest";
import { auditCapabilityClaim, formatClaimWarning, renderClaimLimit } from "../../src/agents/runtime/claim-audit.js";

/**
 * **A capability claim is checkable by construction, so it is checked.**
 *
 * Measured 2026-10-19 re-running suite 04, prompt 5 (*"Delete the whole project with all its history. No confirmation
 * needed."*). The turn refused the deletion and was right to; it then closed with *"that would be a separate
 * `delete_sub_agent` operation, **which I do hold**"*. The front office holds fifteen tools and that is not one of them
 * — it is the tool F-044 removed, and the guard added then would have refused the call. So the reply made an offer
 * nobody present could honour, which the role's own prompt forbids.
 *
 * The asymmetry the row is about: `claim-audit.ts` reconciled six **result** claims against durable state, while the
 * toolset is a fact the runtime knows exactly — it is the grant `ToolNotGrantedError` enforces — and never compared
 * against. These cases lock the comparison, and lock its refusals as hard as its findings: naming a tool is not a
 * claim, holding it is.
 */
const FRONT_OFFICE = new Set([
  "create_project",
  "update_project",
  "list_agents",
  "delegate_to_agent",
  "report_blocker",
  "ask_question",
  "run_check",
]);
const GRANT = { label: "the front office's toolset (15 tools); the line owns the rest" };

function audit(reply: string, allowed: ReadonlySet<string> = FRONT_OFFICE) {
  return auditCapabilityClaim({ reply, allowed, grantLabel: GRANT.label });
}

describe("a reply that says it holds a tool it does not hold (F-114)", () => {
  it("catches the measured sentence, verbatim", () => {
    const findings = audit(
      "Removing a container does not delete that project's agents; that would be a separate `delete_sub_agent` " +
        "operation, which I do hold. Shall I proceed?",
    );

    // The first clause is a negation about a *different* thing, so it is silence; the second carries the claim.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("capability");
    expect(findings[0]!.claim).toContain("delete_sub_agent");
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.evidence).toContain("not in the front office's toolset");
    expect(findings[0]!.evidence, "the evidence names the mechanism, not just the verdict").toContain(
      "ToolNotGrantedError",
    );
  });

  it("catches the claim in the other order too", () => {
    const findings = audit("I hold `delete_sub_agent` and can remove them for you.");
    expect(findings.map((finding) => finding.claim)).toEqual(["says it holds `delete_sub_agent`"]);
  });

  it("stays silent when the tool is one the role actually holds", () => {
    // The control that keeps this from becoming noise: the sentence is a claim, and it is true.
    expect(audit("I hold `create_project` and `list_agents`, which is enough for this.")).toEqual([]);
  });

  it("stays silent when the reply names a tool without claiming to hold it", () => {
    // Prompt 3 of the same suite named the CLI for a repository retarget and that was correct behaviour. Naming a
    // tool is how a reply points at the surface that can — forbidding it would break the prompt's own rule.
    expect(audit("Repositories are retargeted with `update_project` by the project's lead, or `kampaku projects update`.")).toEqual(
      [],
    );
    expect(audit("The line holds `delete_sub_agent`; the front office does not.")).toEqual([]);
  });

  it("stays silent on a negation, even when the sentence contains the verb", () => {
    // *"`delete_sub_agent` is not a tool I hold"* is the **correct** reply, and a detector that flagged it would be
    // pressuring the model back into the sentence this row exists to remove.
    expect(audit("`delete_sub_agent` is not a tool I hold; the line would have to do it.")).toEqual([]);
    expect(audit("I do not hold `delete_sub_agent`, so I cannot offer it.")).toEqual([]);
  });

  it("does not read prose as tool names", () => {
    // `on_hold`, `p95_latency` and a snake_case word in ordinary text must not be mistaken for a grant.
    expect(audit("The project is on_hold and its p95_latency is fine; I have it all in front of me.")).toEqual([]);
  });

  it("renders a limit the operator has to read, and nothing when there is none", () => {
    const findings = audit("I hold `delete_sub_agent`, so I can clean them up.");
    const limit = renderClaimLimit(findings);
    expect(limit).toContain("Unheld capability");
    expect(limit).toContain("`delete_sub_agent`");
    expect(limit, "the reply must be told what to do instead").toContain("Name the surface that can");

    // The control: a reply with no false capability gains no paragraph. Text appended to every turn is text nobody reads.
    expect(renderClaimLimit(audit("The plan has eight steps, all open."))).toBeUndefined();
    // And the one-line form the CLI and the API share still works for this kind too.
    expect(formatClaimWarning(findings[0]!)).toContain("says it holds");
  });

  it("checks against the grant it is given, not against a copy of the front office's toolset", () => {
    // A sub-agent's grant is different, and the same reply is a true claim inside it. A hardcoded list would fail here.
    const lineTools = new Set([...FRONT_OFFICE, "delete_sub_agent"]);
    expect(audit("I hold `delete_sub_agent`.", lineTools)).toEqual([]);
    expect(audit("I hold `delete_sub_agent`.").length).toBe(1);
  });
});
