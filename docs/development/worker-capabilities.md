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

## Provider neutrality

Worker execution uses an OpenAI-compatible model protocol with generic configuration names. Legacy provider-specific names are not part of the evidence or capability contracts.

Model profiles negotiate structured output, tool calls, streaming, and bounded limits through the protocol contract. Planner and worker code consume capabilities rather than provider names.
