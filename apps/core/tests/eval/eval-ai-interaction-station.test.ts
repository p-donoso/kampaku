import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  PLATFORM_TEAM_SKILL_ASSIGNMENTS,
  defaultProjectTeamSlugs,
} from "../../src/application/bootstrap/kampaku-platform-team.js";

/**
 * Roadmap phase 17 adds AI-interaction expertise to the factory. Where it landed matters, and the
 * decision is subtle enough to be undone by accident, so it is locked here.
 *
 * The request that produced the phase was to add a prompt expert to the **default roster**. Taken
 * literally that conflicts with the agnosticism invariants, because `defaultProjectTeamSlugs()` is a
 * hardcoded `lead / frontend / backend / qa / auditor` team — the web-application taxonomy the
 * invariants forbid and roadmap 07 lists as work to remove. Adding a seventh fixed role would deepen
 * that defect and serve no project that is not a web app.
 *
 * So the expertise is placed by what each mechanism is for:
 *   - the **catalog** carries the skill (always available, owns no work by itself);
 *   - the **platform team** carries the station, because the platform genuinely is software full of
 *     system prompts and Agent Skills, which is a fact about this repository;
 *   - a **subject project** gets the specialist from a discovered aspect, not from the template.
 */

const repositoryRoot = resolve(process.cwd(), "../..");
const platformTeamSource = readFileSync(
  resolve(repositoryRoot, "apps/core/src/application/bootstrap/kampaku-platform-team.ts"),
  "utf8",
);
const skillCatalogDirectory = resolve(repositoryRoot, "packages/contracts/skills");

describe("AI-interaction station", () => {
  it("staffs a prompt engineer on the platform team, under the platform lead", () => {
    expect(PLATFORM_TEAM_SKILL_ASSIGNMENTS["kampaku-prompt-engineer"]).toBeDefined();
    expect(PLATFORM_TEAM_SKILL_ASSIGNMENTS["kampaku-prompt-engineer"]).toContain(
      "ai-prompt-engineering",
    );

    // It must report to the manager, like every other platform specialist.
    const entry = platformTeamSource.slice(
      platformTeamSource.indexOf('slug: "kampaku-prompt-engineer"'),
    );
    const parent = entry.match(/parentSlug: "([^"]+)"/)?.[1];
    expect(parent).toBe("kampaku-manager");
  });

  it("ships the capability in the catalog and does not force it on every agent", () => {
    const skillPath = resolve(skillCatalogDirectory, "ai-prompt-engineering/SKILL.md");
    expect(existsSync(skillPath), "the ai-prompt-engineering skill must exist").toBe(true);

    const skill = readFileSync(skillPath, "utf8");

    // A specialist capability, not a default: `kampaku-default: "true"` assigns a skill to *every*
    // agent, and prompt-engineering instructions on a database specialist are noise.
    expect(skill).not.toMatch(/kampaku-default:\s*"true"/);

    // Its instructions must carry the four non-negotiables, or it is not this role.
    expect(skill).toMatch(/a prompt is behaviour/i);
    expect(skill).toMatch(/two different OpenAI-compatible endpoints/i);
    expect(skill).toMatch(/never log, echo, persist, or include a key/i);
    expect(skill).toMatch(/tokens, attempts, and latency from the application's own records/i);

    // And it must not assume a stack, which is the phase-03 rule applied to a prompt skill.
    expect(skill).not.toMatch(/\bnpm\b|\bpackage\.json\b|\bvitest\b|\bpytest\b/i);
  });

  it("keeps the specialist out of the fixed project-team template", () => {
    // The guard. If someone adds the role here, they reintroduce the taxonomy defect and every
    // non-web project inherits a station it does not need.
    const template = defaultProjectTeamSlugs("demo");

    expect(template).not.toContain("demo-prompt");
    expect(template.some((slug) => /prompt|ai-|-ai$/.test(slug.replace(/^demo-/, "")))).toBe(false);

    // And the template must say why it is a defect, so the next contributor reads it before adding.
    // The warning lives in the doc comment above the function, so anchor there, not on the signature.
    const warningAnchor = platformTeamSource.indexOf(
      "Default specialist slugs for a new project team",
    );
    expect(warningAnchor, "the template's doc comment must survive").toBeGreaterThan(-1);
    const templateSource = platformTeamSource.slice(warningAnchor);

    expect(templateSource).toMatch(/known defect, not a pattern to extend/i);
    expect(templateSource).toMatch(/roadmap 07 owns replacing this function/i);
    expect(templateSource).toMatch(/roadmap 17 therefore adds/i);
  });

  it("references only skills that exist in the catalog", () => {
    // `syncPlatformTeamSkills` filters desired skills by availability, so a typo in this table
    // silently produces a station with no skills at all — the same failure shape as an instruction
    // naming an unreachable tool (BOARD F-001).
    const catalog = new Set(readdirSync(skillCatalogDirectory));

    for (const [slug, skills] of Object.entries(PLATFORM_TEAM_SKILL_ASSIGNMENTS)) {
      for (const skill of skills) {
        expect(
          catalog.has(skill),
          `platform team "${slug}" references skill "${skill}", which is not in the catalog, so the station would silently have no skills`,
        ).toBe(true);
      }
    }
  });
});
