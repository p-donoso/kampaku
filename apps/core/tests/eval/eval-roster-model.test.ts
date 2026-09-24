import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The roster model, locked so a design decision cannot be undone by accident.
 *
 * Two decisions are easy to lose and expensive to rediscover:
 *
 * 1. **A seat is fields on `Agent`, not a parallel entity.** An instantiated agent is a role bound to
 *    a scope, holding skills, reporting to a parent. Modelling it as its own class would create the
 *    "equivalent entity" the phase template forbids and that roadmap 09's simplification rules
 *    reject: one `Agent` entity, with lead/specialist/parent/child as relationships.
 *
 * 2. **The shipped catalog and roster are a seed, not a taxonomy.** The skills and platform stations
 *    that ship are suggestions. A project is staffed from its own evidence, and when nothing fits the
 *    factory authors what it needs (roadmap 18). Without that rule the three agnosticism invariants
 *    are bounded by whatever the catalog happens to contain.
 */

const repositoryRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

const ROSTER = "docs/roadmap/08-project-agent-roster.md";
const EXTENSION = "docs/roadmap/18-self-extension.md";
const DOMAIN_MODEL = "docs/concepts/domain-model.md";
const SKILLS_DOC = "docs/concepts/skills.md";
const SKILL_CATALOG = "packages/contracts/skills";

describe("roster model", () => {
  it("models the seat as fields on one Agent entity, never a parallel class", () => {
    const roster = read(ROSTER);
    const domainModel = read(DOMAIN_MODEL);

    // The roster document must define the seat and state that it is not a separate entity.
    expect(roster).toMatch(/^## The seat$/m);
    expect(roster).toMatch(/not a new entity/i);
    expect(roster).toMatch(/one `Agent` entity/i);

    // The canonical noun list must say the same thing, or the two disagree.
    expect(domainModel).toMatch(/seat/i);
    expect(domainModel).toMatch(/not a separate class/i);
    expect(domainModel, "the domain model must keep the canonical Agent term").toMatch(
      /\|\s*\*\*Agent\*\*\s*\|/,
    );

    // A parallel entity would show up as a schema of its own.
    const schemas = readdirSync(resolve(repositoryRoot, "packages/contracts/schemas"));
    expect(
      schemas.filter((file) => /seat/i.test(file)),
      "a seat is a set of fields on Agent, not a durable class with its own lifecycle",
    ).toEqual([]);
  });

  it("names the seat attributes the implementation must expose", () => {
    const roster = read(ROSTER);

    for (const attribute of ["**role**", "**scope**", "**skills[]**", "**parentId**", "**provenance**"]) {
      expect(roster, `the seat must name ${attribute}`).toContain(attribute);
    }

    // And the measured gap must stay visible: the seat's identity currently depends on naming.
    expect(roster).toMatch(/slug suffix/i);
    expect(roster).toMatch(/no skills at all/i);
  });

  it("states that the shipped catalog and roster are a seed, not a taxonomy", () => {
    for (const [path, source] of [
      [ROSTER, read(ROSTER)],
      ["docs/roadmap/07-engineering-skills.md", read("docs/roadmap/07-engineering-skills.md")],
      [SKILLS_DOC, read(SKILLS_DOC)],
    ] as const) {
      expect(source, `${path} must state the seed-set framing`).toMatch(
        /seed, not a taxonomy|starting set|starting set of suggestions/i,
      );
    }

    const extension = read(EXTENSION);
    expect(extension).toMatch(/author/i);
    expect(extension).toMatch(/scope/i);
  });

  it("keeps the authority to author distinct from the authority to act", () => {
    // The single most important constraint in self-extension: an authored skill enables work, it
    // never authorizes it. A generated skill that could widen its own authority would be a way to
    // manufacture permission.
    const extension = read(EXTENSION);

    expect(extension).toMatch(/never\*\* grants authority|never grants authority/i);
    expect(extension).toMatch(/prompt text is not a grant/i);
  });

  it("resolves every skill slug the runtime authorization requires to a real catalog entry", () => {
    // `tools/index.ts` gates actions on skill slugs. A slug that does not exist in the catalog can
    // never be assigned, so the gate can never be satisfied — an unreachable boundary, the F-021
    // family. This asserts the slugs exist; whether a *default station holds* them is F-021's open
    // question and is deliberately not asserted green here.
    const catalog = new Set(readdirSync(resolve(repositoryRoot, SKILL_CATALOG)));
    const tools = read("apps/core/src/agents/runtime/tools/index.ts");

    for (const slug of ["system-agent-roster", "workflow-specialist-delegation", "system-delegation"]) {
      expect(tools, `the runtime must reference ${slug}`).toContain(slug);
      expect(
        catalog.has(slug),
        `the runtime gates an action on "${slug}", which is not in the catalog, so the gate can never be satisfied`,
      ).toBe(true);
    }
  });

  it("keeps the self-extension phase reachable from the sequence and the README", () => {
    // A document nothing schedules and nothing links is a document nobody reads.
    expect(existsSync(resolve(repositoryRoot, EXTENSION))).toBe(true);

    const readme = read("docs/roadmap/README.md");
    expect(readme).toContain("18-self-extension.md");

    // Internal roadmap links are relative to the roadmap directory, so assert the file name rather
    // than a repository-root path.
    const fileName = "18-self-extension.md";
    expect(read(ROSTER), "the roster depends on the authoring path").toContain(fileName);
    expect(read("docs/roadmap/05-adoption-sequence.md")).toContain(fileName);
    expect(read("docs/roadmap/07-engineering-skills.md")).toContain(fileName);
  });
});
