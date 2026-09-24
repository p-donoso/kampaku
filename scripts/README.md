# Kampaku Operations Scripts

This directory contains utility and lifecycle management shell scripts for operating the Kampaku workspace.

## Scripts

- **`install.sh`**: Installs monorepo dependencies, builds packages, bootstraps initial state, and links the local `kampaku` CLI wrapper into `~/.local/bin`.
- **`start.sh`**: Starts the Kampaku services stack (the model endpoint, Core API, Worker executor, Next.js Web UI).
- **`stop.sh`**: Stops any running Kampaku background services and cleans up process PID files.
- **`kampaku`**: Executable wrapper invoking the Core CLI (`npx tsx src/cli.ts` or compiled dist).
- **`debug.sh`**: Convenient shortcut executing `kampaku dev "$@"`.
- **`smoke-e2e.sh`**: End-to-end integration smoke test verifying core and worker job execution loop.
- **`smoke-agents-e2e.sh`**: End-to-end smoke test validating multi-agent hierarchy and chat orchestration.
- **`_common.sh`**: Shared environment setup, process PID management, and health checking utilities.
