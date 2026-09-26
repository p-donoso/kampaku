# Local ports

**Declared once.** The block lives in [`scripts/ports.env`](../../scripts/ports.env), is read by
`scripts/_common.sh` so the stack's defaults come from it, and is cross-checked by
`apps/core/tests/eval/eval-local-ports.test.ts`. Change a number there, not here; the test fails if this
page and that file disagree.

## Why this page exists

An agent that needs a port reaches for 3000, 3001, or 8080 — the defaults every dev server, proxy, and
framework tutorial uses. On a machine that runs more than one thing, those are already taken, so the
agent spends a turn finding a listener it did not start, or worse, adopts one. It is a cost paid per
agent and per run, and it buys nothing.

Measured on the operator's machine, 2026-09-26, before the block existed: `ss -ltn` showed **3000, 3001,
3002, 8080, 8090, 8880, 8931, 11434, and 18080 all in use** by other local services, while
**28000–28099 was empty**. The same class of collision is already on the record inside this repository:
`scripts/stop.sh` carries a note about a stale Next.js server that owned port 3002 while `start.sh`
reported the Web UI as running.

The list above is a measurement from one machine on one day. Re-measure it; do not quote it.

## The block

| Variable | Port | Service |
|----------|------|---------|
| `KAMPAKU_CORE_PORT` | `28080` | Core HTTP API |
| `KAMPAKU_WEB_PORT` | `28002` | Operator UI (`apps/web`) |
| `KAMPAKU_MODEL_ENDPOINT_PORT` | `28001` | A model endpoint started for one run, when it cannot share the operator's |
| `PLAYWRIGHT_CORE_PORT` | `28081` | Core fixture started by `apps/web` Playwright |
| `PLAYWRIGHT_WEB_PORT` | `28003` | Web fixture started by `apps/web` Playwright |

The whole range **28000–28099** is reserved for this repository. Taking the next one is a command, not a
memory test.

## Using it

```bash
./scripts/ports.sh list         # the block, and which entries are free right now
./scripts/ports.sh check        # are this stack's ports free? exit 1 if not
./scripts/ports.sh free 1       # one free port from inside the block
```

`check` reports the pid holding a port. A busy port is not automatically a failure: it may be this
stack, already running. The rule is that a process you did not start is not yours to kill — choose
another port from the block instead.

## Rules

1. **Take a port from the block.** Never 3000, 3001, 3002, 5000, 8000, or 8080: they are the defaults of
   common tooling and collide by construction.
2. **Nothing above 32767.** That is the kernel's ephemeral range (`net.ipv4.ip_local_port_range` is
   `32768 60999` here), so a listener bound there can lose its port to an unrelated outbound connection.
   The test enforces this for every declared port.
3. **A new service gets a new number in the same block**, added to `scripts/ports.env`, this table, and
   the defaults that read it. One number per service.
4. **Probe before binding.** `./scripts/ports.sh check <port>` answers with a pid or nothing; see
   [principles](principles.md) § 9 — a value that could have been measured is a claim until it is.
5. **Fixtures never share the stack's ports.** `PLAYWRIGHT_*` exists so an end-to-end run starts its own
   Core and cannot silently measure somebody else's instance.

## Where the value is read

| Reader | How |
|--------|-----|
| `scripts/_common.sh` | sources `ports.env` and exports the block |
| `scripts/start.sh`, `scripts/stop.sh` | `$KAMPAKU_CORE_PORT`, `$KAMPAKU_WEB_PORT` |
| `scripts/smoke-e2e.sh`, `scripts/smoke-agents-e2e.sh` | sources `ports.env` |
| `apps/core/src/config.ts` | defaults `KAMPAKU_CORE_PORT`, `KAMPAKU_WEB_PORT` |
| `apps/web/next.config.ts`, `apps/web/src/lib/` | default Core URL |
| `apps/web/playwright.config.ts` | `PLAYWRIGHT_CORE_PORT`, `PLAYWRIGHT_WEB_PORT` |

Any of these can be overridden per run by the environment; the block is only the default, so a run with
its own `run.env` still wins. See [eval protocol](../eval/00-protocol.md) § Automated test lab notes.
