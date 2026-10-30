# Resume — suite 16

The operator reports that suite 16 is the current work. This replaces the previous handoff, which pointed to
suite 08 and incorrectly said suites 13–25 had not been run.

Use the [evaluation guide](README.md), [run protocol](00-protocol.md), and [suite 16](16-operator-ui.md). The suite
protocol is unchanged and currently has no run record; do not infer a score or verdict. Check the
[evaluation board](results/BOARD.md) before and after the run.

Keep live run data under `.kampaku/runs/<run-id>/` as the protocol specifies. On close, update suite 16's concise
status and preserve a dated historical snapshot only if the run establishes a meaningful verdict or changes a
board disposition. Keep routine automated output in GitHub Actions.
