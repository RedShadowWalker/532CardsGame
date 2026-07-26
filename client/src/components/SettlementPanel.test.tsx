import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettlementPanel } from "./SettlementPanel";
import type { GameStateDTO } from "../shared/socketEvents";

function makeGameState(overrides: Partial<GameStateDTO> = {}): GameStateDTO {
  return {
    phase: "SETTLEMENT",
    round: 2,
    players: ["A", "B", "C"],
    trumpPlayerId: "B",
    leftPlayerId: "A",
    dealerId: "C",
    targets: { B: 5, A: 3, C: 2 },
    trumpSuit: "Hearts",
    handSizes: { A: 10, B: 10, C: 10 },
    hand: [],
    currentTrick: [],
    tricksWon: { A: 0, B: 0, C: 0 },
    ledger: { A: { B: 1 } },
    roundHistory: [],
    settlementQueue: [{ debtor: "A", creditor: "B", remaining: 1, method: null }],
    settlementIndex: 0,
    pendingExchange: null,
    ...overrides,
  };
}

const playerNames = { A: "Alice", B: "Bob", C: "Carol" };
const noop = {
  onSettleDebt: vi.fn().mockResolvedValue(undefined),
  onRespondToSettlement: vi.fn().mockResolvedValue(undefined),
};

describe("SettlementPanel — debtor choosing a method", () => {
  it("shows Card Settlement / Carry Forward buttons to the debtor", () => {
    render(<SettlementPanel gameState={makeGameState()} myPlayerId="A" playerNames={playerNames} {...noop} />);
    expect(screen.getByRole("button", { name: /card settlement/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /carry forward/i })).toBeInTheDocument();
  });

  it("shows a waiting message to everyone else", () => {
    render(<SettlementPanel gameState={makeGameState()} myPlayerId="C" playerNames={playerNames} {...noop} />);
    expect(screen.queryByRole("button", { name: /card settlement/i })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for them to decide/i)).toBeInTheDocument();
  });

  it("calls onSettleDebt with the creditor id and chosen method", async () => {
    const onSettleDebt = vi.fn().mockResolvedValue(undefined);
    render(
      <SettlementPanel
        gameState={makeGameState()}
        myPlayerId="A"
        playerNames={playerNames}
        {...noop}
        onSettleDebt={onSettleDebt}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /card settlement/i }));
    expect(onSettleDebt).toHaveBeenCalledWith("B", "card");
  });

  it("surfaces an error if carryForward is rejected (e.g. max-debt rule)", async () => {
    const onSettleDebt = vi.fn().mockRejectedValue(new Error("Total debt has reached the maximum of 4 hands."));
    render(
      <SettlementPanel
        gameState={makeGameState()}
        myPlayerId="A"
        playerNames={playerNames}
        {...noop}
        onSettleDebt={onSettleDebt}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /carry forward/i }));
    expect(await screen.findByText(/maximum of 4 hands/i)).toBeInTheDocument();
  });
});

describe("SettlementPanel — creditor responding to an exchange", () => {
  const exchangeState = makeGameState({
    hand: [
      { suit: "Hearts", rank: "K", value: 6 }, // received card
      { suit: "Hearts", rank: "Q", value: 5 }, // only other Hearts -> safe to return
      { suit: "Spades", rank: "7", value: 0 }, // creditor's ONLY spade -> unsafe to return
    ],
    pendingExchange: { debtor: "A", creditor: "B", card: { suit: "Hearts", rank: "K", value: 6 } },
  });

  it("shows the received card and keep/reject controls to the creditor", () => {
    render(<SettlementPanel gameState={exchangeState} myPlayerId="B" playerNames={playerNames} {...noop} />);
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep & return selected/i })).toBeInTheDocument();
  });

  it("excludes the received card and any suit-void card from the returnable candidates", () => {
    render(<SettlementPanel gameState={exchangeState} myPlayerId="B" playerNames={playerNames} {...noop} />);
    // Only the Queen of Hearts should be selectable (King is the received
    // card; the lone Spade would void the creditor in that suit).
    const cardButtons = screen
      .getAllByRole("button")
      .filter((b) => (b.textContent ?? "").length <= 3 && !(b as HTMLButtonElement).disabled);
    expect(cardButtons).toHaveLength(1);
    expect(cardButtons[0]).toHaveTextContent("Q");
  });

  it("shows a waiting message to a non-creditor while an exchange is pending", () => {
    render(<SettlementPanel gameState={exchangeState} myPlayerId="C" playerNames={playerNames} {...noop} />);
    expect(screen.getByText(/waiting for bob to respond/i)).toBeInTheDocument();
  });

  it("calls onRespondToSettlement('reject') with no card when rejecting", async () => {
    const onRespondToSettlement = vi.fn().mockResolvedValue(undefined);
    render(
      <SettlementPanel
        gameState={exchangeState}
        myPlayerId="B"
        playerNames={playerNames}
        {...noop}
        onRespondToSettlement={onRespondToSettlement}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onRespondToSettlement).toHaveBeenCalledWith("reject");
  });

  it("calls onRespondToSettlement('keep', card) once a return card is selected", async () => {
    const onRespondToSettlement = vi.fn().mockResolvedValue(undefined);
    render(
      <SettlementPanel
        gameState={exchangeState}
        myPlayerId="B"
        playerNames={playerNames}
        {...noop}
        onRespondToSettlement={onRespondToSettlement}
      />
    );

    const queenButton = screen.getAllByRole("button").find((b) => b.textContent?.includes("Q"))!;
    await userEvent.click(queenButton);
    await userEvent.click(screen.getByRole("button", { name: /keep & return selected/i }));

    expect(onRespondToSettlement).toHaveBeenCalledWith("keep", { suit: "Hearts", rank: "Q", value: 5 });
  });
});
