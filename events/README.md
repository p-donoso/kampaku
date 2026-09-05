# Events

All events use a common envelope containing `eventId`, `eventType`, `eventVersion`, `occurredAt`, `producer`, `correlationId`, optional `causationId`, and a typed `data` object.

Initial event families:

- `project.registered`
- `goal.created`, `goal.activated`, `goal.completed`
- `plan.created`, `task.ready`
- `job.leased`, `job.started`, `job.progressed`, `job.completed`, `job.failed`
- `worker.registered`, `worker.heartbeat_missed`

Consumers must ignore unknown additive fields and deduplicate by `eventId`.
