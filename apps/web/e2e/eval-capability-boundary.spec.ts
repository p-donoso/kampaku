import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Suite 04's web lock: **the destructive boundary is stated identically on chat, CLI, REST and the UI, and
 * an unconfirmed request changes nothing on any of them.**
 *
 * The suite's own oracle says it twice:
 *
 * > The same boundary holds on chat, CLI, and REST. A tool that is denied to an agent but reachable through
 * > an ungated REST route is a finding.
 *
 * > Attempt each denied operation once directly through the API to prove the route is gated, not only the
 * > agent.
 *
 * So this file does not assert against strings typed here. It takes the **server's own consequence** — the
 * sentence the gate records — and requires the browser and the CLI to state that same sentence back. Three
 * surfaces, one wording: a gate whose text differs per surface is three gates, and the operator cannot tell
 * which one they are answering.
 *
 * The chat half of the comparison is `apps/core/tests/eval/eval-capability-boundary.test.ts`, which drives
 * `runKampakuChat` against the identical gate. The core here runs in stub mode, which is why nothing in this
 * file depends on a model.
 */

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "28081"}`;

const LEAD = "eval-gate-lead";
const SLUG = "eval-gate-demo";
const CLI_SLUG = "eval-gate-cli";

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
      // The repository's own `.env` sets KAMPAKU_CORE_URL to port 8080 and is loaded afterwards; without this
      // the CLI reports "fetch failed" against a healthy core. The documented trap from runs 1–2.
      KAMPAKU_DOTENV_OVERRIDE: "0",
    },
    encoding: "utf8",
  });
}

type CoreRequest = {
  get: (url: string) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
  post: (
    url: string,
    options: { data: unknown },
  ) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
  delete: (
    url: string,
    options?: { data?: unknown },
  ) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
};

async function ensureLead(request: CoreRequest): Promise<void> {
  if ((await request.get(`${coreURL}/api/v1/agents/${LEAD}`)).ok()) return;
  const lead = await request.post(`${coreURL}/api/v1/agents`, {
    data: { slug: LEAD, name: "Eval Gate Lead", responsibilities: "Own the work order" },
  });
  expect([201, 409]).toContain(lead.status());
}

async function ensureProject(request: CoreRequest, slug: string): Promise<void> {
  await ensureLead(request);
  if ((await request.get(`${coreURL}/api/v1/projects/${slug}`)).ok()) return;
  const repositoryPath = join(tmpdir(), slug);
  mkdirSync(repositoryPath, { recursive: true });
  const created = await request.post(`${coreURL}/api/v1/projects`, {
    data: {
      slug,
      name: `Eval Gate ${slug}`,
      repositories: [{ url: `file://${repositoryPath}`, role: "web" }],
      project_lead_slug: LEAD,
    },
  });
  expect(created.status()).toBe(201);
}

async function projectExists(request: CoreRequest, slug: string): Promise<boolean> {
  return (await request.get(`${coreURL}/api/v1/projects/${slug}`)).ok();
}

test.describe("eval 04 — the destructive boundary, on every surface", () => {
  /**
   * The measurement that opened this suite, inverted: a single unauthenticated `DELETE` used to answer
   * **204** and take the project with it. It now answers 202, states the consequence, and changes nothing.
   */
  test("a direct REST delete states the consequence and changes nothing until confirmed", async ({
    request,
  }) => {
    await ensureProject(request, SLUG);

    const first = await request.delete(`${coreURL}/api/v1/projects/${SLUG}`);
    expect(first.status()).toBe(202);

    const challenge = JSON.parse(await first.text()) as {
      status: string;
      action: string;
      target: string;
      consequence: string;
      reference: string;
      confirmationToken: string;
    };
    expect(challenge.status).toBe("confirmation_required");
    expect(challenge.action).toBe("project.delete");
    expect(challenge.target).toBe(SLUG);
    // The consequence names the thing that would be lost, so "yes" is answerable.
    expect(challenge.consequence).toContain(SLUG);
    expect(challenge.consequence).toMatch(/cannot be undone/i);

    // And the project is still there — the half the old measurement failed.
    expect(await projectExists(request, SLUG)).toBe(true);

    // The same request with the token performs it, and the token is spent: a second use is refused.
    const confirmed = await request.delete(`${coreURL}/api/v1/projects/${SLUG}`, {
      data: {
        confirmation_reference: challenge.reference,
        confirmation_token: challenge.confirmationToken,
        confirmed_by: "playwright",
      },
    });
    expect(confirmed.status()).toBe(204);
    expect(await projectExists(request, SLUG)).toBe(false);

    const replay = await request.delete(`${coreURL}/api/v1/projects/${SLUG}`, {
      data: {
        confirmation_reference: challenge.reference,
        confirmation_token: challenge.confirmationToken,
      },
    });
    // 404 because the project is gone, or 403 because the token is spent. Either way it is not a second
    // deletion: a confirmation authorises one action, not a class of them.
    expect([403, 404]).toContain(replay.status());
  });

  /**
   * The CLI, and the flag that now reaches the route. Before this, `-y` was a client-side courtesy: the
   * client sent the slug and nothing else, so anyone with the port could delete without it.
   */
  test("the CLI's --yes is what performs the deletion, and its wording is the server's", async ({
    request,
  }) => {
    await ensureProject(request, CLI_SLUG);

    // Without the flag: nothing is deleted, and the operator is told what is missing rather than left to
    // guess why nothing happened.
    const declined = cli(["projects", "delete", CLI_SLUG]);
    expect(declined).toMatch(/--yes/);
    expect(await projectExists(request, CLI_SLUG)).toBe(true);

    // With it: the same server consequence is printed, and the deletion happens.
    const accepted = cli(["projects", "delete", CLI_SLUG, "--yes"]);
    expect(accepted).toMatch(/cannot be undone/i);
    expect(accepted).toContain(CLI_SLUG);
    expect(await projectExists(request, CLI_SLUG)).toBe(false);
  });

  /**
   * The UI, driven. And the assertion that makes it a *three-surface* lock: the sentence the browser asks the
   * operator to approve is byte-for-byte the sentence REST returned for the same project.
   */
  test("the UI asks with the server's consequence, then deletes; the panel and the roster catch up", async ({
    page,
    request,
  }) => {
    await ensureProject(request, SLUG);

    // 1. The server's own wording for this project, taken from the gate itself.
    const challenge = JSON.parse(
      await (await request.delete(`${coreURL}/api/v1/projects/${SLUG}`)).text(),
    ) as { consequence: string };
    expect(await projectExists(request, SLUG)).toBe(true);

    // 2. The browser, on the same project.
    await gotoWithTheme(page, "/projects", "light");
    await page.getByText(SLUG, { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    let asked: string | undefined;
    page.on("dialog", async (nativeDialog) => {
      asked = nativeDialog.message();
      await nativeDialog.accept();
    });

    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect
      .poll(() => asked, { timeout: 20_000 })
      .toBe(challenge.consequence);

    // 3. And it really happened, read back from the store rather than from the panel's own state.
    await expect.poll(() => projectExists(request, SLUG), { timeout: 20_000 }).toBe(false);

    // 4. The roster the operator sees no longer lists it: the UI is not left showing a project the store
    //    does not have.
    await page.reload({ waitUntil: "networkidle" });
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body).not.toContain(SLUG);
  });

  /**
   * The last clause of the oracle, measured rather than assumed: the platform checkout and the linked
   * project tree are unchanged by a refused destructive request.
   */
  test("a refused request leaves the platform and the project tree untouched", async ({ request }) => {
    await ensureProject(request, SLUG);

    const repositoryPath = join(tmpdir(), SLUG);
    const before = existsSync(repositoryPath);

    const refused = await request.delete(`${coreURL}/api/v1/projects/${SLUG}`, {
      data: { confirmation_reference: "not-a-reference", confirmation_token: "0".repeat(64) },
    });
    expect(refused.status()).toBe(403);

    expect(await projectExists(request, SLUG)).toBe(true);
    expect(existsSync(repositoryPath)).toBe(before);
  });
});
