import type { AgentStore } from "../persistence/agent-store.js";
import type { SkillStore } from "../persistence/skill-store.js";

/**
 * **Staffing is a claim about a team, and this is the check that reads the claim off the tree.**
 *
 * The defect this file exists for is BOARD F-006, measured first on suite 03 and again on run `s03r3`:
 * the factory proposed a station set, then created something else. Two shapes were measured in the same
 * lab, and neither was visible to the reader of the reply:
 *
 * 1. **A role absorbed or dropped.** The original row: *"The factory proposed a 6-role team with a
 *    dedicated owner for the hard subsystem, then created 5 and absorbed the missing role into another —
 *    while the lead's own description still claimed 6."*
 * 2. **A skill substituted.** `s03r3`, the run whose roster matched its proposal exactly: *"The lead's
 *    proposal named skill slugs that do not exist in this factory's catalog (`nextjs-app-router`,
 *    `react-components`, …). I did not create agents with dangling skills — I mapped each station to
 *    skills that exist."* The five seats were real; the **capabilities** in the proposal were not, and
 *    the only record of the substitution was one sentence of prose the turn happened to write.
 *
 * The second shape is why this check is not about the number of seats. `create_sub_agent` returned
 * `{id, slug, name}` — a receipt, not a roster — so the turn's account of the team came from its own
 * argument list plus whatever it remembered proposing. Nothing compared that account against the store,
 * which is the same defect as [F-114]'s fabricated status report one layer down: a claim the tree
 * contradicts, with no surface that could have contradicted it.
 *
 * **What it is not.** A substitution is not a refusal to staff, and this does not make one. BOARD F-022
 * is the row that makes substitutions unnecessary (a station whose aspect has no catalog skill needs one
 * authored); until it lands, the honest behaviour is to staff with the closest capability the catalog
 * holds **and say so**, which is what this function renders. Nor does it decide that a proposal is wrong:
 * it reports the proposal's every difference from the tree, seat by seat, with the reason the store gave
 * or the catalog implied.
 *
 * The shape — findings plus a rendered summary, so a caller prints one block — is
 * `assessPlanRoster`'s in `roster-validation.ts`, deliberately: a plan and a staffing request are the
 * same claim made at two points in the same work order.
 */

/** One station a staffing request proposed. */
export interface ProposedStation {
  slug: string;
  /** The durable capabilities the proposal asked the seat to own. */
  skillSlugs?: string[];
}

/**
 * `seat_not_created` — the proposal named a station the tree does not hold. `skill_not_granted` — the
 * station exists and a skill the proposal named for it was not granted.
 */
export type StaffingFindingKind = "seat_not_created" | "skill_not_granted";

export interface StaffingFinding {
  kind: StaffingFindingKind;
  /** The station the finding is about, by slug. */
  station: string;
  /** One sentence naming what was proposed, what exists, and what the reader can do about it. */
  detail: string;
}

/** A seat as the tree holds it — the only description of a team this product is allowed to report. */
export interface StaffingSeat {
  slug: string;
  name: string;
  /** The slug of the seat this one reports to, or `null` for a root seat. */
  parentSlug: string | null;
  skills: string[];
}

export interface StaffingAssessment {
  /** The seat whose subtree is the roster under discussion. Absent when no lead resolved at all. */
  leadSlug?: string;
  /** Every seat under that lead, as the store holds it, with the skills assigned to it. */
  seats: StaffingSeat[];
  /** One entry per difference between the proposal and the tree. Empty when they agree. */
  findings: StaffingFinding[];
  /** The block a caller prints in the reply the emperor reads. Absent when there is nothing to report. */
  summary?: string;
}

function parentSlugFor(agentStore: AgentStore, parentId: string | null): string | null {
  if (!parentId) return null;
  return agentStore.getAgentBySlugOrId(parentId)?.slug ?? null;
}

/**
 * The seats under one lead, with their skills — read from the stores, never from the proposal.
 *
 * The lead itself is part of the roster: a station set with no accountable owner is not a staffing, and
 * a reply that lists five specialists must be able to show the sixth seat they report to.
 */
export function staffingSeats(
  agentStore: AgentStore,
  skillStore: SkillStore,
  leadSlug: string | undefined,
): StaffingSeat[] {
  if (!leadSlug) return [];
  const lead = agentStore.getAgentBySlugOrId(leadSlug);
  if (!lead) return [];

  const ids = [lead.id, ...agentStore.getDescendantIds(lead.id)];
  return ids.map((id) => {
    const agent = agentStore.getAgentBySlugOrId(id)!;
    return {
      slug: agent.slug,
      name: agent.name,
      parentSlug: parentSlugFor(agentStore, agent.parentId),
      skills: [...skillStore.listAgentSkills(agent.id)].sort(),
    };
  });
}

/**
 * **The roster a staffing request proposed, resolved against the seats that exist under its lead.**
 *
 * `refused` is how a station that a caller *tried* to create reaches this function: the store's own refusal
 * sentence (`Slug "kampaku" is reserved.`, `Agent with slug "x" already exists.`) is the reason the reader
 * can act on, so it is carried rather than guessed.
 *
 * Both halves of a silence are named here. A station missing from the tree is a finding even when no
 * refusal was recorded, because "the proposal said six and the tree holds five" is the defect itself; a
 * requested skill absent from the seat is a finding even when the seat is real, because a station whose
 * described capability does not exist is the same lie in a smaller place.
 *
 * And a refusal is reported **even when the slug exists**, because it is the one case where the tree alone
 * would mislead: a duplicate create answers `already exists`, the seat is in the roster, and a check that
 * only compared slugs would report agreement — while *this call* created nothing and the caller's own
 * request was refused. The seat listed is the one that was already there, and the finding says so.
 */
export function assessStaffingRoster(
  agentStore: AgentStore,
  skillStore: SkillStore,
  options: {
    leadSlug?: string;
    proposal: ProposedStation[];
    /** Slug → the reason the store gave for not creating it. */
    refused?: Record<string, string>;
  },
): StaffingAssessment {
  const { leadSlug, proposal } = options;
  const refused = options.refused ?? {};
  const seats = staffingSeats(agentStore, skillStore, leadSlug);
  const bySlug = new Map(seats.map((seat) => [seat.slug, seat]));

  const findings: StaffingFinding[] = [];
  for (const station of proposal) {
    const seat = bySlug.get(station.slug);
    const refusal = refused[station.slug];
    if (seat && refusal) {
      findings.push({
        kind: "seat_not_created",
        station: station.slug,
        detail:
          `This call did not create "${station.slug}": ${refusal} A seat with that slug is already under ` +
          `${leadSlug ?? "this lead"} — it existed before this request, and its skills are the ones listed ` +
          `above, not the ones this request named. ` +
          `If the station was to be placed here, name the existing seat and use its grants, or place it ` +
          `under a slug nothing holds yet.`,
      });
      continue;
    }
    if (!seat) {
      const reason = refusal;
      findings.push({
        kind: "seat_not_created",
        station: station.slug,
        detail:
          `"${station.slug}" was proposed and is not a seat under ${leadSlug ?? "this lead"}` +
          `${reason ? `: ${reason}` : " — no such seat exists in the store"}. ` +
          `The team is the ${seats.length} seat(s) this check read from the tree` +
          `${seats.length > 0 ? ` (${seats.map((entry) => entry.slug).join(", ")})` : ""}, ` +
          `and nothing else was created. ` +
          (reason
            ? `Act on the refusal to place it — a different slug, or the seat it collided with — and read ` +
              `the roster again before describing the team.`
            : `Create the station again if the team needs it, then read the roster again.`),
      });
      continue;
    }

    const granted = new Set(seat.skills);
    for (const requested of station.skillSlugs ?? []) {
      if (granted.has(requested)) continue;
      const inCatalog = Boolean(skillStore.getSkill(requested));
      findings.push({
        kind: "skill_not_granted",
        station: station.slug,
        detail:
          `"${station.slug}" was proposed with skill "${requested}", which ` +
          (inCatalog
            ? `this factory's catalog holds and the seat does not carry`
            : `this factory's catalog does not hold`) +
          `. The seat holds ${seat.skills.length > 0 ? seat.skills.join(", ") : "no skills at all"} ` +
          `instead. Nothing was created with a dangling skill — say which capability was substituted, ` +
          `or author the missing skill (BOARD F-022) and grant it.`,
      });
    }
  }

  const summary =
    findings.length === 0
      ? undefined
      : [
          `Roster check — the seats that exist under ${leadSlug ?? "this lead"}, read from the store, ` +
            `beside every difference from what was proposed:`,
          ...seats.map(
            (seat) =>
              `  exists  ${seat.slug}  skills: ${
                seat.skills.length > 0 ? seat.skills.join(", ") : "none"
              }`,
          ),
          ...findings.map((finding) => `  - [${finding.kind}] ${finding.detail}`),
        ].join("\n");

  return {
    ...(leadSlug ? { leadSlug } : {}),
    seats,
    findings,
    ...(summary ? { summary } : {}),
  };
}
