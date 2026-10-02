import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditTurnClaims,
  renderClaimLimit,
  type DurableSnapshot,
} from "../../src/agents/runtime/claim-audit.js";

/**
 * The audit exists because a turn with **zero tool calls** reported a project created, a repository
 * linked and a team of six created, in a structured table, with `exit 0`. Nothing in the platform
 * contradicted it. These cases are that reply, reconstructed.
 */
describe("auditTurnClaims", () => {
  const dirs: string[] = [];
  const snapshot = (partial: Partial<DurableSnapshot> = {}): DurableSnapshot => ({
    projects: ["kampaku"],
    agents: [],
    repositoryPaths: [],
    workItems: 0,
    ...partial,
  });

  function existingDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-claim-audit-"));
    dirs.push(dir);
    return dir;
  }

  /**
   * The reconstructed reply, verbatim in shape: a table asserting a project, a linked repository and a
   * 6-role team, produced by a turn that executed no tool at all.
   */
  it("flags the reconstructed no-tool turn that reported a project, a repo and a team", () => {
    const reply = [
      "### ✅ Completado",
      "| `voice-language-trainer` | Creado (`create_project`) — status `planning` |",
      "| **Repositorio** | Vinculado: `file:///home/pdonoso/kampaku/voice-language-trainer` |",
      "| **Equipo 6-roles** | Creados bajo el lead (frontend, backend, qa, auditor) |",
    ].join("\n");

    const findings = auditTurnClaims({
      reply,
      before: snapshot(),
      after: snapshot(),
      toolsUsed: [],
    });

    const claims = findings.map((f) => f.claim);
    expect(claims).toContain('claims "voice-language-trainer" was created');
    expect(claims).toContain("claims a repository was linked");
    expect(claims).toContain("claims 6 roles were created");
    // No tool ran, so nothing in the reply could have happened.
    const named = findings.find((f) => f.claim.includes("voice-language-trainer"));
    expect(named?.severity).toBe("high");
    expect(named?.evidence).toContain("no tool was executed this turn");
  });

  it("reports the repository path that does not exist on disk", () => {
    const findings = auditTurnClaims({
      reply: "Repositorio vinculado: `file:///home/pdonoso/kampaku/voice-language-trainer`",
      before: snapshot(),
      after: snapshot(),
      toolsUsed: ["create_project"],
    });

    const repository = findings.find((f) => f.claim === "claims a repository was linked");
    expect(repository?.severity).toBe("high");
    expect(repository?.evidence).toContain("/home/pdonoso/kampaku/voice-language-trainer");
  });

  it("stays silent when the claim is true: the named project exists and was created this turn", () => {
    const reply = "Creado el proyecto `voice-language-trainer`.";
    const findings = auditTurnClaims({
      reply,
      before: snapshot(),
      after: snapshot({ projects: ["kampaku", "voice-language-trainer"] }),
      toolsUsed: ["create_project"],
    });

    expect(findings).toEqual([]);
  });

  it("does not treat a tool name as a claimed entity", () => {
    // `create_project` is snake_case, i.e. a tool, not an entity the reply claims to have created.
    const findings = auditTurnClaims({
      reply: "Voy a llamar a `create_project` para crear el contenedor.",
      before: snapshot(),
      after: snapshot({ projects: ["kampaku", "voice-language-trainer"] }),
      toolsUsed: ["create_project"],
    });

    expect(findings).toEqual([]);
  });

  it("stays silent when the repository exists on disk", () => {
    const dir = existingDir();
    const findings = auditTurnClaims({
      reply: `Repositorio vinculado: \`file://${dir}\``,
      before: snapshot(),
      after: snapshot({ repositoryPaths: [`file://${dir}`] }),
      toolsUsed: ["create_project"],
    });

    expect(findings).toEqual([]);
  });

  it("flags a claimed role count above what was created", () => {
    const findings = auditTurnClaims({
      reply: "Equipo de 6 roles creado bajo el lead.",
      before: snapshot(),
      after: snapshot({ agents: ["vlt-lead"] }),
      toolsUsed: ["create_sub_agent"],
    });

    const team = findings.find((f) => f.claim.includes("6 roles"));
    expect(team?.evidence).toContain("1 agent(s) were created");
  });

  it("flags a plan claimed as persisted when no work item was created", () => {
    const findings = auditTurnClaims({
      reply: "El plan quedó persistido y el equipo ya puede desglosarlo.",
      before: snapshot(),
      after: snapshot(),
      toolsUsed: ["submit_intent"],
    });

    const plan = findings.find((f) => f.claim.includes("plan"));
    expect(plan?.evidence).toContain("work item count did not increase");
  });

  it("does not flag a prose-only reply that claims nothing about durable state", () => {
    const findings = auditTurnClaims({
      reply: "Te propongo tres decisiones de diseño y te explico los trade-offs de cada una.",
      before: snapshot(),
      after: snapshot(),
      toolsUsed: [],
    });

    expect(findings).toEqual([]);
  });

  it("does not flag ordinary prose that merely mentions a repo or a project", () => {
    const findings = auditTurnClaims({
      reply: [
        "El proyecto vive fuera del monorepo, bajo `/home/pdonoso/projects`.",
        "Si querés, reviso el repositorio y te digo qué falta.",
      ].join("\n"),
      before: snapshot(),
      after: snapshot(),
      toolsUsed: [],
    });

    expect(findings).toEqual([]);
  });

  it("names the entities that do exist, so the operator has somewhere to look", () => {
    const findings = auditTurnClaims({
      reply: "Proyecto creado.",
      before: snapshot({ projects: ["kampaku", "other"] }),
      after: snapshot({ projects: ["kampaku", "other"] }),
      toolsUsed: [],
    });

    const finding = findings.find((f) => f.claim === "claims work was created");
    expect(finding?.evidence).toContain("kampaku, other");
    expect(finding?.evidence).toContain("no tool was executed this turn");
  });
});

/**
 * Suite 06's **F-053** lock: a reply may not state a command's result that nothing obtained.
 *
 * The turn this comes from is measured, not imagined. Taking suite 06 on 2026-09-25, prompt 2 asked how a
 * stranger verifies a seeded README, and the reply's own procedure carried the step
 * *"`git status` → **clean (only the seeded files tracked)**"*. The front office holds no shell — by design,
 * it delegates rather than executes — so nothing returned that value. On disk the checkout was a repository
 * with **no commit**: `git status` answers *"No commits yet"* and lists all six seeded files as untracked.
 *
 * Cases 1–5 of the audit compare an assertion against the durable stores. This one cannot: a command's output
 * is in no store, which is exactly why it survived four suites. It is compared against **capability**
 * instead — and the negative controls matter as much as the positive one, because the shape this must not
 * fire on is the acceptance criterion every plan this factory writes is full of.
 */
describe("auditTurnClaims — a command's result is a claim like any other", () => {
  const snapshot = (): DurableSnapshot => ({
    projects: ["kampaku"],
    agents: [],
    repositoryPaths: [],
    workItems: 0,
  });

  const audit = (reply: string, toolsUsed: string[] = ["read_repository"]) =>
    auditTurnClaims({ reply, before: snapshot(), after: snapshot(), toolsUsed });

  it("flags the measured reply: a `git status` result nothing could have produced", () => {
    const findings = audit(
      [
        "Open the directory and follow these steps:",
        "1. `cat README.md` — there are no commands to run.",
        "2. `git status` → **clean (only the seeded files tracked)**",
        "",
        "Verification passes because the README makes no false claims.",
      ].join("\n"),
    );

    const command = findings.find((f) => f.kind === "command_result");
    expect(command?.claim).toBe("states the result of `git status`");
    expect(command?.severity).toBe("high");
    expect(command?.evidence).toContain("no tool this turn can run a command");
    // `cat` is a command too, and the reply asserts nothing about its result — no arrow, no value.
    expect(findings.filter((f) => f.kind === "command_result")).toHaveLength(1);
  });

  it("flags a first-person run whose output this turn never saw", () => {
    const findings = audit("I ran `make check` and it passed with three tests.");
    const command = findings.find((f) => f.kind === "command_result");
    expect(command?.claim).toBe("states the result of `make check`");
  });

  it("stays silent on an acceptance criterion, which is what a plan is full of", () => {
    // The distinction the lock exists to preserve: `make check exits 0` is a criterion the repository
    // is asked to satisfy; `make check` → 0 is a result someone reports having seen. Flagging the
    // first would make the finding noise, and noise is how a real one gets ignored.
    const findings = audit(
      [
        "Every leaf names its own check:",
        "- `make check` exits 0 (declared by the Makefile target `check`).",
        "- `make lint` exits 0.",
        "- status todo → done once the check passes.",
      ].join("\n"),
      [],
    );

    expect(findings.filter((f) => f.kind === "command_result")).toEqual([]);
  });

  it("stays silent when the turn really could run a command", () => {
    const reply = "`make check` → exit 0, `Ran 3 tests … OK`.";
    expect(audit(reply, ["run_check"]).filter((f) => f.kind === "command_result")).toEqual([]);
    expect(audit(reply, ["execute_work_item"]).filter((f) => f.kind === "command_result")).toEqual([]);
  });

  it("renders the limit the operator has to read, and nothing when there is none", () => {
    const findings = audit("2. `git status` → **clean**");
    const limit = renderClaimLimit(findings);
    expect(limit).toContain("states the result of `git status`");
    expect(limit).toContain("cannot execute commands in your checkout");
    expect(limit).toContain("unverified");

    // The control: a clean reply gains no sentence. Text appended to every turn is text nobody reads.
    expect(renderClaimLimit(audit("Here is the plan, with every step at todo."))).toBeUndefined();
  });
});
