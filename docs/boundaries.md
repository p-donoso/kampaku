# Service boundaries

Core owns orchestration decisions and canonical metadata. It does not execute arbitrary project tools, host user source repositories, or expose provider credentials to clients.

| Boundary | Core owns | Core delegates |
| --- | --- | --- |
| Project | identity, repository references, policy, knowledge metadata | source hosting to external Git providers |
| Goal and task | lifecycle, dependencies, priority, acceptance state | task execution to workers |
| Agent | definition, permissions, memory references | model inference to providers |
| Job | creation, lease, retry policy, result acceptance | sandboxed execution to workers |
| Secrets | access policy and opaque references | secret material to a secret manager |

Changes to public boundaries require a contract change in `kampaku-contracts` and, once adopted, an ADR in `kampaku-docs`.
