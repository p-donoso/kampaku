import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * **A listener this project started, but whose pid file no longer knows it, has to be reclaimable by the project.**
 *
 * Measured on `stop.sh`'s own output (BOARD F-016): *"Those processes were not started by this run (or their pid file
 * was overwritten), so stop.sh cannot know they are yours. Kill them explicitly before restarting."* The orphan is
 * real, the operator did not create it, and the only tool that could clear it was `kill` by hand from an `ss` listing —
 * after which the next start can bind again. A service lifecycle that can loose a port and cannot get it back is a
 * lifecycle the operator drives by hand.
 *
 * The shape here is a **port-ownership marker**: `start.sh` records, per port, the pid that actually owned the socket
 * and a fingerprint of that process (`/proc/<pid>/stat` start time + command line). `stop.sh` and the next `start.sh`
 * ask the marker, and reclaim only what it claims.
 *
 * The fingerprint is the safety property, not a flourish: `kill -0` answers "is something with this number alive", and
 * after the number is recycled the answer is about a different program. These cases exist mostly to prove the
 * reclaim **refuses**.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "packages/contracts"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find the repository root from ${process.cwd()}`);
}

const root = repoRoot();
const runDirs: string[] = [];

function runDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kampaku-port-owner-"));
  runDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of runDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs a bash snippet against the real `scripts/_common.sh`, in a run dir of its own. */
function bash(script: string, dir: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("bash", ["-c", `set -uo pipefail\nsource "${join(root, "scripts/_common.sh")}"\n${script}`], {
      cwd: root,
      env: { ...process.env, KAMPAKU_RUN_DIR: dir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; status?: number };
    return { stdout: failure.stdout ?? "", status: failure.status ?? 1 };
  }
}

describe("a run can reclaim the listeners it started (F-016)", () => {
  it("records the pid that owns the socket, with a fingerprint of that process", () => {
    const dir = runDir();
    const { stdout } = bash(
      `
      sleep 30 & target=$!
      write_port_marker core 28080 "$target"
      echo "FILE=$(port_marker_file 28080)"
      echo "MATCHES=$(marker_matches 28080 "$target" && echo yes || echo no)"
      echo "WRONG_PID=$(marker_matches 28080 1 && echo yes || echo no)"
      kill "$target" 2>/dev/null || true
      `,
      dir,
    );

    const marker = join(dir, "port-28080.owner");
    expect(existsSync(marker), `the marker is a file in the run dir, not a log line: ${stdout}`).toBe(true);
    const body = readFileSync(marker, "utf8");
    expect(body).toContain("service=core");
    expect(body).toContain("port=28080");
    expect(body).toMatch(/^pid=\d+$/m);
    expect(body, "the fingerprint is what makes a recycled pid distinguishable").toMatch(/^identity=\d+\t/m);
    expect(stdout).toContain("MATCHES=yes");
    expect(stdout, "another pid is not this run's listener").toContain("WRONG_PID=no");
  });

  it("refuses a pid whose number was recycled: same number, different process", () => {
    const dir = runDir();
    const { stdout } = bash(
      `
      sleep 30 & target=$!
      # A marker that names this pid but a fingerprint from a process that is not this one — which is exactly the
      # state a reboot leaves behind when a number comes back around. The other process differs in its command line,
      # which is the half of the fingerprint that does the work here: two identical commands started in the same
      # clock tick are genuinely indistinguishable, and the script says so rather than pretending otherwise.
      sleep 31 & other=$!
      identity="$(process_identity "$other")"
      printf 'service=web\\nport=28081\\npid=%s\\nidentity=%s\\nat=2026-01-01T00:00:00Z\\n' "$target" "$identity" \\
        > "$(port_marker_file 28081)"
      echo "RECYCLED=$(marker_matches 28081 "$target" && echo yes || echo no)"
      kill "$target" "$other" 2>/dev/null || true
      `,
      dir,
    );

    expect(stdout, "a marker whose fingerprint does not match must not authorize a kill").toContain("RECYCLED=no");
  });

  it("reclaims a real listener it recorded, and frees the port", () => {
    const dir = runDir();
    const { stdout } = bash(
      `
      port=""
      for candidate in $(seq 28090 28099); do
        if [[ -z "$(listening_pid "$candidate")" ]]; then port="$candidate"; break; fi
      done
      [[ -n "$port" ]] || { echo "NO_FREE_PORT"; exit 0; }

      # Redirected away from the runner's pipe: a server that leaks on a failing assertion then cannot hold the
      # test's stdout open and hang the file. Every case is expected to kill what it starts; this is the belt.
      node -e 'require("node:http").createServer((_, res) => res.end("ok")).listen(Number(process.argv[1]))' "$port" \
        >/dev/null 2>&1 &
      server=$!
      for _ in $(seq 1 40); do ss -ltn 2>/dev/null | grep -q ":$port " && break; sleep 0.1; done
      write_port_marker web "$port" "$server"
      echo "BEFORE=$(listening_pid "$port")"
      reclaim_port web "$port" && echo "RECLAIMED=yes" || echo "RECLAIMED=no"
      sleep 0.3
      echo "AFTER=$(listening_pid "$port")"
      echo "MARKER_LEFT=$(test -f "$(port_marker_file "$port")" && echo yes || echo no)"
      kill "$server" 2>/dev/null || true
      `,
      dir,
    );

    expect(stdout).not.toContain("NO_FREE_PORT");
    expect(stdout).toContain("RECLAIMED=yes");
    expect(stdout, "the port is free after the reclaim").toMatch(/AFTER=\s*$/m);
    expect(stdout, "the marker goes with the listener it described").toContain("MARKER_LEFT=no");
  }, 60_000);

  it("leaves a stranger's listener alone and reports it", () => {
    const dir = runDir();
    const { stdout } = bash(
      `
      port=""
      for candidate in $(seq 28090 28099); do
        if [[ -z "$(listening_pid "$candidate")" ]]; then port="$candidate"; break; fi
      done
      [[ -n "$port" ]] || { echo "NO_FREE_PORT"; exit 0; }

      # Redirected away from the runner's pipe: a server that leaks on a failing assertion then cannot hold the
      # test's stdout open and hang the file. Every case is expected to kill what it starts; this is the belt.
      node -e 'require("node:http").createServer((_, res) => res.end("ok")).listen(Number(process.argv[1]))' "$port" \
        >/dev/null 2>&1 &
      server=$!
      for _ in $(seq 1 40); do ss -ltn 2>/dev/null | grep -q ":$port " && break; sleep 0.1; done
      # No marker: this listener is not ours to kill.
      reclaim_port web "$port" && echo "RECLAIMED" || echo "REFUSED=$?"
      echo "STILL=$(listening_pid "$port")"
      kill "$server" 2>/dev/null || true
      `,
      dir,
    );

    expect(stdout).not.toContain("NO_FREE_PORT");
    expect(stdout, "no marker means no reclaim").toContain("REFUSED=2");
    expect(stdout, "the stranger keeps its port").toMatch(/STILL=\d+/);
  }, 60_000);

  it("wires the marker into both scripts, with one implementation of who holds a port", () => {
    const start = readFileSync(join(root, "scripts/start.sh"), "utf8");
    const stop = readFileSync(join(root, "scripts/stop.sh"), "utf8");

    // Written where the socket is actually known to be served, not where a wrapper was spawned.
    expect(start).toContain('write_port_marker core "$CORE_PORT" "$core_pid"');
    expect(start).toContain('write_port_marker web "$WEB_PORT" "$owner"');
    // And reclaimed before binding, so a start after a crashed stop is not a start that cannot bind.
    expect(start).toContain('reclaim_port core "$CORE_PORT"');
    expect(start).toContain('reclaim_port web "$WEB_PORT"');
    expect(stop).toContain("reclaim_own_listeners");

    // One answer to "who holds this port": the helper every caller sources.
    const common = readFileSync(join(root, "scripts/_common.sh"), "utf8");
    expect(common).toContain("listening_pid()");
    for (const [name, source] of [
      ["scripts/start.sh", start],
      ["scripts/stop.sh", stop],
    ] as const) {
      expect(source, `${name} must not keep its own copy of listening_pid`).not.toContain("listening_pid() {");
    }
  });
});
