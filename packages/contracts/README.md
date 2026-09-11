# Kampaku Contracts

Machine-readable shared interfaces, schemas, OpenAPI specifications, and skill catalogs.

## Structure

- `openapi/`: REST API specification (`control-plane.yaml`).
- `schemas/`: Reusable JSON Schemas for validation.
- `skills/`: System and domain specialist catalog in the open Agent Skills
  `<slug>/SKILL.md` format.
- `tool-specs/`: Agent tool interface definitions.

## Validation

```bash
npm run contracts:check
```

The validator checks every skill's YAML frontmatter, directory/name identity,
Kampaku metadata, tool uniqueness, and non-empty Markdown instructions. JSON
Schema remains the contract for the parsed runtime record, not the authored
skill format.
