import { readFile } from "node:fs/promises";
import { glob } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";

const globAsync = promisify(glob);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const files = await globAsync("{schemas,openapi,tool-specs}/**/*.{json,yaml,yml}", { cwd: root });
const skillFiles = await globAsync("skills/*/SKILL.md", { cwd: root });
const legacySkillFiles = await globAsync("skills/*.json", { cwd: root });
if (files.length === 0) throw new Error("No contract files found");
if (skillFiles.length === 0) throw new Error("No Agent Skills found");
if (legacySkillFiles.length > 0) {
  throw new Error(`Legacy JSON skills are not allowed: ${legacySkillFiles.join(", ")}`);
}
for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  if (!source.trim()) throw new Error(`Empty contract: ${file}`);
  if (file.endsWith(".json")) JSON.parse(source);
}

for (const file of skillFiles) {
  const source = await readFile(path.join(root, file), "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`Invalid Agent Skill frontmatter: ${file}`);

  const frontmatter = parse(match[1]);
  if (!frontmatter || typeof frontmatter !== "object") {
    throw new Error(`Agent Skill frontmatter must be a mapping: ${file}`);
  }
  const expectedName = path.basename(path.dirname(file));
  const supportedFields = new Set([
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
  ]);
  const unsupportedFields = Object.keys(frontmatter).filter((field) => !supportedFields.has(field));
  if (unsupportedFields.length > 0) {
    throw new Error(`Unsupported Agent Skill frontmatter fields in ${file}: ${unsupportedFields.join(", ")}`);
  }
  if (
    typeof frontmatter.name !== "string" ||
    !/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/.test(frontmatter.name) ||
    frontmatter.name !== expectedName
  ) {
    throw new Error(`Agent Skill name must be valid and match its directory: ${file}`);
  }
  if (
    typeof frontmatter.description !== "string" ||
    frontmatter.description.length < 1 ||
    frontmatter.description.length > 1024
  ) {
    throw new Error(`Agent Skill description must contain 1-1024 characters: ${file}`);
  }
  if (!match[2].trim()) throw new Error(`Agent Skill instructions are empty: ${file}`);

  const metadata = frontmatter.metadata;
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    Object.values(metadata).some((value) => typeof value !== "string")
  ) {
    throw new Error(`Agent Skill metadata values must be strings: ${file}`);
  }
  if (typeof metadata["kampaku-display-name"] !== "string") {
    throw new Error(`Missing kampaku-display-name metadata: ${file}`);
  }
  let capabilities;
  try {
    capabilities = JSON.parse(metadata["kampaku-capabilities"]);
  } catch {
    throw new Error(`Invalid kampaku-capabilities metadata: ${file}`);
  }
  if (
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === "string") ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new Error(`kampaku-capabilities must be a unique JSON string array: ${file}`);
  }
  if (
    frontmatter["kampaku-default"] !== undefined ||
    (metadata["kampaku-default"] !== undefined &&
      !["true", "false"].includes(metadata["kampaku-default"]))
  ) {
    throw new Error(`kampaku-default must be a metadata string boolean: ${file}`);
  }
  if (
    frontmatter["allowed-tools"] !== undefined &&
    typeof frontmatter["allowed-tools"] !== "string"
  ) {
    throw new Error(`allowed-tools must be a space-separated string: ${file}`);
  }
  const tools = frontmatter["allowed-tools"]?.split(/\s+/).filter(Boolean) ?? [];
  if (new Set(tools).size !== tools.length) {
    throw new Error(`allowed-tools contains duplicates: ${file}`);
  }
}

console.log(`Validated ${files.length} contract files and ${skillFiles.length} Agent Skills.`);
