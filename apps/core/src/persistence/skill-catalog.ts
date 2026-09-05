import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillRecord } from "./skill-store.js";

function catalogDir(workspaceRoot: string): string {
  return join(workspaceRoot, "packages/contracts", "skills");
}

function catalogPath(workspaceRoot: string, slug: string): string {
  return join(catalogDir(workspaceRoot), `${slug}.json`);
}

export function writeSkillToCatalog(workspaceRoot: string, skill: SkillRecord): void {
  const dir = catalogDir(workspaceRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(catalogPath(workspaceRoot, skill.slug), `${JSON.stringify(skill, null, 2)}\n`, "utf8");
}

export function deleteSkillFromCatalog(workspaceRoot: string, slug: string): void {
  const path = catalogPath(workspaceRoot, slug);
  if (existsSync(path)) unlinkSync(path);
}

export function readSkillFromCatalog(workspaceRoot: string, slug: string): SkillRecord | undefined {
  const path = catalogPath(workspaceRoot, slug);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as SkillRecord;
}
