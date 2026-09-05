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

Open `http://localhost:3000`. Set `KAMPAKU_CORE_URL` when Core is not running at
the default local endpoint.

Run these checks before changing the integration surface:

```bash
npm test --workspace apps/web
npm run build --workspace apps/web
npm run test:e2e --workspace apps/web
```
