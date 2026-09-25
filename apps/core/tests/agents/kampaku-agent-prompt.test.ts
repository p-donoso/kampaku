import { describe, expect, it } from "vitest";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";

describe("kampaku agent prompt", () => {
  it("includes markdown formatting guidance and question protocol rules", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("<kampaku-question>");
    expect(prompt.toLowerCase()).toMatch(/markdown|github-flavored|headings|bullet/);
    expect(prompt).toContain("English");
  });

  /**
   * An agent asked to create a project tried `update_project`, got "Project not found", and told the
   * emperor that projects are "typically created by submit_intent with create_missing_agents: true" —
   * a mechanism that does not exist. The tool existed; the guidance never mentioned it, and the
   * failure was explained away rather than corrected.
   */
  it("names create_project and states that a project is never created implicitly", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("create_project");
    expect(prompt).toContain("never created implicitly");
    expect(prompt).toContain("do not infer a different creation path");
  });

  /**
   * Baseline run 2, prompt 4: `Show me the container from the command line` was read as a **Docker**
   * container. The reply explained that `docker ps -a` was needed, and offered *"should I simulate the
   * output based on hypothetical values?"* — so an ordinary request collided with an unrelated
   * technology **and** the fallback offered was to fabricate the result (BOARD F-029).
   *
   * Both halves are locked here because both live in the prompt. The tool-description half is locked
   * in `create-project.test.ts`.
   */
  it("anchors \"container\" to the Project, and refuses a simulated result", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("the Project record that a work order lives in");
    expect(prompt).toContain("not a Docker container or any other runtime object");
    expect(prompt).toContain("never offer to simulate one");
  });

  /**
   * Baseline run 2, prompt 3: the container was created with `lead=none` and described as success, while
   * prompt 2 had already shown the agent knew a lead was required (BOARD F-005). The tool refuses this.
   * The prompt has to state the order, because `update_project` is not in the front-office allowlist and
   * nothing can link a lead to a container afterwards.
   */
  it("requires the lead to exist before the container, and says why", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("A work order is open only when its container exists");
    expect(prompt).toContain("has a linked lead");
    expect(prompt).toContain("Never call create_project without a lead");
  });

  /**
   * F-038: a reply told the operator to use a tool the front office is forbidden to call.
   *
   * Measured in the suite-02 live run. Asked to open a work order **without** a repository attached, the
   * reply closed with *"No repositories linked yet — you can add one with `update_project` when ready."*
   * `update_project` is a line tool: the contract lock asserts the front office may never hold it, so the
   * suggestion was unactionable by the desk that made it and by the operator following it from chat.
   *
   * The model invented nothing. The resident `system-project-bootstrap` fragment said *"when linking a
   * repository **via** `update_project`"* on every turn, so the name was in the prompt and the reply echoed
   * it. That fragment is no longer resident, and this locks the rule that replaces the reliance on it.
   */
  it("forbids telling the emperor to use a tool the front office does not hold", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("You hold exactly the tools listed in your toolset");
    expect(prompt).toContain("never tell the emperor to use a tool you do not hold");
    // And it names the form the operator can actually run, rather than leaving 'say which surface' abstract.
    expect(prompt).toContain("kampaku projects update");
  });

  /**
   * The other half of F-038: the desk must not promise a link it has no tool to make.
   *
   * A repository is linked by the same call that opens the container, so a container opened without one
   * cannot gain one from this desk afterwards. The prompt has to say that, or the reply implies a later
   * step that does not exist — which is what happened.
   */
  it("states that a repository is linked when the container opens, and not after", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("a repository is linked when the container opens");
    expect(prompt).toContain("You have no tool to attach one to a container afterwards");
  });

  /**
   * The prompt is a template literal, so a backtick in it ends the string. Asserted because that is how
   * this text was broken once while writing it, and tsc caught it only because the file failed to compile —
   * a fragment of prose is not worth a compile break.
   */
  it("reads as prose without code fences, because it is a template literal", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("never tell the emperor to use a tool you do not hold");
    expect(prompt).not.toContain("`");
  });
});
