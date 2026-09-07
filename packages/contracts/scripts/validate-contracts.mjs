import { readFile } from "node:fs/promises";
import { glob } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const globAsync = promisify(glob);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const files = await globAsync("{schemas,openapi,skills,tool-specs}/**/*.{json,yaml,yml}", { cwd: root });
if (files.length === 0) throw new Error("No contract files found");
for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  if (!source.trim()) throw new Error(`Empty contract: ${file}`);
  if (file.endsWith(".json")) JSON.parse(source);
}
console.log(`Validated ${files.length} contract files.`);
