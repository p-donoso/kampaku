# Worker Capabilities

## Capability policy

Core derives verification capabilities from acceptance criteria and includes them in job input. The worker enforces the resulting allowlist before tool execution. Policies contain an allowlist and a bounded timeout.

## Available verification tools

- `run_check`: declared package scripts.
- `verify_file` and `inspect_artifact`: repository artifacts and bounded text extraction.
- `request_endpoint`: localhost or HTTPS GET and HEAD requests with a timeout.
- `inspect_ui`: page status, title, and bounded HTML over localhost or HTTPS.
- `inspect_media`: document and media metadata without upload or decoding.
- Browser runtime: Playwright navigation, screenshots, and accessibility snapshots.

## Current limitations

Browser clicks, form workflows, deep document parsing, OCR, media decoding, and advanced dataset queries remain planned capabilities. Metadata inspection must not be represented as content verification.

## Provider neutrality

Worker execution uses an OpenAI-compatible model protocol with generic configuration names. Legacy provider-specific names are not part of the evidence or capability contracts.

Model profiles negotiate structured output, tool calls, streaming, and bounded limits through the protocol contract. Planner and worker code consume capabilities rather than provider names.
