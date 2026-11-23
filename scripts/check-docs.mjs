#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const markdown = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile() && entry.name.endsWith(".md")) markdown.push(absolute);
  }
}

walk(path.join(root, "docs"));
markdown.push(path.join(root, "README.md"));

const errors = [];
const roadmapRequiredHeadings = [
  "## Purpose",
  "## Outcome",
  "## Scope",
  "## Definition of done",
  "## Gate",
  "## Software scope and invariants",
  "## Design rules",
  "## Work checklist",
  "## Risks and open decisions",
  "## Delivery record",
];

function relative(file) {
  return path.relative(root, file) || ".";
}

for (const file of markdown) {
  const source = fs.readFileSync(file, "utf8");
  const withoutFences = source.replace(/```[\s\S]*?```/g, "");
  const links = /!?(?:\[([^\]]*)\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = links.exec(withoutFences))) {
    const label = match[1];
    const raw = match[2].replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|data:|#|codex:)/i.test(raw)) continue;
    const target = decodeURIComponent(raw.split("#", 1)[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      errors.push(`${relative(file)}: broken link ${raw}`);
    }
    if (/\broadmap\s+\d+\b/i.test(label) && !resolved.includes(`${path.sep}docs${path.sep}roadmap${path.sep}`)) {
      errors.push(`${relative(file)}: roadmap label points outside docs/roadmap: ${raw}`);
    }
  }
}

/**
 * The eval board is a summary, and this is the check that keeps it one.
 *
 * Measured 2026-11-23: 155 rows carried 415 000 characters between them — one row was 8 594 — because every
 * re-measurement, transcript and fix narrative was appended to the cell it belonged to. The board is read to
 * decide what to work on next, and at that size it answered nothing without a full read. Detail now lives in
 * the row's GitHub issue (`open`) or in the commit and suite document (`resolved`), and the budget below is
 * the reason it stays there.
 */
const BOARD_ROW_BUDGET = 700;
const BOARD_BUDGET = 120_000;

const boardFile = path.join(root, "docs/eval/results/BOARD.md");
if (fs.existsSync(boardFile)) {
  const board = fs.readFileSync(boardFile, "utf8");
  const ids = new Map();
  for (const [index, line] of board.split("\n").entries()) {
    if (!line.startsWith("| **F-")) continue;
    const id = /^\| \*\*(F-\d+)\*\*/.exec(line)?.[1] ?? "?";
    const where = `docs/eval/results/BOARD.md:${index + 1}`;

    if (line.length > BOARD_ROW_BUDGET) {
      errors.push(`${where}: row ${id} is ${line.length} characters, over the ${BOARD_ROW_BUDGET}-character budget — move the detail to its issue or the suite document`);
    }
    // A row is `| id | suites | symptom | gap | layer | owner | status | notes |`: nine pipes, eight cells.
    const cells = line.split("|").length - 2;
    if (cells !== 8) {
      errors.push(`${where}: row ${id} has ${cells} cells, expected 8 — a literal | inside a cell breaks the table`);
    }
    if (ids.has(id)) {
      errors.push(`${where}: row ${id} already exists at line ${ids.get(id)} — ids are unique`);
    } else {
      ids.set(id, index + 1);
    }
    const status = /\|\s*\*\*(open|in_progress|implemented)\*\*\s*\|/.test(line);
    if (status && !/github\.com\/p-donoso\/kampaku\/issues\/\d+/.test(line)) {
      errors.push(`${where}: row ${id} is ${"open"} and links no issue — its detail has no home`);
    }
  }
  if (board.length > BOARD_BUDGET) {
    errors.push(`docs/eval/results/BOARD.md is ${board.length} characters, over the ${BOARD_BUDGET}-character budget`);
  }
}

for (const file of markdown.filter((entry) => /docs\/roadmap\/(?!00-)\d\d-[^/]+\.md$/.test(entry))) {
  const source = fs.readFileSync(file, "utf8");
  for (const heading of roadmapRequiredHeadings) {
    if (!source.split("\n").some((line) => line.trim() === heading)) {
      errors.push(`${relative(file)}: missing required section ${heading}`);
    }
  }
  for (const field of ["Document", "Kind", "Tracking issue", "Related documents", "Last reviewed"]) {
    if (!new RegExp(`^[-*] \\*\\*${field}:`, "m").test(source)) {
      errors.push(`${relative(file)}: missing metadata ${field}`);
    }
  }
}

if (errors.length) {
  console.error(`Documentation check failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Documentation check passed: ${markdown.length} Markdown files checked.`);
