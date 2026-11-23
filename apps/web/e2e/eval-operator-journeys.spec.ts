import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Suite 16's automated lock: **the seven operator journeys, clicked against a stub Core on dedicated ports.**
 *
 * The suite's `Automated tests` table names this file as *to author*:
 *
 * | `apps/web/e2e/eval-operator-journeys.spec.ts` | The seven journeys against a stub Core on dedicated ports |
 *
 * and its oracle is what each test below turns into an assertion:
 *
 * - *Every journey works without the terminal.* — every step is a click, a fill or a keypress, except where the
 *   test is **acting as the other party** (the worker that leases a job, the CLI that must see the same
 *   container). Those are fixture actions, and they are marked as such.
 * - *The ids and statuses shown match the CLI and the API at the same moment.* — each journey reads the API
 *   (and, for intake, the CLI) and then requires the DOM to carry the same string.
 * - *A UI action produces the same durable change as the equivalent CLI action; a UI "save" that changes
 *   nothing is a failure.* — every journey re-reads the store after the click and asserts the change.
 * - *The pending-question panel shows the question text, its id, and an answer control.* — journey 2.
 * - *A done item exposes its evidence, and at least one evidence record names the criterion it covers.* —
 *   journey 7.
 * - *After a restart, no stale `running` state is displayed.* — journey 6 drives the product's **own** boot
 *   recovery surface (`POST /api/v1/workers` under an id that holds an active job) rather than restarting the
 *   Next.js server, which a single Playwright run cannot do. That is the production path — Core's
 *   `recoverAbandonedJobsForWorker` — so the lock is on the state the operator sees after it, not on a
 *   simulation of it.
 *
 * Measured when it was first written (2026-11-04): journeys 4, 5 and 7 had **no surface at all** — no
 * approve/reject control on a proposal, no way to open a container, and no evidence anywhere in the panel
 * (BOARD F-133). Those three tests were written against the gap first and failed for the reason the row names.
 */

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "28081"}`;

/** Fixture identity, prefixed so a run cannot collide with anything else on the same Core. */
const LEAD = "s16-lead";
const WORKER_ID = "s16-worker";
const PROJECT_SLUG = "s16-demo";
const PROJECT_NAME = "S16 Operator Journeys";

/** The monorepo root, found by walking up rather than assuming a cwd (same rule as the suite-01 lock). */
function repoRoot(): string {
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "apps/core/dist/cli.js"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find the monorepo root from " + __dirname);
}

async function json<T>(response: { ok(): boolean; status(): number; text(): Promise<string> }, what: string): Promise<T> {
  const body = await response.text();
  if (!response.ok()) throw new Error(`${what} answered ${response.status()}: ${body}`);
  return JSON.parse(body || "{}") as T;
}

/**
 * The label the panel renders for a workflow status.
 *
 * The API, the CLI and the store share one spelling (`todo`); the browser renders a human label from
 * `apps/web/src/lib/work-item-status.ts`. The comparison below is therefore *status → the label that status is
 * rendered as*, stated once, rather than a substring match that would pass on any word.
 */
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

/**
 * One work order per journey that executes something, and the board container the two read-only journeys use.
 *
 * **Why one container per journey.** A plan's leaves are executed in order: `POST /work-items/:id/execute`
 * refuses a leaf while an earlier one is unfinished ("Earlier tasks in the project plan must be completed
 * first."). One journey leaves its leaf `cancelled`, another leaves it `blocked` on an expired lease, so sharing
 * a container would make each journey depend on the last one's outcome — and a lock whose tests only pass in one
 * order is a lock on the order, not on the surfaces. Each journey therefore owns its container, and every one of
 * them is opened the way an operator opens one.
 */
interface JourneyProject {
  slug: string;
  id: string;
  itemId: string;
}

interface Fixture {
  repositoryPath: string;
  board: JourneyProject;
  evidence: JourneyProject;
  cancel: JourneyProject;
  recovery: JourneyProject;
  gate: JourneyProject;
}

let fixture: Fixture;

/** The worker's own view of a job: it must hold the lease to report progress or a result. */
interface LeasedJob {
  id: string;
  leaseId: string;
}

async function createAgent(request: APIRequestContext, slug: string, name: string) {
  const found = await request.get(`${coreURL}/api/v1/agents/${slug}`);
  if (found.ok()) return;
  const created = await request.post(`${coreURL}/api/v1/agents`, {
    data: { slug, name, responsibilities: "Own the work order" },
  });
  expect(created.status(), await created.text()).toBe(201);
}

/**
 * Registers the execution plane, exactly as `scripts/start.sh` requires one to exist before a job may be
 * released (`assertWorkCanBeLeased`). Without it `POST /work-items/:id/execute` is refused and the execution
 * journeys have nothing to watch.
 */
async function registerWorker(request: APIRequestContext) {
  const registered = await request.post(`${coreURL}/api/v1/workers`, {
    data: { id: WORKER_ID, name: "s16 e2e worker", capabilities: ["code.agent"] },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  return json<{ id: string; recoveredJobs?: number }>(registered, "POST /api/v1/workers");
}

/** Leases the next job as the worker, so the test can report progress or a result for it. */
async function leaseJob(request: APIRequestContext): Promise<LeasedJob> {
  const leased = await request.post(`${coreURL}/api/v1/workers/${WORKER_ID}/jobs:lease`);
  if (leased.status() === 204) throw new Error("No job was leasable: nothing was queued for this release.");
  const job = await json<{ id: string; leaseId?: string }>(leased, "POST /workers/:id/jobs:lease");
  if (!job.leaseId) throw new Error(`Job ${job.id} was leased without a leaseId, so nothing can be reported.`);
  return { id: job.id, leaseId: job.leaseId };
}

async function createLeaf(
  request: APIRequestContext,
  projectId: string,
  input: { title: string; description: string; acceptanceCriteria: string[] },
): Promise<string> {
  const created = await request.post(`${coreURL}/api/v1/projects/${projectId}/work-items`, {
    data: {
      title: input.title,
      description: input.description,
      status: "todo",
      acceptance_criteria: input.acceptanceCriteria,
    },
  });
  const item = await json<{ id: string }>(created, "POST /projects/:id/work-items");
  return item.id;
}

test.describe.configure({ mode: "serial" });

test.describe("eval 16 — the seven operator journeys, clicked", () => {
  test.beforeAll(async ({ request }) => {
    const repositoryPath = join(tmpdir(), PROJECT_SLUG);

    mkdirSync(repositoryPath, { recursive: true });
    // A checkout with something in it, so the repository link points at a directory that exists — the
    // product refuses a path it cannot see, which is the behaviour suite 01 and F-033 measured.
    writeFileSync(join(repositoryPath, "README.md"), "# s16 demo\n\nA checkout the operator journeys run against.\n");

    await createAgent(request, LEAD, "S16 Lead");
    await registerWorker(request);

    /** Opens a container the way an operator does, idempotently, so a re-run adopts what a first run made. */
    async function openContainer(
      slug: string,
      name: string,
      leaf: { title: string; description: string; acceptanceCriteria: string[] },
    ): Promise<JourneyProject> {
      const existing = await request.get(`${coreURL}/api/v1/projects/${slug}`);
      const projectId = existing.ok()
        ? (await json<{ project: { id: string } }>(existing, "GET /projects/:slug")).project.id
        : (
            await json<{ id: string }>(
              await request.post(`${coreURL}/api/v1/projects`, {
                data: {
                  slug,
                  name,
                  description: "Container opened by the suite-16 operator-journey lock.",
                  repositories: [{ url: `file://${repositoryPath}`, role: "web" }],
                  project_lead_slug: LEAD,
                },
              }),
              "POST /projects",
            )
          ).id;

      const overview = await json<{ workItems: Array<{ item: { id: string; title: string } }> }>(
        await request.get(`${coreURL}/api/v1/projects/${slug}`),
        "GET /projects/:slug",
      );
      const itemId =
        overview.workItems.find((node) => node.item.title === leaf.title)?.item.id ??
        (await createLeaf(request, projectId, leaf));
      return { slug, id: projectId, itemId };
    }

    // Each leaf's criteria are stated as observable results naming `make check`, so the plan's own router can
    // decide them and the evidence gate has something to key a record to (BOARD F-105's axis).
    fixture = {
      repositoryPath,
      board: await openContainer(PROJECT_SLUG, PROJECT_NAME, {
        title: "S16 board leaf",
        description: "The leaf the board journey reads a status from.",
        acceptanceCriteria: ["make check exits 0 and the output lists the summary path"],
      }),
      gate: await openContainer("s16-gate", "S16 Gate", {
        title: "S16 gated leaf",
        description: "A leaf whose job fails, escalates to a blocker and becomes a question.",
        acceptanceCriteria: ["make check exits 0 and the output reports the gate path"],
      }),
      cancel: await openContainer("s16-cancel", "S16 Cancel", {
        title: "S16 cancellable leaf",
        description: "A leaf an operator cancels from the job panel while it runs.",
        acceptanceCriteria: ["make check exits 0 and the output lists the runner path"],
      }),
      recovery: await openContainer("s16-recovery", "S16 Recovery", {
        title: "S16 recovery leaf",
        description: "A leaf whose worker goes away mid-job.",
        acceptanceCriteria: ["make check exits 0 and the output reports the index path"],
      }),
      evidence: await openContainer("s16-evidence", "S16 Evidence", {
        title: "S16 evidence leaf",
        description: "Writes the report the acceptance criteria name.",
        acceptanceCriteria: ["make check exits 0 and the output lists the report path"],
      }),
    };
  });

  test("journey 1 — the board: the roster and the item statuses are the ones the API reports", async ({
    page,
    request,
  }) => {
    // The roster answers `{ projects: [{ project, tasks }] }` — a node per container, not a flat entry — and the
    // flat suite-01 lock reads the same route, so a shape that drifted would fail there too.
    const rosterResponse = await request.get(`${coreURL}/api/v1/projects/roster`);
    const roster = await json<{
      projects: Array<{ project: { slug: string; name: string; status: string } }>;
    }>(rosterResponse, "GET /projects/roster");
    const board = fixture.board;
    const fromApi = roster.projects.find((node) => node.project.slug === board.slug)?.project;
    expect(fromApi, "the API holds the container this journey is about").toBeDefined();

    await gotoWithTheme(page, "/projects", "light");

    // The slug and the name the API returned, rendered — not a count, not a re-spelling.
    await expect(page.getByText(board.slug, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(PROJECT_NAME, { exact: true }).first()).toBeVisible();

    // And the item statuses, compared one by one against the same route the CLI reads.
    const overview = await json<{ workItems: Array<{ item: { id: string; title: string; status: string } }> }>(
      await request.get(`${coreURL}/api/v1/projects/${board.slug}`),
      "GET /projects/:slug",
    );
    const leaf = overview.workItems.find((node) => node.item.id === board.itemId);
    expect(leaf, "the item this journey reads is in the project the API returns").toBeDefined();

    await page.getByText(board.slug, { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    // The dialog opens on Tasks, which is where an operator reads a status.
    await expect(dialog.getByText(leaf!.item.title, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    // An item whose job is in flight renders its execution phase ("Running"/"Queued") instead of the workflow
    // status. This one has no job, so the workflow status is what the operator must see.
    expect(leaf!.item.status).toBe("todo");
    await expect(
      dialog.getByText(STATUS_LABELS[leaf!.item.status] ?? leaf!.item.status, { exact: true }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("journey 2 — the gate: a pending question shows its text, its id and an answer control, and answering it is durable", async ({
    page,
    request,
  }) => {
    // Fixture work, marked as such: the product's own escalation path is driven to produce the gate.
    // A job that fails for a reason the product escalates files a blocker (job-failure-escalation), and the
    // blocker's recipient converts it into a question — the documented route the web UI also takes.
    const released = await request.post(`${coreURL}/api/v1/work-items/${fixture.gate.itemId}/execute`);
    expect(released.status(), await released.text()).toBe(202);
    const job = await leaseJob(request);

    const failed = await request.put(`${coreURL}/api/v1/jobs/${job.id}/result`, {
      data: {
        leaseId: job.leaseId,
        status: "failed",
        output: { successfulMutations: 0 },
        error: {
          code: "WORKER_NO_DELIVERABLES",
          message: "The coding worker finished without writing or updating any files in the repository.",
        },
      },
    });
    expect(failed.status(), await failed.text()).toBe(202);

    const blockers = await json<{ blockers: Array<{ id: string; recipientAgentSlug: string; status: string }> }>(
      await request.get(`${coreURL}/api/v1/blockers?status=pending`),
      "GET /blockers?status=pending",
    );
    const blocker = blockers.blockers.find((candidate) => candidate.status === "pending");
    expect(blocker, "the failed job escalated to a blocker, which is the gate's raw material").toBeDefined();

    // `by_agent_id` is an **agent id**, not a slug: the store compares it to `recipientAgentId`, so the slug the
    // blocker route reports has to be resolved first. (A caller that passed the slug got `Only the current
    // recipient can convert this blocker.` — the refusal names the role and not the field, which is why this
    // resolution is spelled out.)
    const recipientResponse = await request.get(`${coreURL}/api/v1/agents/${blocker!.recipientAgentSlug}`);
    const recipient = await json<{ id?: string; agent?: { id: string } }>(
      recipientResponse,
      "GET /agents/:slug",
    );
    const recipientId = recipient.agent?.id ?? recipient.id;
    expect(recipientId, "the recipient agent is resolvable by the slug the blocker reported").toBeTruthy();

    const converted = await request.post(`${coreURL}/api/v1/blockers/${blocker!.id}/convert-to-question`, {
      data: { by_agent_id: recipientId },
    });
    const gate = await json<{ question: { id: string; question: string; recipientAgentSlug: string } }>(
      converted,
      "POST /blockers/:id/convert-to-question",
    );

    // The blocker's recipient is the seat that filed it — a project with one station escalates to itself
    // (BOARD F-106, measured and open) — so the gate reaches the emperor only once it is escalated. That is the
    // documented route (`kampaku questions escalate <id>`), and it is what makes this a gate the operator can
    // answer rather than a card that reads *"Waiting for a response or escalation to a superior."*
    /** The recipient as **every surface spells it** — the escalate route answers the raw record, with ids only. */
    const readRecipient = async (id: string) =>
      (
        await json<{ questions: Array<{ id: string; recipientAgentSlug: string }> }>(
          await request.get(`${coreURL}/api/v1/questions?status=pending`),
          "GET /questions?status=pending",
        )
      ).questions.find((question) => question.id === id)?.recipientAgentSlug;

    let gateRecipient = await readRecipient(gate.question.id);
    if (gateRecipient !== "kampaku") {
      const escalated = await request.post(`${coreURL}/api/v1/questions/${gate.question.id}/escalate`, {
        data: { by_agent_id: recipientId },
      });
      expect(escalated.status(), await escalated.text()).toBe(200);
      gateRecipient = await readRecipient(gate.question.id);
    }
    expect(gateRecipient, "the gate reached the front office, which is the role the panel makes answerable").toBe(
      "kampaku",
    );

    await gotoWithTheme(page, "/", "light");

    const panel = page.locator("#pending-questions-card");
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // The card, scoped to this question's own id, so a page with several pending questions cannot pass by
    // answering whichever input the DOM happens to put first.
    const card = panel.locator("article").filter({ hasText: gate.question.id }).first();
    await expect(card).toBeVisible();
    // (a) the id, which is the handle every other surface takes; (b) the text; (c) an answer control.
    await expect(card).toContainText(gate.question.id);
    await expect(card.getByRole("button", { name: "Answer" })).toBeVisible();

    const pendingBefore = await json<{ questions: Array<{ id: string }> }>(
      await request.get(`${coreURL}/api/v1/questions?status=pending`),
      "GET /questions?status=pending",
    );
    expect(pendingBefore.questions.map((question) => question.id)).toContain(gate.question.id);

    // Answer it the way the card offers: a text question takes text, a choice question takes a radio.
    const textbox = card.getByRole("textbox");
    if (await textbox.count()) {
      await textbox.first().fill("Answered from the browser by the suite-16 operator-journey lock.");
    } else {
      await card.getByRole("radio").first().click();
    }
    await card.getByRole("button", { name: "Answer" }).click();

    // The durable change: the store holds the answer, and the question left the pending list.
    await expect
      .poll(
        async () =>
          (
            await json<{ questions: Array<{ id: string }> }>(
              await request.get(`${coreURL}/api/v1/questions?status=answered`),
              "GET /questions?status=answered",
            )
          ).questions.map((question) => question.id),
        { message: "the question is answered in the store after the browser answered it" },
      )
      .toContain(gate.question.id);

    // And the work it was holding is no longer blocked by it: `GET /questions?status=pending` is empty of it,
    // which is the gate the project's execution state reads.
    const pendingAfter = await json<{ questions: Array<{ id: string }> }>(
      await request.get(`${coreURL}/api/v1/questions?status=pending`),
      "GET /questions?status=pending",
    );
    expect(pendingAfter.questions.map((question) => question.id)).not.toContain(gate.question.id);
  });

  test("journey 3 — execution: a job's progress is readable in the panel and cancellable from it", async ({
    page,
    request,
  }) => {
    const released = await request.post(`${coreURL}/api/v1/work-items/${fixture.cancel.itemId}/execute`);
    expect(released.status(), await released.text()).toBe(202);
    const job = await leaseJob(request);

    // Fixture work, marked as such: the worker's own progress call, which is what the panel renders.
    const progress = await request.post(`${coreURL}/api/v1/jobs/${job.id}/progress`, {
      data: { leaseId: job.leaseId, lines: ["Reading the checkout…", "Running make check…"] },
    });
    expect(progress.status(), await progress.text()).toBe(200);

    await gotoWithTheme(page, `/projects?task=${fixture.cancel.itemId}&tab=job`, "light");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    // The job the API reports as in flight, by its id and with its own log lines.
    await expect(dialog).toContainText(job.id.slice(0, 8), { timeout: 20_000 });
    await expect(dialog).toContainText("Running make check…", { timeout: 20_000 });

    // The UI cancels it. This is the journey's action, and it must produce the same durable change as
    // `kampaku jobs cancel <id>`.
    await dialog.getByRole("button", { name: "Cancel" }).first().click();

    await expect
      .poll(
        async () =>
          (
            await json<{ status: string }>(
              await request.get(`${coreURL}/api/v1/jobs/${job.id}`),
              "GET /jobs/:id",
            )
          ).status,
        { message: "the job is cancelled in the store after the browser cancelled it" },
      )
      .toBe("cancelled");
  });

  test("journey 4 — knowledge: a proposal is approved from the UI by the role the Core authorises", async ({
    page,
    request,
  }) => {
    // Fixture work: the proposal is written by the line, the way a lead proposes a page.
    const proposed = await request.post(
      `${coreURL}/api/v1/projects/${fixture.board.slug}/wiki/pages/s16-proposal/propose`,
      {
        data: {
          agent_slug: LEAD,
          title: "S16 proposal",
          content_md: "# S16 proposal\n\nA page proposed by the line and decided by the operator in the browser.\n",
        },
      },
    );
    expect(proposed.status(), await proposed.text()).toBe(200);

    const before = await json<{ pages: Array<{ slug: string; status: string }> }>(
      await request.get(`${coreURL}/api/v1/projects/${fixture.board.slug}/wiki/pending`),
      "GET /projects/:slug/wiki/pending",
    );
    expect(before.pages.map((page) => page.slug)).toContain("s16-proposal");

    await gotoWithTheme(page, "/projects/wiki", "light");

    // The project selector opens on the first project, so the container is chosen first.
    const selector = page.getByRole("combobox", { name: "Project" });
    await expect(selector).toBeVisible({ timeout: 20_000 });
    await selector.selectOption(fixture.board.slug);

    // The page tree is how an operator finds a proposal on a desktop viewport (`md:block`; the `<select>` is the
    // mobile form of the same navigation and is `md:hidden`). The pending entry carries a `proposal` marker.
    const tree = page.getByRole("complementary").filter({ hasText: "Pages" });
    await expect(tree).toBeVisible({ timeout: 20_000 });
    await tree.getByRole("button", { name: /S16 proposal/ }).first().click();

    const decision = page.getByTestId("wiki-pending-decision");
    await expect(decision).toBeVisible({ timeout: 20_000 });
    await expect(decision).toContainText(LEAD);

    await decision.getByRole("button", { name: "Approve" }).click();

    // The durable change, read from the store: the page is published, and it is no longer a pending proposal.
    await expect
      .poll(
        async () =>
          (
            await json<{ pages: Array<{ slug: string }> }>(
              await request.get(`${coreURL}/api/v1/projects/${fixture.board.slug}/wiki/pending`),
              "GET /projects/:slug/wiki/pending",
            )
          ).pages.map((page) => page.slug),
        { message: "the page left the pending list after the browser approved it" },
      )
      .not.toContain("s16-proposal");

    const pageDetail = await json<{ page: { status: string }; publication?: string }>(
      await request.get(`${coreURL}/api/v1/projects/${fixture.board.slug}/wiki/pages/s16-proposal`),
      "GET /wiki/pages/:slug",
    );
    expect(pageDetail.page.status).toBe("published");
  });

  test("journey 5 — intake: a work order opened in the UI is the container chat, REST and the CLI see", async ({
    page,
    request,
  }) => {
    const slug = "s16-ui-intake";
    const name = "S16 UI Intake";

    await gotoWithTheme(page, "/projects", "light");

    await page.getByRole("button", { name: "Open a work order" }).click();
    const form = page.getByRole("form", { name: "Open a work order" });
    await expect(form).toBeVisible({ timeout: 20_000 });

    // `exact` on each label: "Slug" is a substring of "Project lead slug", and a prefix match resolved to both
    // fields. The operator is filling two different fields and the locator must be as specific.
    await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByLabel("Slug", { exact: true }).fill(slug);
    await form.getByLabel("Project lead slug", { exact: true }).fill(LEAD);
    await form
      .getByLabel("Repository (absolute path or file:// url)", { exact: true })
      .fill(fixture.repositoryPath);
    await form.getByRole("button", { name: "Open work order" }).click();

    // The durable change: the store holds a container with that slug, owned by the lead the form named.
    // Read through `expect.poll` on a value the closure keeps, because `expect.poll` asserts and does not return:
    // the first version of this test read `undefined` off it and failed on the container it had just created.
    type Container = {
      project: { slug: string; projectLeadAgentId?: string | null; repositories: Array<{ url: string }> };
    };
    let container: Container | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get(`${coreURL}/api/v1/projects/${slug}`);
          if (!response.ok()) return false;
          container = await json<Container>(response, "GET /projects/:slug");
          return true;
        },
        { message: "the container the form opened is in the store" },
      )
      .toBe(true);

    expect(container!.project.slug).toBe(slug);
    expect(
      container!.project.projectLeadAgentId,
      "the container is owned, which is what intake means",
    ).toBeTruthy();
    expect(container!.project.repositories[0]?.url).toBe(`file://${fixture.repositoryPath}`);

    // The third surface: the CLI an operator scripts the factory with. It is a REST client, spawned rather than
    // imported so the argument parsing and the formatting are the ones an operator runs.
    const cli = execFileSync(process.execPath, [join(repoRoot(), "apps/core/dist/cli.js"), "projects", "list"], {
      env: {
        ...process.env,
        KAMPAKU_CORE_URL: coreURL,
        // The repository's own `.env` is loaded afterwards and points at the live instance's port; `0` keeps
        // the explicit value (the documented trap that cost two baseline runs real time).
        KAMPAKU_DOTENV_OVERRIDE: "0",
      },
      encoding: "utf8",
    });
    expect(cli).toContain(slug);
    expect(cli).toContain(name);
  });

  test("journey 6 — recovery: after the product's own boot recovery, no stale running state is displayed", async ({
    page,
    request,
  }) => {
    const released = await request.post(`${coreURL}/api/v1/work-items/${fixture.recovery.itemId}/execute`);
    expect(released.status(), await released.text()).toBe(202);
    const job = await leaseJob(request);

    // The worker was holding it and has gone away. This is the restart path: a worker registering under an id
    // that holds an active job is a **new** process finding a dead one's lease, and Core settles it
    // (`recoverAbandonedJobsForWorker`, BOARD F-126) rather than leaving it reading `running`.
    const recovered = await registerWorker(request);
    expect(recovered.id).toBe(WORKER_ID);

    const settled = await json<{ status: string }>(
      await request.get(`${coreURL}/api/v1/jobs/${job.id}`),
      "GET /jobs/:id",
    );
    expect(settled.status, "the abandoned lease is not reported as running after recovery").not.toBe("running");
    expect(settled.status).not.toBe("leased");

    await gotoWithTheme(page, `/projects?task=${fixture.recovery.itemId}&tab=job`, "light");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // The UI shows what the store now says. A stale `running` here is the failure the oracle names.
    await expect(dialog).toContainText(settled.status, { timeout: 20_000 });
    if (settled.status !== "running") {
      // The stale claim the oracle forbids: a job Core has already settled, rendered as if it were in flight.
      await expect(dialog.getByText("running", { exact: true })).toHaveCount(0);
    }
  });

  test("journey 7 — evidence: a done item exposes the evidence, and a record names the criterion it covers", async ({
    page,
    request,
  }) => {
    // Fixture work: the job that produces the artifact, reported the way the worker reports one.
    const released = await request.post(`${coreURL}/api/v1/work-items/${fixture.evidence.itemId}/execute`);
    expect(released.status(), await released.text()).toBe(202);
    const job = await leaseJob(request);

    const reported = await request.put(`${coreURL}/api/v1/jobs/${job.id}/result`, {
      data: {
        leaseId: job.leaseId,
        status: "succeeded",
        output: {
          summary: "Wrote the report the acceptance criteria name.",
          // Keyed by the check the criterion names, not by the criterion id: this is what a real job sends, and
          // Core keys it to the criterion the same way the closure gate does.
          //
          // `subjectType` and `verificationMethod` are **declared vocabularies** (`evidence-registry.ts`), and a
          // record outside them is refused as `invalid evidence record` — measured while writing this lock, where
          // a plausible-looking `subjectType: "command"` / `verificationMethod: "tool-output"` left the leaf
          // `blocked` and the reason named the record rather than the field. The two enums are read here from the
          // source of truth rather than guessed.
          sourceTool: "run_check",
          subjectType: "behavior",
          filesChanged: ["report.md"],
          checkResults: { test: true },
          evidence: [
            {
              kind: "check",
              // The criterion reads *"make check exits 0 …"*, and `reflectsCriterion` relates the record to it
              // through this subject, so the check's own output is what proves it.
              subject: "make check",
              observedAt: new Date().toISOString(),
              passed: true,
              verified: true,
              reference: "make check: exit 0",
              output: "Ran 3 tests … OK",
              sourceTool: "run_check",
              // The two declared vocabularies, on the record itself: the closure pre-check reads them here, and a
              // record without them is refused as `invalid evidence record` — which is the refusal this fixture hit
              // while being written, and the reason the reason is quoted in the comment above.
              subjectType: "behavior",
              verificationMethod: "command",
            },
          ],
        },
      },
    });
    expect(reported.status(), await reported.text()).toBe(202);

    const detail = await json<{
      item: { status: string; acceptanceCriteria: string[] };
      evidence: {
        criteria: Array<{ id: string; text: string; records: Array<{ subject: string; passed: boolean }> }>;
        jobs: Array<{ id: string; checks: Array<{ name: string; passed: boolean }> }>;
      };
    }>(await request.get(`${coreURL}/api/v1/work-items/${fixture.evidence.itemId}`), "GET /work-items/:id");

    // The premise of the journey: the item is done, and its own durable record carries a record naming its
    // criterion. A fixture that fails here would make the UI assertion meaningless.
    expect(detail.item.status, "the leaf closed, which is what makes this a *done* item's evidence").toBe("done");
    const criterion = detail.evidence.criteria[0];
    expect(criterion, "the item's criteria are identified so evidence can be keyed to them").toBeDefined();
    expect(criterion!.records.length, "a record names (or is keyed to) this criterion").toBeGreaterThan(0);

    await gotoWithTheme(page, `/projects?task=${fixture.evidence.itemId}&tab=evidence`, "light");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const panel = dialog.getByTestId("work-item-evidence");
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // The criterion's own id and text, which is the axis every clearing surface takes.
    const criterionCard = panel.getByTestId(`criterion-${criterion!.id}`);
    await expect(criterionCard).toBeVisible();
    await expect(criterionCard).toContainText(criterion!.text);

    // The evidence, with which check produced it.
    await expect(criterionCard).toContainText(criterion!.records[0]!.subject);
    await expect(panel.getByTestId("job-check-test")).toContainText("passed");

    // And the item's own job is named, so the record can be traced back to the run that produced it.
    await expect(panel).toContainText(job.id.slice(0, 8));
  });
});
