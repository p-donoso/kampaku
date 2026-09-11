import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubNav } from "@/components/ui/sub-nav";

const navigation = vi.hoisted(() => ({ pathname: "/agents/skills" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

describe("SubNav", () => {
  beforeEach(() => {
    navigation.pathname = "/agents/skills";
  });

  it("uses serializable exclusions to select the most specific nested tab", () => {
    render(
      <SubNav
        tabs={[
          {
            href: "/agents",
            label: "Roster",
            excludePrefixes: ["/agents/skills"],
          },
          { href: "/agents/skills", label: "Skills" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Roster" })).toHaveClass(
      "border-transparent",
    );
    expect(screen.getByRole("link", { name: "Skills" })).toHaveClass("border-brand");
  });

  it("keeps the parent tab active for non-excluded detail routes", () => {
    navigation.pathname = "/agents/reviewer";

    render(
      <SubNav
        tabs={[
          {
            href: "/agents",
            label: "Roster",
            excludePrefixes: ["/agents/skills"],
          },
          { href: "/agents/skills", label: "Skills" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Roster" })).toHaveClass("border-brand");
    expect(screen.getByRole("link", { name: "Skills" })).toHaveClass(
      "border-transparent",
    );
  });
});
