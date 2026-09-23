import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditTurnClaims, type DurableSnapshot } from "../../src/agents/runtime/claim-audit.js";

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
