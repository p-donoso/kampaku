import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeProvider } from "@/components/layout/theme-provider";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

vi.mock("@/components/ui/imperial-seal-logo", () => ({
  ImperialSealLogo: () => <div data-testid="brand-logo">Logo</div>,
  ImperialSealMark: () => <div data-testid="brand-mark">Mark</div>,
}));

function renderSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return render(
    <ThemeProvider>
      <Sidebar {...props} />
    </ThemeProvider>,
  );
}

describe("Sidebar collapse control", () => {
  /**
   * Ensures the footer button forwards collapse intent to the parent handler
   * when clicked — the wiring users rely on in the desktop shell.
   */
  it("calls onCollapsedChange when the collapse button is clicked", async () => {
    const onCollapsedChange = vi.fn();
    const user = userEvent.setup();

    renderSidebar({ online: false, collapsed: false, onCollapsedChange });

    await user.click(screen.getByTestId("sidebar-collapse-toggle"));
    expect(onCollapsedChange).toHaveBeenCalledOnce();
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  /**
   * Compact mode should request expand (false) when the chevron is clicked.
   */
  it("requests expand when already collapsed", async () => {
    const onCollapsedChange = vi.fn();
    const user = userEvent.setup();

    renderSidebar({ online: false, collapsed: true, onCollapsedChange });

    await user.click(screen.getByTestId("sidebar-collapse-toggle"));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });
});
