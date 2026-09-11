import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { SkillRecord } from "./skill-store.js";

const SKILL_FILE = "SKILL.md";
const DISPLAY_NAME_KEY = "kampaku-display-name";
const CAPABILITIES_KEY = "kampaku-capabilities";
const DEFAULT_KEY = "kampaku-default";
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/;
const STANDARD_FRONTMATTER_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

interface AgentSkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
}

function assertValidSlug(slug: string): void {
  if (slug.length < 1 || slug.length > 64 || !SKILL_NAME_PATTERN.test(slug)) {
    throw new Error(`Invalid Agent Skill name: "${slug}".`);
  }
}

function catalogDir(workspaceRoot: string): string {
  return join(workspaceRoot, "packages/contracts", "skills");
}

function skillDir(workspaceRoot: string, slug: string): string {
  return join(catalogDir(workspaceRoot), slug);
}

function catalogPath(workspaceRoot: string, slug: string): string {
  return join(skillDir(workspaceRoot, slug), SKILL_FILE);
}

function parseStringArray(value: string | undefined, field: string): string[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Invalid ${field} metadata: expected a JSON string array.`);
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`Invalid ${field} metadata: expected a JSON string array.`);
  }
  return parsed;
}

export function parseSkillMarkdown(source: string, expectedSlug?: string): SkillRecord {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error("Invalid SKILL.md: expected YAML frontmatter and a Markdown body.");

  const frontmatter = parse(match[1]) as AgentSkillFrontmatter | null;
  if (!frontmatter || typeof frontmatter !== "object") {
    throw new Error("Invalid SKILL.md: frontmatter must be a YAML mapping.");
  }
  if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") {
    throw new Error("Invalid SKILL.md: name and description are required strings.");
  }
  assertValidSlug(frontmatter.name);
  if (frontmatter.description.length < 1 || frontmatter.description.length > 1024) {
    throw new Error("Invalid SKILL.md: description must contain 1-1024 characters.");
  }
  const unsupportedFields = Object.keys(frontmatter).filter(
    (field) => !STANDARD_FRONTMATTER_FIELDS.has(field),
  );
  if (unsupportedFields.length > 0) {
    throw new Error(`Invalid SKILL.md: unsupported frontmatter fields: ${unsupportedFields.join(", ")}.`);
  }
  if (
    (frontmatter.license !== undefined && typeof frontmatter.license !== "string") ||
    (frontmatter.compatibility !== undefined &&
      (typeof frontmatter.compatibility !== "string" ||
        frontmatter.compatibility.length < 1 ||
        frontmatter.compatibility.length > 500))
  ) {
    throw new Error("Invalid SKILL.md: license or compatibility metadata is invalid.");
  }
  if (expectedSlug && frontmatter.name !== expectedSlug) {
    throw new Error(
      `Invalid SKILL.md: name "${frontmatter.name}" must match directory "${expectedSlug}".`,
    );
  }
  if (
    frontmatter.metadata !== undefined &&
    (typeof frontmatter.metadata !== "object" ||
      Array.isArray(frontmatter.metadata) ||
      Object.values(frontmatter.metadata).some((value) => typeof value !== "string"))
  ) {
    throw new Error("Invalid SKILL.md: metadata values must be strings.");
  }
  if (
    frontmatter["allowed-tools"] !== undefined &&
    typeof frontmatter["allowed-tools"] !== "string"
  ) {
    throw new Error("Invalid SKILL.md: allowed-tools must be a space-separated string.");
  }

  const metadata = frontmatter.metadata ?? {};
  const capabilities = parseStringArray(metadata[CAPABILITIES_KEY], CAPABILITIES_KEY);
  if (new Set(capabilities).size !== capabilities.length) {
    throw new Error(`Invalid ${CAPABILITIES_KEY} metadata: values must be unique.`);
  }
  if (metadata[DEFAULT_KEY] !== undefined && !["true", "false"].includes(metadata[DEFAULT_KEY])) {
    throw new Error(`Invalid ${DEFAULT_KEY} metadata: expected "true" or "false".`);
  }
  const tools = frontmatter["allowed-tools"]?.split(/\s+/).filter(Boolean) ?? [];
  if (new Set(tools).size !== tools.length) {
    throw new Error("Invalid SKILL.md: allowed-tools values must be unique.");
  }
  const instructions = match[2].replace(/^\r?\n/, "").trimEnd();
  if (!instructions.trim()) throw new Error("Invalid SKILL.md: Markdown instructions are required.");

  return {
    slug: frontmatter.name,
    name: metadata[DISPLAY_NAME_KEY] ?? frontmatter.name,
    description: frontmatter.description,
    capabilities,
    tools,
    promptFragment: instructions,
    default: metadata[DEFAULT_KEY] === "true",
  };
}

export function serializeSkillMarkdown(skill: SkillRecord): string {
  assertValidSlug(skill.slug);
  if (!skill.name.trim()) throw new Error("Invalid Kampaku skill: display name is required.");
  const metadata: Record<string, string> = {
    [DISPLAY_NAME_KEY]: skill.name,
    [CAPABILITIES_KEY]: JSON.stringify(skill.capabilities),
  };
  if (skill.default) metadata[DEFAULT_KEY] = "true";

  const frontmatter: AgentSkillFrontmatter = {
    name: skill.slug,
    description: skill.description,
    metadata,
  };
  if (skill.tools.length > 0) frontmatter["allowed-tools"] = skill.tools.join(" ");

  return `---\n${stringify(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${skill.promptFragment.trimEnd()}\n`;
}

export function writeSkillToCatalog(workspaceRoot: string, skill: SkillRecord): void {
  const source = serializeSkillMarkdown(skill);
  parseSkillMarkdown(source, skill.slug);
  const dir = skillDir(workspaceRoot, skill.slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(catalogPath(workspaceRoot, skill.slug), source, "utf8");
}

export function deleteSkillFromCatalog(workspaceRoot: string, slug: string): void {
  const dir = skillDir(workspaceRoot, slug);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
}

export function renameSkillInCatalog(
  workspaceRoot: string,
  oldSlug: string,
  newSlug: string,
): void {
  const oldDir = skillDir(workspaceRoot, oldSlug);
  if (!existsSync(oldDir)) return;
  renameSync(oldDir, skillDir(workspaceRoot, newSlug));
}

export function readSkillFromCatalog(workspaceRoot: string, slug: string): SkillRecord | undefined {
  const path = catalogPath(workspaceRoot, slug);
  if (!existsSync(path)) return undefined;
  return parseSkillMarkdown(readFileSync(path, "utf8"), slug);
}
