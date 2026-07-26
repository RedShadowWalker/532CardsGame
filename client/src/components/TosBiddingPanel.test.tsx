import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TosBiddingPanel } from "./TosBiddingPanel";
import type { TosGameStateDTO } from "../shared/socketEvents";

function makeState(overrides: Partial<TosGameStateDTO> = {}): TosGameStateDTO {
  return {
    phase: "AUCTION",
    round: 1,
    matchLength: 7,
    players: ["A", "B", "C", "D"],
    dealerId: "A",
    handSizes: { A: 13, B: 13, C: 13, D: 13 },
    declarerId: null,
    bidAmount: null,
    trumpSuit: null,
    partnerCard: null,
    partnerId: null,
    partnerRevealed: false,
    currentTrick: [],
    capturedPoints: {},
    roundHistory: [],
    pendingVoteStatus: null,
    highestBid: null,
    activeBidders: ["A", "B", "C", "D"],
    currentBidderId: "B",
    ...overrides,
  };
}

const playerNames = { A: "Alice", B: "Bob", C: "Carol", D: "Dave" };

describe("TosBiddingPanel", () => {
  it("shows bid/pass controls only on your turn", () => {
    const { rerender } = render(
      <TosBiddingPanel gameState={makeState()} myPlayerId="B" playerNames={playerNames} onBid={vi.fn()} onPass={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /^bid/i })).toBeInTheDocument();

    rerender(
      <TosBiddingPanel gameState={makeState()} myPlayerId="C" playerNames={playerNames} onBid={vi.fn()} onPass={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: /^bid/i })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting on bob/i)).toBeInTheDocument();
  });

  it("defaults the bid amount to 130 when there's no highest bid yet", async () => {
    const onBid = vi.fn().mockResolvedValue(undefined);
    render(
      <TosBiddingPanel gameState={makeState()} myPlayerId="B" playerNames={playerNames} onBid={onBid} onPass={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /^bid 130$/i }));
    expect(onBid).toHaveBeenCalledWith(130);
  });

  it("raises the bid floor to highestBid + 5 once someone has bid", () => {
    render(
      <TosBiddingPanel
        gameState={makeState({ highestBid: { playerId: "A", amount: 150 }, currentBidderId: "B" })}
        myPlayerId="B"
        playerNames={playerNames}
        onBid={vi.fn()}
        onPass={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^bid 155$/i })).toBeInTheDocument();
  });

  it("calls onPass when the pass button is clicked", async () => {
    const onPass = vi.fn().mockResolvedValue(undefined);
    render(
      <TosBiddingPanel gameState={makeState()} myPlayerId="B" playerNames={playerNames} onBid={vi.fn()} onPass={onPass} />
    );
    await userEvent.click(screen.getByRole("button", { name: /pass/i }));
    expect(onPass).toHaveBeenCalled();
  });
});
