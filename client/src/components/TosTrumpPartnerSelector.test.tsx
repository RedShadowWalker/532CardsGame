import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TosTrumpPartnerSelector } from "./TosTrumpPartnerSelector";

describe("TosTrumpPartnerSelector", () => {
  it("disables confirm until a trump suit and full partner card are chosen", async () => {
    render(<TosTrumpPartnerSelector bidAmount={150} onChoose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("calls onChoose with the selected suit and partner card once all three picks are made", async () => {
    const onChoose = vi.fn().mockResolvedValue(undefined);
    render(<TosTrumpPartnerSelector bidAmount={150} onChoose={onChoose} />);

    // Trump suit: Hearts (♥) — trump row's is the first ♥ button.
    const heartButtons = screen.getAllByText("♥");
    await userEvent.click(heartButtons[0]);
    // Partner suit: Clubs (♣) — trump row and partner row each have one ♣ button.
    const clubButtons = screen.getAllByText("♣");
    await userEvent.click(clubButtons[clubButtons.length - 1]);
    await userEvent.click(screen.getByRole("button", { name: "A" }));

    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onChoose).toHaveBeenCalledWith("Hearts", { suit: "Clubs", rank: "A" });
  });

  it("shows the bid amount in the prompt", () => {
    render(<TosTrumpPartnerSelector bidAmount={185} onChoose={vi.fn()} />);
    expect(screen.getByText(/185/)).toBeInTheDocument();
  });
});
