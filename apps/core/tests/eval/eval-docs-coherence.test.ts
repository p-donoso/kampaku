import { describe, expect, it } from "vitest";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, dirname, relative, resolve } from "node:path";

/**
 * Product-documentation coherence.
 *
 * The evaluation lab scores the factory's behavior. This file scores a property the lab cannot see:
 * that the documents describing the product describe *the same* product. It exists because the
 * product once shipped two incompatible framings at once — a software factory in one document and a
 * catch-all harness in another — and nothing failed when that happened.
 */

const repositoryRoot = resolve(process.cwd(), "../..");
const documentationRoot = resolve(repositoryRoot, "docs");

/** Documents that describe the product itself, and that must agree about what it is. */
const ACTIVE_DOCUMENTS = [
  "docs/product/software-factory.md",
  "docs/product/vision.md",
  "docs/branding/foundations.md",
  "docs/concepts/agnosticism-invariants.md",
  "docs/concepts/domain-model.md",
  "docs/architecture/overview.md",
  "docs/security/security-model.md",
  "docs/eval/README.md",
  "docs/roadmap/README.md",
  "docs/roadmap/01-philosophy.md",
];

/** Every roadmap phase document must obey the roadmap's own governance rules. */
const ROADMAP_PHASES = [
  "docs/roadmap/01-philosophy.md",
  "docs/roadmap/02-factory-flow.md",
  "docs/roadmap/03-quality-and-testing.md",
  "docs/roadmap/04-capability-program.md",
  "docs/roadmap/05-adoption-sequence.md",
  "docs/roadmap/06-project-context.md",
  "docs/roadmap/07-engineering-skills.md",
  "docs/roadmap/08-project-agent-roster.md",
  "docs/roadmap/09-domain-model-naming.md",
  "docs/roadmap/10-context-minimization.md",
  "docs/roadmap/11-multi-provider-routing.md",
];

/** Text that promises arbitrary work, or a non-software deliverable as factory output. */
const SCOPE_LEAK = [
  /\bany domain\b/i,
  /domain[- ]agnostic/i,
  /any kind of human work/i,
  /every kind of (human )?work/i,
  /\bnovels?\b/i,
  /\bscreenplays?\b/i,
  /\bpoetry\b/i,
];

/**
 * A leaked phrase is acceptable on a line that marks it as history, a refusal, or a negative
 * example. The marker must be on the same line, so a document cannot quote a catch-all promise in
 * one paragraph and disclaim it in another.
 */
const SCOPE_LEAK_MARKER =
  /refus|out of scope|out-of-scope|supersed|retired|reject|fail|does not|must not|never|removed|historical/i;

const STATUTE = "software-factory.md";
const INVARIANTS = "agnosticism-invariants.md";

/** A canonical document is allowed to be its own subject instead of linking to itself. */
const CANONICAL_DOCUMENTS = new Set([
  "docs/product/software-factory.md",
  "docs/concepts/agnosticism-invariants.md",
]);

/**
 * A document may quote the retired "any domain" framing, but only while marking it as superseded
 * history. A document that makes the same claim as a live promise is the defect this locks out.
 */
const CATCH_ALL_CLAIM =
  /\bany domain\b|domain[- ]agnostic|\bcatch-all (harness|platform|assistant|agent)\b|every kind of human work|any kind of human work/i;
const SUPERSESSION_MARKER = /supersed|retired|shift from|resolved in favour|out of scope|refus/i;

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
]);

function read(path: string): string {
  const absolute = resolve(repositoryRoot, path);
  if (!existsSync(absolute)) throw new Error(`Missing document: ${path}`);
  return readFileSync(absolute, "utf8");
}

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const absolute = join(directory, entry);
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) walk(absolute, found);
    else if (stats.isFile() && [".md", ".mdc"].includes(extname(entry))) found.push(absolute);
  }
  return found;
}

function documentFiles(): string[] {
  const atRoot = readdirSync(repositoryRoot)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => join(repositoryRoot, entry));
  return [...atRoot, ...walk(documentationRoot), ...walk(resolve(repositoryRoot, ".cursor"))];
}

describe("product documents describe one product", () => {
  it("has every active document present and framed as a software product", () => {
    for (const path of ACTIVE_DOCUMENTS) {
      const source = read(path);
      expect(source, `${path} must state that the deliverable is software`).toMatch(/software/i);
      expect(source, `${path} must keep the factory framing`).toMatch(
        /software factory|software work order|shipped software|software is the deliverable/i,
      );
    }
  });

  it("links every active document to the statute and the invariants", () => {
    for (const path of ACTIVE_DOCUMENTS) {
      if (CANONICAL_DOCUMENTS.has(path)) continue;
      const source = read(path);
      expect(source, `${path} must link the product statute`).toContain(STATUTE);
      expect(source, `${path} must link the agnosticism invariants`).toContain(INVARIANTS);
    }

    // The two canonical documents still have to reference each other.
    expect(read("docs/product/software-factory.md")).toContain(INVARIANTS);
    expect(read("docs/concepts/agnosticism-invariants.md")).toContain(STATUTE);
  });

  it("states the refusal boundary in the statute and scores it in the eval bar", () => {
    const statute = read("docs/product/software-factory.md");
    for (const category of [
      "Creative writing",
      "research",
      "Non-technical documents",
      "Design as a standalone deliverable",
    ]) {
      expect(statute, `statute must name the refused category "${category}"`).toContain(category);
    }

    const evalReadme = read("docs/eval/README.md");
    expect(evalReadme).toMatch(/F1 Software scope/);
    expect(evalReadme).toMatch(/No suite requires or accepts a non-technical deliverable/);
  });

  it("keeps the three agnosticism invariants explicit, scored, and testable", () => {
    const invariants = read("docs/concepts/agnosticism-invariants.md");
    for (const invariant of ["Language-agnostic", "Project-type-agnostic", "Architecture-agnostic"]) {
      expect(invariants, `invariants must define ${invariant}`).toContain(invariant);
    }
    for (const gate of ["F2", "F3", "F4"]) {
      expect(invariants, `invariants must name the gate ${gate} that scores them`).toContain(gate);
    }
    for (const suite of [
      "18-language-agnostic.md",
      "19-brownfield-and-legacy.md",
      "20-multi-repo-and-services.md",
    ]) {
      expect(existsSync(resolve(documentationRoot, "eval", suite)), `missing eval ${suite}`).toBe(true);
    }
  });

  it("keeps completion dependent on evidence rather than on a claim", () => {
    expect(read("docs/product/software-factory.md")).toMatch(
      /Done requires evidence re-executed against the artifact/i,
    );
    expect(read("docs/product/vision.md")).toMatch(/Verified, not claimed/i);
    expect(read("docs/eval/factory-contract.md")).toMatch(
      /A reply that claims durable changes its own turn did not make is reported as containing unverified/i,
    );
  });

  it("keeps repository isolation and bounded authority explicit", () => {
    expect(read("docs/product/software-factory.md")).toMatch(/the platform is not the project/i);

    const contract = read("docs/eval/factory-contract.md");
    expect(contract).toMatch(/Runtime authorization is enforced in code/);
    expect(contract).toMatch(/Prompt text is never a grant/);

    const security = read("docs/security/security-model.md");
    expect(security).toMatch(/sandbox/i);
    expect(security).toMatch(/path policy/i);
  });

  it("gives every roadmap phase metadata, a gate, and the scope constraints it must not break", () => {
    for (const path of ROADMAP_PHASES) {
      const source = read(path);
      const name = path.replace("docs/roadmap/", "");

      // Phase metadata, as required by 00-template.md.
      for (const field of ["**Phase:**", "**Status:**", "**Owner:**", "**Dependencies:**"]) {
        expect(source, `${name} must declare ${field}`).toContain(field);
      }

      // Every phase states the gate it must clear and the scope it may not widen.
      expect(source, `${name} must state its gate`).toMatch(/^## Gate$/m);
      expect(source, `${name} must state its scope constraints`).toMatch(
        /^## Software scope and invariants$/m,
      );
      expect(source, `${name} must link the product statute`).toContain(STATUTE);
      expect(source, `${name} must link the agnosticism invariants`).toContain(INVARIANTS);

      // A phase may not quietly promise work outside the deliverable.
      for (const pattern of SCOPE_LEAK) {
        for (const [index, line] of source.split("\n").entries()) {
          const match = line.match(pattern);
          if (!match) continue;
          expect(
            line,
            `${name}:${index + 1} contains a scope-leaking phrase ("${match[0]}") that the same line does not mark as refused, superseded, or a negative example`,
          ).toMatch(SCOPE_LEAK_MARKER);
        }
      }
    }
  });

  it("keeps the roadmap phase numbering distinct from the adoption sequence", () => {
    const adoption = read("docs/roadmap/05-adoption-sequence.md");

    // The adoption sequence is an order, not a second set of phase numbers: two documents both
    // numbered "Phase 3" for different subjects is the collision this locks out.
    expect(adoption).toMatch(/^## Step 0 —/m);
    expect(adoption).not.toMatch(/^## Phase \d+ — /m);

    const readme = read("docs/roadmap/README.md");
    for (const path of ROADMAP_PHASES) {
      const name = path.replace("docs/roadmap/", "");
      expect(readme, `roadmap README must list ${name}`).toContain(name);
    }
  });

  it("leaves no live document promising arbitrary non-software work", () => {
    const offenders: string[] = [];
    for (const file of documentFiles()) {
      const source = readFileSync(file, "utf8");
      if (CATCH_ALL_CLAIM.test(source) && !SUPERSESSION_MARKER.test(source)) {
        offenders.push(relative(repositoryRoot, file));
      }
    }
    expect(
      offenders,
      `these documents still present Kampaku as a catch-all: ${offenders.join(", ")}. ` +
        "Remove the claim, or mark it as superseded history in the same document.",
    ).toEqual([]);
  });

  it("describes the same product in shipped metadata and operator surfaces", () => {
    const manifest = JSON.parse(read("package.json")) as { description?: string };
    expect(manifest.description).toMatch(/software factory/i);
    expect(manifest.description).not.toMatch(/autonomous agent|agent orchestration/i);

    const webMetadata = read("apps/web/src/app/layout.tsx");
    expect(webMetadata).toMatch(/software factory/i);
    expect(webMetadata).not.toMatch(/control plane for autonomous/i);

    const cliWelcome = read("apps/core/src/cli/welcome.ts");
    expect(cliWelcome).toMatch(/Personal software factory/);
    expect(cliWelcome).not.toMatch(/Autonomous agent control plane/);
  });

  it("has no broken relative link in any repository document", () => {
    const broken: string[] = [];
    const linkPattern = /\[[^\]]*\]\(([^)\s]+)\)/g;

    for (const file of documentFiles()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(linkPattern)) {
        const target = match[1];
        if (/^(https?:|mailto:|#|<)/.test(target)) continue;
        const withoutAnchor = target.split("#")[0];
        if (!withoutAnchor) continue;
        const absolute = resolve(dirname(file), withoutAnchor);
        const resolvable = [absolute, `${absolute}.md`, `${absolute}.mdc`, join(absolute, "README.md")]
          .some((candidate) => existsSync(candidate));
        if (!resolvable) broken.push(`${relative(repositoryRoot, file)} -> ${target}`);
      }
    }

    expect(broken, `broken document links:\n${broken.join("\n")}`).toEqual([]);
  });
});
