# Kampaku Contracts

This repository is the source of truth for contracts shared across Kampaku components. It contains transport APIs, data schemas, event envelopes, protocols, and tool specifications without coupling consumers to a particular implementation language.

## Contents

```text
openapi/      HTTP API descriptions
schemas/      reusable JSON Schemas
events/       event envelopes and event catalog
protocols/    lifecycle and interaction protocols
tool-specs/   agent-visible tool definitions
```

## Compatibility policy

- Published contracts are versioned explicitly.
- Additive changes are preferred within a version.
- Breaking changes require a new major contract version and migration notes.
- Events are immutable facts; corrections are represented by subsequent events.
- Identifiers, timestamps, idempotency keys, and correlation IDs must have stable semantics.
- Generated client/server code is build output and is not committed unless an ADR says otherwise.

The initial files are deliberately small and implementation-neutral. They establish vocabulary and the first end-to-end Project/Goal/Task/Job/Result slice.

## Validation

Automated schema and OpenAPI linting will be added with the first implementation toolchain decision.

## Licensing

No license has been selected. All rights are reserved until the project owners adopt and publish a license explicitly.
