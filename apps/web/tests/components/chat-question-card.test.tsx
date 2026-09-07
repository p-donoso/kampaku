import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatQuestionCard } from "@/components/chat/chat-question-card";
import { MaterialProvider } from "@/components/layout/material-provider";
import { ThemeProvider } from "@/components/layout/theme-provider";

function renderCard(props: Partial<React.ComponentProps<typeof ChatQuestionCard>> = {}) {
  const onAnswer = vi.fn();
  const onRequestContext = vi.fn();
  render(
    <ThemeProvider>
      <MaterialProvider>
        <ChatQuestionCard
          question={{ id: "scope", type: "single_choice", prompt: "Include migration?", options: ["Yes", "No"] }}
          onAnswer={onAnswer}
          onRequestContext={onRequestContext}
          {...props}
        />
      </MaterialProvider>
    </ThemeProvider>,
  );
  return { onAnswer, onRequestContext };
}

describe("ChatQuestionCard", () => {
  it("submits a selected single-choice answer", async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard();
    await user.click(screen.getByLabelText("Yes"));
    await user.click(screen.getByRole("button", { name: /answer/i }));
    expect(onAnswer).toHaveBeenCalledWith("Yes");
  });

  it("disables submit until an option is selected", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /answer/i })).toBeDisabled();
  });
});
