# 13 — Survive interruption

## Promise tested

Work survives process death or is reported lost honestly; cancel really cancels.

## Why it elevates

Weak: ghost jobs, silent loss, cancel that keeps running. Credible: resume or clear status; cancel stops progress.

## Prereqs

- Suites 01–05 pass; ideally a short-running job from suite 08 if available. Otherwise start a deliberately long trivial task.

## Emperor prompts

1. `Start a long-running but safe task I can interrupt (for example generate many small files in the stranger project). Tell me when it is running.`
2. After restart: `What is the state of that work? Resume if safe, or tell me what was lost.`
3. On a second run: `Cancel that work for real and confirm nothing new is written after cancel.`

## Operator actions (not chat)

- While a job is active: kill the stack processes (hard interrupt), then restart per public docs.
- For cancel: use the public cancel control (CLI and/or UI), then watch the repo for further writes.

## Oracle

- After restart, status is truthful: running, queued, failed, or lost — not a green lie.
- If resume is claimed, progress continues without duplicating completed side effects blindly (or duplicates are acknowledged).
- After cancel: no new artifacts appear for that job past a short grace window.
- Chat, CLI, and web agree on the terminal state.

## How to measure

- Job/work status via CLI/UI before kill, after restart, after cancel.
- Filesystem watch on the target repo during cancel window.
- Wall clock and whether the product required secret tribal recovery steps (lift smell).

## Pass

- Binary: all oracle bullets hold.
- Advisor score: __ / 10

## Run log

| Field | Value |
|-------|-------|
| Date | |
| Data dir | |
| Git SHA | |
| Model / provider | |
| Wall clock | |
| Job / work id | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
