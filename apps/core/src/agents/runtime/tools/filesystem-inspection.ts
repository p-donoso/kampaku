import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { findAllowedFolderForPath, getFilesystemSettings } from "../../../application/settings/filesystem.js";
import type { KampakuToolContext } from "./index.js";

function assertAllowed(ctx: KampakuToolContext, path: string): string {
  const target = resolve(path);
  if (!findAllowedFolderForPath(target, getFilesystemSettings(ctx.store).folders)) {
    throw new Error(`Path is outside allowed folders: ${path}`);
  }
  return target;
}

export function executeListFiles(ctx: KampakuToolContext, args: { path: string; recursive?: boolean; limit?: number }) {
  const root = assertAllowed(ctx, args.path);
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);
  const files: string[] = [];
  const walk = (directory: string) => {
    if (files.length >= limit) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next") continue;
      const full = resolve(directory, entry.name);
      if (entry.isDirectory() && args.recursive) walk(full);
      else if (entry.isFile()) files.push(full);
      if (files.length >= limit) return;
    }
  };
  walk(root);
  return { path: root, files };
}

export function executeReadFile(ctx: KampakuToolContext, args: { path: string; max_bytes?: number }) {
  const path = assertAllowed(ctx, args.path);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`Path is not a file: ${args.path}`);
  const maxBytes = Math.min(Math.max(args.max_bytes ?? 50000, 1), 200000);
  const buffer = readFileSync(path);
  return { path, content: buffer.subarray(0, maxBytes).toString("utf8"), truncated: buffer.length > maxBytes, bytes: buffer.length };
}

export const LIST_FILES_TOOL = { type: "function" as const, function: { name: "list_files", description: "List files in an allowed folder for repository inspection. Skips .git, node_modules, and .next.", parameters: { type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" }, limit: { type: "integer" } }, required: ["path"] } } };
export const READ_FILE_TOOL = { type: "function" as const, function: { name: "read_file", description: "Read a bounded text file from an allowed folder for repository inspection.", parameters: { type: "object", properties: { path: { type: "string" }, max_bytes: { type: "integer" } }, required: ["path"] } } };
