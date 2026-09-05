import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ProjectWikiPanel theme contract", () => {
  it("uses semantic theme tokens instead of fixed Tailwind palettes", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/project-wiki-panel.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(
      /(?:bg|text|border|ring|outline|from|via|to)-(?:zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/,
    );
    expect(source).toContain("border-border");
    expect(source).toContain("bg-surface");
    expect(source).toContain("text-foreground");
  });
});
