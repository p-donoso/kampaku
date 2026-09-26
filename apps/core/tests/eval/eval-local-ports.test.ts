import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The local port block.
 *
 * The defect this locks out is not a crash, it is a tax: an agent needs a port, picks 3000 or 8080
 * because that is what everything else uses, finds a listener it did not start, and spends a turn on a
 * question the repository could have answered. So the block is declared in exactly one file
 * (`scripts/ports.env`), documented in `docs/development/local-ports.md`, and read by the code that
 * binds. This file scores that the three still agree, and that no declared port is one of the shared
 * defaults or inside the kernel's ephemeral range.
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

function read(relativePath: string): string {
  const absolute = join(root, relativePath);
  if (!existsSync(absolute)) throw new Error(`Missing file: ${relativePath}`);
  return readFileSync(absolute, "utf8");
}

/** The declaration. Absences are asserted, so a missing declaration fails rather than reads as empty. */
function declaredPorts(): Record<string, string> {
  const declared: Record<string, string> = {};
  for (const line of read("scripts/ports.env").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(\d+)$/);
    if (match) declared[match[1]] = match[2];
  }
  return declared;
}

const DECLARATION = "scripts/ports.env";
const DOCUMENTATION = "docs/development/local-ports.md";

/**
 * Ports that are the default of at least one common dev server. On a machine that runs more than one
 * thing they collide by construction, which is the whole reason this block exists.
 */
const SHARED_DEFAULTS = new Set(["3000", "3001", "3002", "5000", "8000", "8080"]);

/** `net.ipv4.ip_local_port_range`. A listener inside it can lose its port to an outbound connection. */
const EPHEMERAL_RANGE = { start: 32768, end: 60999 };

/** The block the project reserves for itself. */
const BLOCK = { start: 28000, end: 28099 };

const ports = declaredPorts();

describe("the local port block is declared once and read everywhere", () => {
  it("declares every service the stack binds", () => {
    for (const name of [
      "KAMPAKU_CORE_PORT",
      "KAMPAKU_WEB_PORT",
      "KAMPAKU_MODEL_ENDPOINT_PORT",
      "PLAYWRIGHT_CORE_PORT",
      "PLAYWRIGHT_WEB_PORT",
    ]) {
      expect(ports[name], `${DECLARATION} must declare ${name}`).toBeDefined();
    }
  });

  it("keeps every declared port inside the reserved block and out of the ephemeral range", () => {
    for (const [name, value] of Object.entries(ports)) {
      const port = Number(value);

      expect(
        port >= BLOCK.start && port <= BLOCK.end,
        `${name}=${value} is outside the reserved block ${BLOCK.start}-${BLOCK.end}`,
      ).toBe(true);

      expect(
        port < EPHEMERAL_RANGE.start || port > EPHEMERAL_RANGE.end,
        `${name}=${value} is inside the kernel's ephemeral range ${EPHEMERAL_RANGE.start}-${EPHEMERAL_RANGE.end}, ` +
          "where a listener can lose its port to an unrelated outbound connection",
      ).toBe(true);

      expect(
        SHARED_DEFAULTS.has(value),
        `${name}=${value} is a default of common dev tooling and collides by construction; take a port from the block`,
      ).toBe(false);
    }
  });

  it("keeps the documented table and the declaration in agreement", () => {
    const documentation = read(DOCUMENTATION);

    for (const [name, value] of Object.entries(ports)) {
      expect(
        documentation,
        `${DOCUMENTATION} must carry a table row for ${name} with the declared value ${value}`,
      ).toMatch(new RegExp(`\\|\\s*\`${name}\`\\s*\\|\\s*\`${value}\`\\s*\\|`));
    }

    // A row for a variable that the declaration does not have is a documented port nobody binds.
    const documented = [...documentation.matchAll(/\|\s*`([A-Z0-9_]+_PORT)`\s*\|\s*`(\d+)`\s*\|/g)];
    expect(documented.length, `${DOCUMENTATION} must document the block in a table`).toBeGreaterThan(0);
    for (const [, name] of documented) {
      expect(ports[name], `${DOCUMENTATION} documents ${name}, which ${DECLARATION} does not declare`).toBeDefined();
    }
  });

  it("is what the code that binds actually defaults to", () => {
    const config = read("apps/core/src/config.ts");
    expect(config.match(/process\.env\.KAMPAKU_CORE_PORT \?\? "(\d+)"/)?.[1]).toBe(ports.KAMPAKU_CORE_PORT);
    expect(config.match(/process\.env\.KAMPAKU_WEB_PORT \?\? "(\d+)"/)?.[1]).toBe(ports.KAMPAKU_WEB_PORT);

    const coreUrl = `http://127.0.0.1:${ports.KAMPAKU_CORE_PORT}`;
    for (const file of [
      "apps/web/next.config.ts",
      "apps/web/src/lib/api/client.ts",
      "apps/web/src/lib/chat-stream.ts",
    ]) {
      expect(read(file), `${file} must default to the declared Core port`).toContain(coreUrl);
    }

    const playwright = read("apps/web/playwright.config.ts");
    expect(playwright.match(/PLAYWRIGHT_CORE_PORT \?\? "(\d+)"/)?.[1]).toBe(ports.PLAYWRIGHT_CORE_PORT);
    expect(playwright.match(/PLAYWRIGHT_WEB_PORT \?\? "(\d+)"/)?.[1]).toBe(ports.PLAYWRIGHT_WEB_PORT);

    const template = read(".env.example");
    expect(template).toContain(`KAMPAKU_CORE_PORT=${ports.KAMPAKU_CORE_PORT}`);
    expect(template).toContain(`KAMPAKU_WEB_PORT=${ports.KAMPAKU_WEB_PORT}`);

    const readme = read("README.md");
    expect(readme).toContain(`:${ports.KAMPAKU_WEB_PORT}`);
    expect(readme).toContain(`:${ports.KAMPAKU_CORE_PORT}`);
  });

  it("keeps the scripts reading the block instead of repeating a number", () => {
    for (const file of ["scripts/start.sh", "scripts/stop.sh"]) {
      const source = read(file);
      expect(source, `${file} must bind the declared Core port`).toContain("KAMPAKU_CORE_PORT");
      expect(source, `${file} must bind the declared Web port`).toContain("KAMPAKU_WEB_PORT");
      for (const stale of ["8080", "3002"]) {
        expect(source, `${file} still repeats the shared default ${stale} instead of reading the block`).not.toContain(
          stale,
        );
      }
    }

    for (const file of ["scripts/smoke-e2e.sh", "scripts/smoke-agents-e2e.sh"]) {
      expect(read(file), `${file} must take its port from the block`).toContain("ports.env");
    }

    expect(read("scripts/_common.sh"), "scripts/_common.sh must export the block").toContain("ports.env");
  });

  it("ships the probe as something a person or an agent can actually run", () => {
    const probe = join(root, "scripts/ports.sh");
    expect(existsSync(probe), "scripts/ports.sh must exist").toBe(true);
    expect(statSync(probe).mode & 0o111, "scripts/ports.sh must be executable").toBeGreaterThan(0);

    const source = read("scripts/ports.sh");
    for (const command of ["list", "check", "free"]) {
      expect(source, `scripts/ports.sh must implement ${command}`).toContain(command);
    }
  });

  /**
   * The guard is only worth having if it can fail. This proves the two checks that carry the intent —
   * the shared-default refusal and the agreement with the code — are live rather than vacuously true.
   */
  it("would catch a reintroduced default", () => {
    expect(SHARED_DEFAULTS.has("8080")).toBe(true);
    expect(SHARED_DEFAULTS.has(ports.KAMPAKU_CORE_PORT)).toBe(false);

    const wrong = `const corePort = Number(process.env.KAMPAKU_CORE_PORT ?? "8080");`;
    expect(wrong.match(/process\.env\.KAMPAKU_CORE_PORT \?\? "(\d+)"/)?.[1]).toBe("8080");
    expect(wrong.match(/process\.env\.KAMPAKU_CORE_PORT \?\? "(\d+)"/)?.[1]).not.toBe(ports.KAMPAKU_CORE_PORT);
  });
});
