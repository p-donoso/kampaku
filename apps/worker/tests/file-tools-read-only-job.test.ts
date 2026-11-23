import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildWorkerSystemPrompt } from "../src/executor/worker-system-prompt.js";
import { executeCodingTool } from "../src/tools/file-tools.js";

/**
 * **A job asked to observe may not write — at all.**
 *
 * Measured 2026-11-08 on suite 19 run `s19r6` (BOARD F-093), on a monorepo whose work order had one
 * evidence-only leaf described as *"Independent verification only — make NO source edits"*:
 *
 * 1. the job ran `npm test --workspaces`, recorded `checkResults.test: true`, wrote nothing — and was **failed**
 *    with `WORKER_NO_DELIVERABLES`, because the deliverables rule counted mutations;
 * 2. the classifier was taught the wording, and the retry **succeeded** — by writing
 *    `packages/orders/test/by-status.audit.md` into the checkout, a file nobody asked for, whose existence the
 *    operator then had to remove. The reply did not say the repository had grown a file.
 *
 * So the two halves are one rule, and this file locks the half that constrains rather than exempts. The other
 * half — the deliverables gate — is `shouldFailMissingDeliverables` in `mutation-outcome.ts` and the Core
 * classifier in `application/pm/deliverable-requirements.ts`.
 *
 * The refusal is deliberately first and unconditional: the measured path was *inside* an existing directory the
 * work item was allowed to read, which is exactly the shape a path-shaped rule lets through.
 */
describe("a read-only job's write boundary (suite 19 / F-093)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kampaku-read-only-"));
    mkdirSync(join(root, "packages", "orders", "test"), { recursive: true });
    writeFileSync(join(root, "packages", "orders", "test", "orders.test.js"), "// assertions\n");
    writeFileSync(join(root, "README.md"), "# mono\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses the report the retry actually wrote, and names where it belongs", async () => {
    await expect(
      executeCodingTool(
        "write_file",
        { path: "packages/orders/test/by-status.audit.md", content: "# audit\n" },
        root,
        { readOnly: true },
      ),
    ).rejects.toThrow(/read-only/);

    // Actionable rather than only refusing: a model that cannot act on a refusal spends the turn rediscovering it.
    await expect(
      executeCodingTool("write_file", { path: "audit.md", content: "x" }, root, { readOnly: true }),
    ).rejects.toThrow(/Record the evidence in your summary/);
    expect(() => readFileSync(join(root, "packages", "orders", "test", "by-status.audit.md"))).toThrow();
  });

  it("refuses replace_in_file too, so an observation job cannot edit an existing file", async () => {
    await expect(
      executeCodingTool(
        "replace_in_file",
        { path: "README.md", old_text: "mono", new_text: "mono-orders" },
        root,
        { readOnly: true },
      ),
    ).rejects.toThrow(/read-only/);
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# mono\n");
  });

  it("still reads and runs checks: the job's whole purpose is untouched", async () => {
    // The refusal is about writing, not about observing. A read tool has to keep working or the leaf is pointless.
    const listing = await executeCodingTool("list_files", { path: "." }, root, { readOnly: true });
    expect(listing).toContain("README.md");
    const inspected = JSON.parse(
      await executeCodingTool("inspect_artifact", { path: "README.md" }, root, { readOnly: true }),
    ) as { ok: boolean; text?: string };
    expect(inspected.ok).toBe(true);
    expect(inspected.text).toContain("mono");
  });

  it("keeps the control: a job without the flag writes exactly as it did before", async () => {
    await executeCodingTool("write_file", { path: "packages/orders/test/by-status.test.js", content: "// t\n" }, root);
    expect(readFileSync(join(root, "packages", "orders", "test", "by-status.test.js"), "utf8")).toBe("// t\n");
    await executeCodingTool(
      "replace_in_file",
      { path: "README.md", old_text: "# mono", new_text: "# mono-orders" },
      root,
    );
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# mono-orders\n");
  });

  it("states the rule in the worker's own prompt, so the refusal is not how the model finds out", () => {
    const readOnlyPrompt = buildWorkerSystemPrompt({ readOnly: true });
    expect(readOnlyPrompt).toContain("This job is read-only");
    expect(readOnlyPrompt).toContain("do not write, replace or create any file");

    // Every other job's prompt is byte-identical to what it was: the line is added, never woven in.
    expect(buildWorkerSystemPrompt({})).toBe(buildWorkerSystemPrompt({ readOnly: false }));
    expect(buildWorkerSystemPrompt({})).not.toContain("This job is read-only");
  });
});
