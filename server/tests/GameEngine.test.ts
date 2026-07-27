import { GameEngine } from "../src/game/GameEngine";
import { GamePhase } from "../src/game/types";
import { Suit } from "../src/game/Card";

const PLAYERS = ["A", "B", "C"];

function playRoundToCompletion(engine: GameEngine) {
  while (engine.getPhase() === GamePhase.Playing) {
    const playerId = engine.getCurrentTurnPlayerId();
    const [card] = engine.getLegalMoves(playerId);
    engine.playCard(playerId, card);
  }
}

/** Resolves any pending Settlement items automatically: carryForward when allowed, else card+reject. */
function resolveAnySettlement(engine: GameEngine) {
  while (engine.getPhase() === GamePhase.Settlement) {
    const item = engine.getCurrentSettlementItem();
    if (!item) break;
    const totalDebt = engine.getTotalDebt(item.debtor);
    if (totalDebt < 4) {
      engine.settleDebt(item.debtor, item.creditor, "carryForward");
    } else {
      engine.settleDebt(item.debtor, item.creditor, "card");
      while (engine.getPendingExchange()) {
        engine.respondToSettlement(engine.getPendingExchange()!.creditor, "reject");
      }
    }
  }
}

/** Drives a fresh engine to Playing, choosing trump along the way and clearing any Settlement. */
function startAndChooseTrump(engine: GameEngine, suit: Suit = Suit.Spades) {
  engine.startRound();
  const trumpPlayer = engine.getTrumpPlayerId()!;
  engine.chooseTrump(trumpPlayer, suit);
  resolveAnySettlement(engine);
  return trumpPlayer;
}

describe("GameEngine — setup", () => {
  it("requires exactly 3 players", () => {
    expect(() => new GameEngine(["A", "B"])).toThrow();
    expect(() => new GameEngine(["A", "B", "C", "D"])).toThrow();
    expect(() => new GameEngine(PLAYERS)).not.toThrow();
  });

  it("rejects duplicate player ids", () => {
    expect(() => new GameEngine(["A", "A", "B"])).toThrow();
  });
});

describe("GameEngine — round setup and rotation", () => {
  it("assigns round 1's trump player as seat 0, dealer as seat 1, left player as seat 2", () => {
    const engine = new GameEngine(PLAYERS);
    engine.startRound();
    expect(engine.getTrumpPlayerId()).toBe("A");
    expect(engine.getDealerId()).toBe("B");
    expect(engine.getLeftPlayerId()).toBe("C");
    expect(engine.getTargets()).toEqual({ A: 5, C: 3, B: 2 });
  });

  it("deals exactly 5 cards to each player before trump is chosen", () => {
    const engine = new GameEngine(PLAYERS);
    engine.startRound();
    PLAYERS.forEach((p) => expect(engine.getHand(p)).toHaveLength(5));
    expect(engine.getPhase()).toBe(GamePhase.TrumpSelection);
  });

  it("rotates trump player round over round: A -> B -> C -> A", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine);
    playRoundToCompletion(engine);
    expect(engine.getPhase()).toBe(GamePhase.RoundComplete);

    const trump2 = startAndChooseTrump(engine); // internally calls startRound() for round 2
    expect(trump2).toBe("B");
    expect(engine.getDealerId()).toBe("C");
    expect(engine.getLeftPlayerId()).toBe("A");
    playRoundToCompletion(engine);

    const trump3 = startAndChooseTrump(engine); // round 3
    expect(trump3).toBe("C");
    playRoundToCompletion(engine);

    const trump4 = startAndChooseTrump(engine); // round 4, wraps back to A
    expect(trump4).toBe("A");
  });
});

describe("GameEngine — trump selection", () => {
  it("only the Trump Player may choose trump", () => {
    const engine = new GameEngine(PLAYERS);
    engine.startRound();
    const trumpPlayer = engine.getTrumpPlayerId()!;
    const someoneElse = PLAYERS.find((p) => p !== trumpPlayer)!;
    expect(() => engine.chooseTrump(someoneElse, Suit.Hearts)).toThrow();
    expect(() => engine.chooseTrump(trumpPlayer, Suit.Hearts)).not.toThrow();
  });

  it("deals the remaining 5 cards (10 total, deck empty) once trump is chosen", () => {
    const engine = new GameEngine(PLAYERS);
    const trumpPlayer = startAndChooseTrump(engine);
    PLAYERS.forEach((p) => expect(engine.getHand(p)).toHaveLength(10));
    expect(engine.getTrumpSuit()).toBe(Suit.Spades);
    expect(trumpPlayer).toBe("A");
  });

  it("skips Settlement and goes straight to Playing when there are no pending debts", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine);
    expect(engine.getPhase()).toBe(GamePhase.Playing);
    expect(engine.getCurrentTurnPlayerId()).toBe("A"); // Trump Player leads first, spec section 13
  });
});

describe("GameEngine — playing tricks", () => {
  it("enforces turn order", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine);
    const notLeader = PLAYERS.find((p) => p !== "A")!;
    const [card] = engine.getLegalMoves(notLeader);
    expect(() => engine.playCard(notLeader, card)).toThrow();
  });

  it("enforces follow-suit legality", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine, Suit.Clubs);

    const leaderHand = engine.getHand("A");
    const ledCard = leaderHand[0];
    engine.playCard("A", ledCard);

    const nextPlayer = engine.getCurrentTurnPlayerId();
    const nextHand = engine.getHand(nextPlayer);
    const offSuitCard = nextHand.find((c) => c.suit !== ledCard.suit);
    const hasLedSuit = nextHand.some((c) => c.suit === ledCard.suit);

    if (hasLedSuit && offSuitCard) {
      expect(() => engine.playCard(nextPlayer, offSuitCard)).toThrow();
    } else if (offSuitCard) {
      expect(() => engine.playCard(nextPlayer, offSuitCard)).not.toThrow();
    }
  });

  it("plays a full round: 10 tricks, tricks sum to 10, round completes", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine);
    playRoundToCompletion(engine);

    expect(engine.getPhase()).toBe(GamePhase.RoundComplete);
    PLAYERS.forEach((p) => expect(engine.getHand(p)).toHaveLength(0));
    const totalTricks = Object.values(engine.getTricksWon()).reduce((a, b) => a + b, 0);
    expect(totalTricks).toBe(10);
  });
});

describe("GameEngine — round-end differences and the ledger", () => {
  it("computes differences and records a round summary", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine);
    playRoundToCompletion(engine);

    const history = engine.getRoundHistory();
    expect(history).toHaveLength(1);
    const summary = history[0];
    expect(summary.targets).toEqual({ A: 5, C: 3, B: 2 });

    const totalTricks = Object.values(summary.tricksWon).reduce((a, b) => a + b, 0);
    expect(totalTricks).toBe(10);
    const totalDiff = Object.values(summary.differences).reduce((a, b) => a + b, 0);
    expect(totalDiff).toBe(0); // spec section 20: differences always sum to zero
  });

  it("updates the ledger from the round's snatches", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine);
    playRoundToCompletion(engine);

    const summary = engine.getRoundHistory()[0];
    const ledger = engine.getLedgerSnapshot();
    // Whatever the snatches were, the ledger should reflect them exactly
    // (since this was round 1, there's nothing pre-existing to net against).
    summary.snatches.forEach((s) => {
      expect(ledger[s.debtor]?.[s.creditor]).toBe(s.amount);
    });
  });

  it("can proceed to round 2 after round 1 completes, rotating trump to B", () => {
    const engine = new GameEngine(PLAYERS);
    startAndChooseTrump(engine);
    playRoundToCompletion(engine);

    engine.startRound();
    expect(engine.getRoundNumber()).toBe(2);
    expect(engine.getTrumpPlayerId()).toBe("B");
    expect(engine.getTargets()).toEqual({ B: 5, A: 3, C: 2 });
  });
});

describe("GameEngine — settlement phase", () => {
  /** Forces a specific debt onto the engine's private ledger via the public API's side effects is hard to fake directly, so we drive two real rounds and inspect/act on whatever debt naturally results, which is the most realistic way to reach Settlement. */
  function playRoundsUntilDebtExists(engine: GameEngine, maxRounds = 5) {
    for (let i = 0; i < maxRounds; i++) {
      engine.startRound();
      const trumpPlayer = engine.getTrumpPlayerId()!;
      engine.chooseTrump(trumpPlayer, Suit.Spades);
      if (engine.getPhase() === (GamePhase.Settlement as any)) {
        return; // a debt from a previous round triggered Settlement
      }
      playRoundToCompletion(engine);
      const hasDebt = engine.getLedgerSnapshot();
      if (Object.keys(hasDebt).length > 0) {
        return; // debt now exists; next startRound()+chooseTrump() will enter Settlement
      }
    }
    throw new Error("No debt arose in time for this test — flaky test setup, not engine behavior.");
  }

  it("enters Settlement phase when pending debts exist after the second deal", () => {
    const engine = new GameEngine(PLAYERS);
    playRoundsUntilDebtExists(engine);

    // Whatever debt exists, starting the next round and choosing trump
    // should route into Settlement rather than straight to Playing.
    engine.startRound();
    const trumpPlayer = engine.getTrumpPlayerId()!;
    engine.chooseTrump(trumpPlayer, Suit.Hearts);
    expect(engine.getPhase()).toBe(GamePhase.Settlement);
    expect(engine.getCurrentSettlementItem()).not.toBeNull();
  });

  it("carryForward (when allowed) leaves the ledger unchanged; blocked once total debt hits 4", () => {
    const engine = new GameEngine(PLAYERS);
    playRoundsUntilDebtExists(engine);
    engine.startRound();
    const trumpPlayer = engine.getTrumpPlayerId()!;
    engine.chooseTrump(trumpPlayer, Suit.Hearts);

    const item = engine.getCurrentSettlementItem();
    expect(item).not.toBeNull();
    const totalDebt = engine.getTotalDebt(item!.debtor);
    const before = engine.getLedgerSnapshot();

    if (totalDebt < 4) {
      engine.settleDebt(item!.debtor, item!.creditor, "carryForward");
      const after = engine.getLedgerSnapshot();
      expect(after[item!.debtor]?.[item!.creditor]).toBe(before[item!.debtor]?.[item!.creditor]);
    } else {
      expect(() => engine.settleDebt(item!.debtor, item!.creditor, "carryForward")).toThrow();
    }
  });

  it("rebuilds the same carried-forward debt when the next round enters Settlement", () => {
    const engine = new GameEngine(PLAYERS);
    playRoundsUntilDebtExists(engine);
    engine.startRound();
    const trumpPlayer = engine.getTrumpPlayerId()!;
    engine.chooseTrump(trumpPlayer, Suit.Hearts);

    const item = engine.getCurrentSettlementItem();
    expect(item).not.toBeNull();
    const carriedDebt = item!.remaining;

    engine.settleDebt(item!.debtor, item!.creditor, "carryForward");
    while (engine.getPhase() === GamePhase.Settlement) {
      const nextItem = engine.getCurrentSettlementItem();
      if (!nextItem) break;
      engine.settleDebt(nextItem.debtor, nextItem.creditor, "carryForward");
    }

    while (engine.getPhase() === GamePhase.Playing) {
      playRoundToCompletion(engine);
    }

    engine.startRound();
    const nextTrump = engine.getTrumpPlayerId()!;
    engine.chooseTrump(nextTrump, Suit.Hearts);

    const nextItem = engine.getCurrentSettlementItem();
    expect(nextItem).not.toBeNull();
    expect(nextItem!.debtor).toBe(item!.debtor);
    expect(nextItem!.creditor).toBe(item!.creditor);
    expect(nextItem!.remaining).toBe(carriedDebt);
  });

  it("only the debtor of the CURRENT queue item may settle it", () => {
    const engine = new GameEngine(PLAYERS);
    playRoundsUntilDebtExists(engine);
    engine.startRound();
    const trumpPlayer = engine.getTrumpPlayerId()!;
    engine.chooseTrump(trumpPlayer, Suit.Hearts);

    const item = engine.getCurrentSettlementItem()!;
    const notDebtor = PLAYERS.find((p) => p !== item.debtor)!;
    expect(() => engine.settleDebt(notDebtor, item.creditor, "carryForward")).toThrow();
  });

  it("card settlement: randomly gives a card, and all-reject nets back to the original hand sizes", () => {
    const engine = new GameEngine(PLAYERS);
    playRoundsUntilDebtExists(engine);
    engine.startRound();
    const trumpPlayer = engine.getTrumpPlayerId()!;
    engine.chooseTrump(trumpPlayer, Suit.Hearts);

    const item = engine.getCurrentSettlementItem()!;
    const debtor = item.debtor;
    const creditor = item.creditor;
    const debtorHandSizeBefore = engine.getHand(debtor).length;
    const creditorHandSizeBefore = engine.getHand(creditor).length;

    engine.settleDebt(debtor, creditor, "card");

    // A relationship can cover more than one hand — each rejected exchange
    // immediately triggers the next one for the same relationship, so we
    // must drain the whole chain (rejecting every time) before hand sizes
    // are expected to net back to their starting point.
    let iterations = 0;
    while (engine.getPendingExchange() && iterations < 10) {
      const exchange = engine.getPendingExchange()!;
      expect(exchange.debtor).toBe(debtor);
      expect(exchange.creditor).toBe(creditor);
      engine.respondToSettlement(creditor, "reject");
      iterations++;
    }

    expect(engine.getHand(debtor)).toHaveLength(debtorHandSizeBefore);
    expect(engine.getHand(creditor)).toHaveLength(creditorHandSizeBefore);
  });

  it("card settlement: keep swaps a card and reduces the debt by 1", () => {
    const engine = new GameEngine(PLAYERS);
    playRoundsUntilDebtExists(engine);
    engine.startRound();
    const trumpPlayer = engine.getTrumpPlayerId()!;
    engine.chooseTrump(trumpPlayer, Suit.Hearts);

    const item = engine.getCurrentSettlementItem()!;
    const debtBefore = engine.getLedgerSnapshot()[item.debtor]?.[item.creditor] ?? 0;

    engine.settleDebt(item.debtor, item.creditor, "card");
    const exchange = engine.getPendingExchange()!;
    const creditorHand = engine.getHand(item.creditor);
    // Find a card the creditor can safely return (not their only one of that suit).
    const returnable = creditorHand.find(
      (c) => creditorHand.filter((x) => x.suit === c.suit).length >= 2
    );

    if (returnable) {
      engine.respondToSettlement(item.creditor, "keep", { suit: returnable.suit, rank: returnable.rank });
      const debtAfter = engine.getLedgerSnapshot()[item.debtor]?.[item.creditor] ?? 0;
      expect(debtAfter).toBe(debtBefore - 1);
    } else {
      // Extremely unlikely with a 10-11 card hand, but reject is always safe.
      engine.respondToSettlement(item.creditor, "reject");
    }
  });

  it("rejects carryForward once a player's total debt has reached 4, eventually forcing card settlement", () => {
    const engine = new GameEngine(PLAYERS);
    let sawEnforcement = false;

    for (let round = 0; round < 30 && !sawEnforcement; round++) {
      engine.startRound();
      const trumpPlayer = engine.getTrumpPlayerId()!;
      engine.chooseTrump(trumpPlayer, Suit.Spades);

      while (engine.getPhase() === GamePhase.Settlement) {
        const item = engine.getCurrentSettlementItem();
        if (!item) break;
        const totalDebt = engine.getTotalDebt(item.debtor);
        if (totalDebt >= 4) {
          expect(() => engine.settleDebt(item.debtor, item.creditor, "carryForward")).toThrow();
          engine.settleDebt(item.debtor, item.creditor, "card");
          while (engine.getPendingExchange()) {
            engine.respondToSettlement(engine.getPendingExchange()!.creditor, "reject");
          }
          sawEnforcement = true;
        } else {
          engine.settleDebt(item.debtor, item.creditor, "carryForward");
        }
      }
      if (engine.getPhase() === GamePhase.Playing) {
        playRoundToCompletion(engine);
      }
    }

    expect(sawEnforcement).toBe(true);
  });
});

describe("GameEngine — public state", () => {
  it("never exposes other players' hand contents, only counts", () => {
    const engine = new GameEngine(PLAYERS);
    engine.startRound();
    const state = engine.getPublicState("A") as any;
    expect(state.hand).toHaveLength(5);
    expect(state.handSizes).toEqual({ A: 5, B: 5, C: 5 });
    expect(JSON.stringify(state)).not.toContain('"B":[{');
  });
});
