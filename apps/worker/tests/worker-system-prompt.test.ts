import { describe, expect, it } from "vitest";
import {
  buildWorkerSystemPrompt,
  WORKER_SYSTEM_PROMPT_LINES,
} from "../src/executor/worker-system-prompt.js";

/**
 * The worker prompt is a product artifact: it tells every coding worker what to do in a repository the
 * factory did not write. It is asserted directly because three defects lived in it while it was inlined
 * in the executor and no test could see them (BOARD F-003, and the catch-all framing phase 01 removed):
 *
 * 1. a **non-software deliverable class** ("for research deliverables …"), while the product statute
 *    refuses open-ended research and non-technical documents;
 * 2. **scenario copy** from one past run ("an approximate learner convention");
 * 3. **the platform's own stack** (`package.json`, `npm` scripts, Next.js App Router routes).
 *
 * An instruction naming a toolchain the checkout does not have is the same defect as a criterion naming
 * a command that cannot run: it is unreachable guidance the worker will work around.
 */

/** Ecosystem and framework names the worker must never be told to assume. */
const STACK_ASSUMPTIONS =
  /\bnpm\b|\bpnpm\b|\byarn\b|package\.json|tsconfig|vite|webpack|next\.js|nextjs|express|jest|vitest|tsx\b|\bnode_modules\b|\bpip\b|\bpoetry\b|\bcargo\b|\bgo\.mod\b|\bpytest\b|\bmaven\b|\bgradle\b/i;

/** Deliverable classes the statute refuses: a product prompt must not name them as work it does. */
const REFUSED_DELIVERABLES =
  /research deliverable|literature review|market (study|research)|screenplay|\bnovel\b|manuscript|marketing copy|brand voice|prose\b/i;

describe("worker system prompt", () => {
  it("names no toolchain, package manager, or framework to assume", () => {
    const prompt = buildWorkerSystemPrompt({ globalSystemPrompt: "Global.", projectContext: "\nProject: x" });

    const line = prompt.split("\n").find((candidate) => STACK_ASSUMPTIONS.test(candidate));
    expect(
      line,
      `the worker prompt assumes a stack: "${line?.slice(0, 160)}"`,
    ).toBeUndefined();
  });

  it("names no deliverable class the product refuses", () => {
    const prompt = buildWorkerSystemPrompt();

    const line = prompt.split("\n").find((candidate) => REFUSED_DELIVERABLES.test(candidate));
    expect(
      line,
      `the worker prompt names a refused deliverable class: "${line?.slice(0, 160)}"`,
    ).toBeUndefined();
  });

  it("keeps citation integrity as a general rule rather than a research artifact class", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toMatch(/cites an external source/i);
    expect(prompt).toMatch(/never invent publications, citations/i);
    // The rule must still forbid the failure it was written for: fabricated sources.
    expect(prompt).toMatch(/fetch_public_source/);
  });

  it("tells the worker to discover the project instead of reading a named manifest", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toMatch(/discover what this project uses/i);
    expect(prompt).toMatch(/dependency manifest/i);
    expect(prompt).toMatch(/never assume a language, a package manager, or a test runner/i);
  });

  it("resolves required checks by name rather than by a fixed runner", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toMatch(/check name resolves to a command this repository declares/i);
    expect(prompt).toMatch(/the repository's declared build and test checks/i);
  });

  it("preserves the operator global prompt and the project scope", () => {
    const prompt = buildWorkerSystemPrompt({
      globalSystemPrompt: "Operator instruction.",
      projectContext: "\nProject: demo (demo).",
    });

    expect(prompt.startsWith("Operator instruction.")).toBe(true);
    expect(prompt).toContain("\nProject: demo (demo).");
    expect(prompt).toContain(WORKER_SYSTEM_PROMPT_LINES[0]);
  });

  it("omits empty additions instead of leaving blank blocks", () => {
    expect(buildWorkerSystemPrompt()).not.toMatch(/\n\n\n/);
  });
});
