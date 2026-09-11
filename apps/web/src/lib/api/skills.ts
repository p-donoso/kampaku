import type { SkillRecord } from "../types";
import { toApiError } from "../api-errors";
import { fetchJson, getBaseUrl } from "./client";

/**
 * Lists all registered skills and their assigned agents.
 */
export function listSkills(): Promise<{ skills: SkillRecord[] }> {
  return fetchJson("/api/v1/skills");
}

/**
 * Retrieves details of a single skill by slug.
 * @param slug - Unique skill slug.
 */
export function getSkill(slug: string): Promise<SkillRecord> {
  return fetchJson(`/api/v1/skills/${encodeURIComponent(slug)}`);
}

/**
 * Registers a new skill in the catalog.
 */
export function createSkill(input: {
  slug: string;
  name: string;
  description: string;
  capabilities?: string[];
  tools?: string[];
  prompt_fragment: string;
}): Promise<SkillRecord> {
  return fetchJson("/api/v1/skills", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Updates properties of an existing skill.
 */
export function updateSkill(
  slug: string,
  input: {
    slug?: string;
    name?: string;
    description?: string;
    capabilities?: string[];
    tools?: string[];
    prompt_fragment?: string;
  },
): Promise<SkillRecord> {
  return fetchJson(`/api/v1/skills/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Removes a skill from the catalog if unassigned.
 */
export function deleteSkill(slug: string): Promise<void> {
  const path = `/api/v1/skills/${encodeURIComponent(slug)}`;
  return fetch(`${getBaseUrl()}${path}`, { method: "DELETE" }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text();
      throw toApiError(path, res.status, body, { entityType: "skill", action: "delete" });
    }
  });
}
