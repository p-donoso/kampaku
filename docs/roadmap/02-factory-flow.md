# 2. Normative factory flow

Every accepted software work order follows this line. A stage may be skipped only when its gate
records why it is not applicable.

1. **Intake** — classify the request, reject out-of-scope work, identify the project container,
   and ask blocking decisions.
2. **Planning** — inspect the repository, discover its toolchain and architecture, define vertical
   slices, acceptance criteria, and evidence.
3. **Staffing** — assign a responsible lead and only the specialists required by the repository.
4. **Execution** — run leased work in a bounded sandbox and write only to the managed project.
5. **Inspection** — re-run checks, inspect artifacts, reconcile claims with durable state, and
   reopen work when evidence is missing or contradicted.
6. **Shipment** — produce a versioned artifact, truthful completion report, and documentation that
   matches the repository.

## Gates

- No plan without a clear work order.
- No execution without an approved plan.
- No closure without criterion-level evidence.
- No silent scope expansion.
- No shipment with failed, missing, or unverified required evidence.
- No operation outside the project and role boundaries.

The front office opens work. The line plans and builds. Inspection remains independent.

## Stage checklist

- [ ] Intake records a valid work order and project/repository relationship.
- [ ] Planning discovers repository shape and project-native verification.
- [ ] Staffing assigns only roles and skills required by the work.
- [ ] Execution stays inside the project and approved task scope.
- [ ] Inspection re-executes required checks against the artifact.
- [ ] Shipment includes a versioned artifact and matching documentation.
- [ ] Every blocked transition has a durable reason and recovery path.
