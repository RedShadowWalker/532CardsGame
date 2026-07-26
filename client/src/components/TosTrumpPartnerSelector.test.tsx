import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TosTrumpPartnerSelector } from "./TosTrumpPartnerSelector";
import type { TosCardDTO } from "../shared/socketEvents";

const myHand: TosCardDTO[] = [
  { suit: "Clubs", rank: "A", value: 12 },
  { suit: "Hearts", rank: "K", value: 11 },
];

describe("TosTrumpPartnerSelector", () => {
  it("disables confirm until a Hukum suit and a partner card are chosen", () => {
    render(<TosTrumpPartnerSelector bidAmount={150} myHand={myHand} onChoose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("excludes cards from the declarer's own hand from the partner-card grid", () => {
    render(<TosTrumpPartnerSelector bidAmount={150} myHand={myHand} onChoose={vi.fn()} />);
    // A♣ and K♥ are in myHand, so those specific cards must not appear as
    // selectable candidates.
    expect(screen.queryByRole("button", { name: "A♣" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "K♥" })).not.toBeInTheDocument();
  });

  it("still shows other cards of the same rank/suit combination that aren't in hand", () => {
    render(<TosTrumpPartnerSelector bidAmount={150} myHand={myHand} onChoose={vi.fn()} />);
    // Ace of Spades is not in myHand (only Ace of Clubs is), so it should be offered.
    expect(screen.getByRole("button", { name: "A♠" })).toBeInTheDocument();
  });

  it("calls onChoose with the selected Hukum suit and partner card", async () => {
    const onChoose = vi.fn().mockResolvedValue(undefined);
    render(<TosTrumpPartnerSelector bidAmount={150} myHand={myHand} onChoose={onChoose} />);

    // Hukum suit: Hearts (the suit-picker row, symbol-only buttons).
    const heartButtons = screen.getAllByText("♥");
    await userEvent.click(heartButtons[0]);

    // Partner card: Ace of Spades, from the filtered grid.
    await userEvent.click(screen.getByRole("button", { name: "A♠" }));

    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onChoose).toHaveBeenCalledWith("Hearts", { suit: "Spades", rank: "A" });
  });

  it("shows the bid amount in the prompt", () => {
    render(<TosTrumpPartnerSelector bidAmount={185} myHand={myHand} onChoose={vi.fn()} />);
    expect(screen.getByText(/185/)).toBeInTheDocument();
  });
});