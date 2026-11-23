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
