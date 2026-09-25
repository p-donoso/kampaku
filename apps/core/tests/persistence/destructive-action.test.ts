import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/persistence/db.js";
import { destructiveToken, Store } from "../../src/persistence/store.js";

/**
 * The gate for a destructive action, and the reason it exists.
 *
 * Measured 2026-09-24 in the suite-04 run: three destructive operations went through REST with **no actor
 * and no confirmation**.
 *
 * | Request | Result |
 * |---|---|
 * | `DELETE /api/v1/agents/s4-lead` | **204**, the agent was gone |
 * | `DELETE /api/v1/projects/s4-demo` | **204**, the project was gone |
 * | `PATCH /api/v1/projects/s4-demo` reassigning the lead and rewriting the repositories to `/tmp/evil` | **200**, and it **created** `/tmp/evil`, ran `git init`, and seeded six files |
 *
 * The tool path had refused the same operations for months. So the boundary held on chat and nowhere else,
 * which is the clause suite 04 states directly: *"a tool that is denied to an agent but reachable through an
 * ungated REST route is a finding."*
 *
 * The [security model](../../../../docs/security/security-model.md) is explicit about the tier —
 * these are **gated**, and a gate is *"a named, recorded approval that states the consequence. One
 * unconfirmed turn is never enough"* — and about where it lives: *"a prohibition that lives only in a prompt
 * is not a prohibition."*
 *
 * This locks the mechanism, not yet the routes that will use it.
 */
describe("destructive action confirmation", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-destructive-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    return new Store(db);
  }

  const REQUEST = {
    action: "project.delete",
    target: "s4-demo",
    payloadHash: "hash-of-the-exact-payload",
    consequence: "This deletes project s4-demo and all of its history.",
  };

  it("mints a reference and a token, and states the consequence", () => {
    const store = setup();

    const { reference, confirmationToken } = store.recordDestructiveRequest(REQUEST);

    expect(reference).toBeTruthy();
    expect(confirmationToken).toBeTruthy();
    // The token is a commitment to the payload, not a constant.
    expect(confirmationToken).toBe(
      destructiveToken(reference, REQUEST.action, REQUEST.target, REQUEST.payloadHash),
    );
  });

  it("refuses an unconfirmed request, which is the ordinary case", () => {
    const store = setup();
    store.recordDestructiveRequest(REQUEST);

    // No reference, no token: nothing to match.
    expect(
      store.confirmDestructiveAction({
        reference: "",
        confirmationToken: "",
        action: REQUEST.action,
        target: REQUEST.target,
        payloadHash: REQUEST.payloadHash,
      }),
    ).toBeNull();
  });

  it("accepts the exact confirmation and returns the consequence it stated", () => {
    const store = setup();
    const { reference, confirmationToken } = store.recordDestructiveRequest(REQUEST);

    const confirmed = store.confirmDestructiveAction({
      reference,
      confirmationToken,
      action: REQUEST.action,
      target: REQUEST.target,
      payloadHash: REQUEST.payloadHash,
    });

    expect(confirmed?.consequence).toBe(REQUEST.consequence);
  });

  /**
   * The four ways a confirmation must not work. Each is a distinct defect, not one case repeated: a token
   * that matched on target alone would let one project's confirmation delete another.
   */
  describe("refuses every near miss", () => {
    it("refuses a token minted for a different action", () => {
      const store = setup();
      const { reference, confirmationToken } = store.recordDestructiveRequest(REQUEST);

      expect(
        store.confirmDestructiveAction({
          reference,
          confirmationToken,
          action: "agent.delete",
          target: REQUEST.target,
          payloadHash: REQUEST.payloadHash,
        }),
      ).toBeNull();
    });

    it("refuses a token minted for a different target", () => {
      const store = setup();
      const { reference, confirmationToken } = store.recordDestructiveRequest(REQUEST);

      expect(
        store.confirmDestructiveAction({
          reference,
          confirmationToken,
          action: REQUEST.action,
          target: "some-other-project",
          payloadHash: REQUEST.payloadHash,
        }),
      ).toBeNull();
    });

    it("refuses a confirmation whose payload changed after the request", () => {
      const store = setup();
      const { reference, confirmationToken } = store.recordDestructiveRequest(REQUEST);

      // The same reference and the same token, against a payload the operator never saw approved.
      expect(
        store.confirmDestructiveAction({
          reference,
          confirmationToken,
          action: REQUEST.action,
          target: REQUEST.target,
          payloadHash: "a-different-payload",
        }),
      ).toBeNull();
    });

    it("refuses a forged token", () => {
      const store = setup();
      const { reference } = store.recordDestructiveRequest(REQUEST);

      expect(
        store.confirmDestructiveAction({
          reference,
          confirmationToken: "0".repeat(64),
          action: REQUEST.action,
          target: REQUEST.target,
          payloadHash: REQUEST.payloadHash,
        }),
      ).toBeNull();
    });

    it("refuses a reference that was never requested", () => {
      const store = setup();

      expect(
        store.confirmDestructiveAction({
          reference: "11111111-2222-4333-8444-555555555555",
          confirmationToken: "0".repeat(64),
          action: REQUEST.action,
          target: REQUEST.target,
          payloadHash: REQUEST.payloadHash,
        }),
      ).toBeNull();
    });
  });

  /**
   * Single use. Without this, one confirmation would authorise the same destructive action forever — which
   * is the same defect as a command-line `-y` flag that never reaches the route.
   */
  it("consumes the confirmation, so it cannot authorise a second action", () => {
    const store = setup();
    const { reference, confirmationToken } = store.recordDestructiveRequest(REQUEST);
    const confirmation = {
      reference,
      confirmationToken,
      action: REQUEST.action,
      target: REQUEST.target,
      payloadHash: REQUEST.payloadHash,
    };

    expect(store.confirmDestructiveAction(confirmation)).not.toBeNull();

    store.consumeDestructiveAction(reference, "operator");

    expect(store.confirmDestructiveAction(confirmation)).toBeNull();
  });
});
