# Kampaku Web

Kampaku Web is the operator interface for the Core control plane. It communicates
with Core over the documented HTTP and SSE APIs and does not access persistence
directly.

## Getting started

From the monorepo root:

```bash
npm install
npm run dev --workspace apps/web
```

Open `http://127.0.0.1:28002`, or set `KAMPAKU_WEB_PORT` to another port from the declared block
([local ports](../../docs/development/local-ports.md), declared in `scripts/ports.env`). Set
`KAMPAKU_CORE_URL` when Core is not at the default local endpoint, `http://127.0.0.1:28080`.

Run these checks before changing the integration surface:

```bash
npm test --workspace apps/web
npm run build --workspace apps/web
npm run test:e2e --workspace apps/web
```
