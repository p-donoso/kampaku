# Development principles

1. Begin with a thin end-to-end slice before expanding agent sophistication.
2. Put cross-process shapes in `packages/contracts` before implementation.
3. Keep policy decisions in Core and execution mechanics in Worker.
4. Treat project content and model output as untrusted.
5. Make behavior observable, resumable, and testable without a specific model provider.
6. Record cross-cutting decisions as ADRs.
7. Never commit credentials, runtime project data, or managed private project content.
8. All repository content — code comments, documentation, commit messages, and user-facing strings — must be written in English regardless of the language used in team communication.
