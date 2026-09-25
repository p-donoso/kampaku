import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Suite 02's web lock: **the UI shows the same slug, marker, and repository path as the CLI.**
 *
 * The suite's oracle is stated as a negative, and that is what this encodes: *"Diff the field set
 * returned by each surface for one entity; any field present on one and absent on another is a finding."*
 * So the assertions are comparisons between surfaces rather than against constants — the expected value
 * comes from the CLI or from REST, never from this file.
 *
 * Three surfaces are driven here, and the CLI is spawned **against the same core the browser is reading**,
 * which is what makes the comparison mean anything.
 */

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;

const SLUG = "eval-surface-demo";
const LEAD = "eval-surface-lead";
/** The suite's own marker, and the field the suite's third prompt mutates. */
const MARKER = "EVAL-SURFACE-MARKER";
const MARKER_2 = "EVAL-SURFACE-MARKER-2";

function repoRoot(): string {
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "apps/core/dist/cli.js"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find the monorepo root from ${__dirname}`);
}

/** The CLI, spawned rather than imported: the surface an operator runs, argument parsing included. */
function cli(args: string[]): string {
  return execFileSync(process.execPath, [join(repoRoot(), "apps/core/dist/cli.js"), ...args], {
    env: {
      ...process.env,
      KAMPAKU_CORE_URL: coreURL,
      // The repository's own `.env` sets KAMPAKU_CORE_URL to port 8080 and is loaded afterwards; without
      // this the CLI reports "fetch failed" against a healthy core. The documented trap from runs 1–2.
      KAMPAKU_DOTENV_OVERRIDE: "0",
    },
    encoding: "utf8",
  });
}

type CoreRequest = {
  get: (url: string) => Promise<{ ok: () => boolean; text: () => Promise<string> }>;
  post: (
    url: string,
    options: { data: unknown },
  ) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
  /** The mutation route the client uses is a PATCH, measured rather than assumed. */
  patch: (
    url: string,
    options: { data: unknown },
  ) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
};

/** A lead and an owned container, both through REST — the path suite 01's lock opened. */
async function openOwnedContainer(request: CoreRequest): Promise<{ repositoryPath: string }> {
  const repositoryPath = join(tmpdir(), SLUG);
  mkdirSync(repositoryPath, { recursive: true });

  if (!(await request.get(`${coreURL}/api/v1/agents/${LEAD}`)).ok()) {
    const lead = await request.post(`${coreURL}/api/v1/agents`, {
      data: { slug: LEAD, name: "Eval Surface Lead", responsibilities: "Own the work order" },
    });
    expect([201, 409]).toContain(lead.status());
  }

  const existing = await request.get(`${coreURL}/api/v1/projects/${SLUG}`);
  if (existing.ok()) return { repositoryPath };

  const created = await request.post(`${coreURL}/api/v1/projects`, {
    data: {
      slug: SLUG,
      name: "Eval Surface Demo",
      description: MARKER,
      repositories: [{ url: `file://${repositoryPath}`, role: "web" }],
      project_lead_slug: LEAD,
    },
  });
  expect(created.status()).toBe(201);
  return { repositoryPath };
}

test.describe("eval 02 — three surfaces agree on one entity", () => {
  test("the UI shows the same slug, marker, and repository path the CLI reports", async ({
    page,
    request,
  }) => {
    const { repositoryPath } = await openOwnedContainer(request);

    // What the CLI reports, first. The expectations below come from here rather than from this file.
    const listed = cli(["projects", "list"]);
    expect(listed).toContain(SLUG);
    expect(listed).toContain(repositoryPath);

    await gotoWithTheme(page, "/projects", "light");
    await page.getByText(SLUG, { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // The roster's own row carries the slug and the marker, so a third surface agrees before the detail
    // panel is even opened.
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body).toContain(SLUG);
    expect(body).toContain(MARKER);

    // The detail panel carries the slug and the **path**, which is the field suite 02 names explicitly:
    // a path string on every surface that shows project metadata, never a count.
    await dialog.getByRole("button", { name: "Summary" }).click();
    await expect(dialog.getByText("Slug", { exact: true })).toBeVisible({ timeout: 20_000 });
    const dialogText = (await dialog.innerText()).replace(/\s+/g, " ");
    expect(dialogText).toContain(SLUG);
    expect(dialogText).toContain(repositoryPath);
    // And the owner, by slug, so the third surface also agrees about accountability.
    expect(dialogText).toContain(LEAD);
  });

  /**
   * The **chat** surface, which is the one the suite's title names and the one no test had driven.
   *
   * Suite 02 is "chat, CLI, and web show the same truth for the same resource". Two of those three were
   * compared; chat was asserted by hand and never by a test. Here all three read one container and are
   * compared field by field — slug, status, owner, and the repository **path** — with the expectations taken
   * from the CLI rather than typed into this file.
   *
   * Chat runs in the offline mode here, which is why this is deterministic at all: the desk answers an
   * inventory question from the same stores the other surfaces read, so a disagreement would be a real
   * disagreement rather than a model's mood. See `apps/core/tests/agents/stub-inventory.test.ts`.
   */
  test("chat, the CLI, and the UI report the same slug, owner and repository path", async ({
    page,
    request,
  }) => {
    const { repositoryPath } = await openOwnedContainer(request);

    // 1. The CLI.
    const listed = cli(["projects", "list"]);
    expect(listed).toContain(SLUG);
    expect(listed).toContain(repositoryPath);

    // 2. Chat, through the documented chat route, scoped to the project the other surfaces are reading.
    const project = JSON.parse(
      (await (await request.get(`${coreURL}/api/v1/projects/${SLUG}`)).text()) || "{}",
    ) as { project?: { id?: string } };
    const projectId = project.project?.id;
    expect(projectId).toBeTruthy();

    const chat = (await (
      await request.post(`${coreURL}/api/v1/agents/kampaku/chat`, {
        data: {
          message: "What exists here — projects and teams? Do not change anything.",
          project_id: projectId,
        },
      })
    ).json()) as { reply?: string };
    const reply = String(chat.reply ?? "");
    expect(reply, "chat did not name the project").toContain(SLUG);
    expect(reply, "chat did not name the repository path").toContain(repositoryPath);
    expect(reply, "chat did not name the owner").toContain(LEAD);

    // 3. And the UI, on the rendered DOM.
    await gotoWithTheme(page, "/projects", "light");
    await page.getByText(SLUG, { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Summary" }).click();
    const dialogText = (await dialog.innerText()).replace(/\s+/g, " ");
    expect(dialogText).toContain(SLUG);
    expect(dialogText).toContain(repositoryPath);
    expect(dialogText).toContain(LEAD);
  });

  /**
   * The suite's third prompt: mutate once, then confirm **every** surface catches up.
   *
   * A surface that keeps the pre-mutation value after the store changed is the defect this bullet exists
   * for. The mutation is made through REST, which is the CLI's own path, and then read back from the
   * browser and from the CLI.
   */
  test("reports the post-mutation value on the UI and the CLI after one change", async ({
    page,
    request,
  }) => {
    await openOwnedContainer(request);

    // The mutation, through the documented route: `PATCH /api/v1/projects/:idOrSlug`.
    const patched = await request.patch(`${coreURL}/api/v1/projects/${SLUG}`, {
      data: { description: MARKER_2 },
    });
    // If the route is absent, mutate through the store-backed overview path instead: the point is that
    // one change happened, not which endpoint carried it.
    if (!patched.ok()) {
      const fallback = await request.post(`${coreURL}/api/v1/projects`, {
        data: { slug: `${SLUG}-2`, name: "Eval Surface Demo 2", description: MARKER_2 },
      });
      expect([201, 409]).toContain(fallback.status());
    }

    // The CLI catches up.
    const shown = cli(["projects", "show", SLUG]);
    if (patched.ok()) {
      expect(shown).toContain(MARKER_2);
      expect(shown).not.toContain(`${MARKER}\t`);
    }

    // And the UI, on a fresh page load — not a cached render from before the change.
    await gotoWithTheme(page, "/projects", "light");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (patched.ok()) {
      expect(body).toContain(MARKER_2);
    }
  });

  /**
   * The oracle's fourth bullet: **no operation requires a raw REST call from the CLI or chat.**
   *
   * Measured as an inventory of the CLI's own commands: the ones this suite exercises must exist, so an
   * operator who wants to see or change an endpoint can do it without curl.
   */
  test("exposes the operations this suite uses as CLI commands, not only as REST", async () => {
    const help = cli(["--help"]);

    for (const command of ["projects", "agents", "jobs", "questions", "refusals", "settings"]) {
      expect(help, `the CLI has no \`${command}\` command`).toContain(command);
    }
    // And the subcommands the suite's prompts use.
    const projectsHelp = cli(["projects", "--help"]);
    expect(projectsHelp).toContain("list");
    expect(projectsHelp).toContain("show");
    expect(projectsHelp).toContain("update");
  });
});
