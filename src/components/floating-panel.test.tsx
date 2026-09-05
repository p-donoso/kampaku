import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FloatingPanel } from "./floating-panel";

describe("FloatingPanel", () => {
  it("does not expose dialog content while closed", () => {
    render(
      <FloatingPanel open={false} onClose={vi.fn()} title="Detalle">
        Contenido
      </FloatingPanel>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the user clicks the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <FloatingPanel open onClose={onClose} title="Detalle" subtitle="project-1">
        Contenido
      </FloatingPanel>,
    );

    expect(screen.getByRole("dialog", { name: "Detalle" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Close panel" })[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the user presses Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <FloatingPanel open onClose={onClose} title="Detalle">
        Contenido
      </FloatingPanel>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
