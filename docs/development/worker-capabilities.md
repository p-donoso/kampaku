# Worker Capabilities

## Capability policy

Core derives verification capabilities from acceptance criteria and includes them in job input. The worker enforces the resulting allowlist before tool execution. Policies contain an allowlist and a bounded timeout.

## Available verification tools

- `run_check`: declared package scripts.
- `verify_file` and `inspect_artifact`: repository artifacts and bounded text extraction.
- `request_endpoint`: localhost or HTTPS GET and HEAD requests with a timeout.
- `inspect_ui`: page status, title, and bounded HTML over localhost or HTTPS.
- `inspect_media`: document and media metadata without upload or decoding.
- `inspect_document`: PDF and DOCX text extraction with page, heading, and table structure.
- `inspect_image`: PNG/JPEG dimensions, ink ratio, and blank-render detection.
- `compare_images`: pixel-level PNG comparison with a changed ratio.
- `inspect_audio`: WAV/MP3 duration, codec, channels, sample rate, peak, and RMS.
- `inspect_video`: MP4 duration, dimensions, and track count.
- `inspect_dataset`: CSV/JSON schema, null counts, duplicates, and declared invariants.
- `query_dataset`: bounded CSV/JSON row filtering.
- `run_browser_session`: Playwright navigation, click, fill, select, press, wait, screenshot, console-error capture, and accessibility snapshots.

## Current limitations

OCR, speech analysis, video frame extraction, and SQL queries are not available in this worker. They raise `INSPECTION_UNSUPPORTED` rather than returning an approximation, and `INSPECTION_MALFORMED` for corrupt input. Metadata inspection must never be represented as content verification.

## Verification is capability-shaped, not language-shaped

The tools above observe *kinds of things* — an artifact, a behavior, a contract, a rendered page, a
dataset — rather than one ecosystem's conventions. A check runs the command the project declares; an
artifact is inspected for content, not for the framework that produced it.

Two rules make this honest:

1. **A capability that cannot be provided fails closed.** `INSPECTION_UNSUPPORTED` is preferable to an
   approximation, because it lets a criterion be reported unverified instead of absorbed by a green
   board.
2. **Metadata is never content verification.** A duration, a codec, a page count, or a file size says
   nothing about whether the artifact satisfies a criterion about its content. A 44-byte header-only
   WAV passes every metadata check ([BOARD F-009](../eval/results/BOARD.md)).

A criterion whose evidence needs a round-trip — produce, consume, compare — needs a capability that
performs one. Where the worker has none, the criterion is unverified, and the project must be told so.

## Provider neutrality

Worker execution uses an OpenAI-compatible model protocol with generic configuration names. Legacy provider-specific names are not part of the evidence or capability contracts.

Model profiles negotiate structured output, tool calls, streaming, and bounded limits through the protocol contract. Planner and worker code consume capabilities rather than provider names.

A model that advertises tool support and does not call tools in practice is an endpoint gap, not a
transient failure: capability must be negotiated and verified per endpoint rather than trusted from an
advertisement ([BOARD F-008](../eval/results/BOARD.md)).
