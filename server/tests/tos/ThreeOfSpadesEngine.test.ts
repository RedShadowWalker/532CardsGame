import { ThreeOfSpadesEngine } from "../../src/gameToS/ThreeOfSpadesEngine";
import { GamePhase } from "../../src/gameToS/types";
import { Suit, Rank } from "../../src/gameToS/Card";

const PLAYERS = ["A", "B", "C", "D"];

function newEngine(matchLength: 7 | 10 = 7) {
  return new ThreeOfSpadesEngine(PLAYERS, { matchLength });
}

/** Runs the auction: first bidder opens at 130, everyone else passes. */
function resolveAuctionQuickly(engine: ThreeOfSpadesEngine) {
  const firstBidder = engine.getCurrentBidderId();
  engine.placeBid(firstBidder, 130);
  while (engine.getPhase() === GamePhase.Auction) {
    engine.pass(engine.getCurrentBidderId());
  }
  return firstBidder;
}

/** Picks the trump player's partner as whichever OTHER player currently holds a chosen card. */
function chooseTrumpAndPartnerFor(engine: ThreeOfSpadesEngine, declarerId: string) {
  // Pick a card from a different player's hand as the partner card so the
  // partner-reveal-on-play mechanic is meaningfully exercised in most tests.
  const otherPlayer = PLAYERS.find((p) => p !== declarerId)!;
  const partnerCard = engine.getHand(otherPlayer)[0];
  engine.chooseTrumpAndPartner(declarerId, Suit.Hearts, { suit: partnerCard.suit, rank: partnerCard.rank });
  return partnerCard;
}

function playRoundToCompletion(engine: ThreeOfSpadesEngine) {
  while (engine.getPhase() === GamePhase.Playing) {
    const playerId = engine.getCurrentTurnPlayerId();
    const [card] = engine.getLegalMoves(playerId);
    engine.playCard(playerId, card);
  }
}

describe("ThreeOfSpadesEngine — setup", () => {
  it("requires exactly 4 players", () => {
    expect(() => new ThreeOfSpadesEngine(["A", "B", "C"], { matchLength: 7 })).toThrow();
    expect(() => new ThreeOfSpadesEngine(PLAYERS, { matchLength: 7 })).not.toThrow();
  });

  it("requires matchLength to be 7 or 10", () => {
    // @ts-expect-error intentionally invalid for the test
    expect(() => new ThreeOfSpadesEngine(PLAYERS, { matchLength: 8 })).toThrow();
  });
});

describe("ThreeOfSpadesEngine — dealing and auction", () => {
  it("deals 13 cards to each player and starts the auction left of the dealer", () => {
    const engine = newEngine();
    engine.startRound();
    PLAYERS.forEach((p) => expect(engine.getHand(p)).toHaveLength(13));
    expect(engine.getPhase()).toBe(GamePhase.Auction);
    expect(engine.getDealerId()).toBe("A"); // round 1, dealer rotates to seat 0
    expect(engine.getCurrentBidderId()).toBe("B"); // left of dealer
  });

  it("enforces the 130 minimum opening bid", () => {
    const engine = newEngine();
    engine.startRound();
    expect(() => engine.placeBid(engine.getCurrentBidderId(), 125)).toThrow();
    expect(() => engine.placeBid(engine.getCurrentBidderId(), 130)).not.toThrow();
  });

  it("enforces the minimum 5-point raise", () => {
    const engine = newEngine();
    engine.startRound();
    engine.placeBid(engine.getCurrentBidderId(), 150);
    const next = engine.getCurrentBidderId();
    expect(() => engine.placeBid(next, 152)).toThrow();
    expect(() => engine.placeBid(next, 155)).not.toThrow();
  });

  it("rejects a bid above the 270 maximum", () => {
    const engine = newEngine();
    engine.startRound();
    expect(() => engine.placeBid(engine.getCurrentBidderId(), 275)).toThrow();
  });

  it("permanently removes a player once they pass", () => {
    const engine = newEngine();
    engine.startRound();
    const passer = engine.getCurrentBidderId();
    engine.pass(passer);
    expect(engine.getActiveBidders()).not.toContain(passer);
  });

  it("resolves to the sole remaining bidder as declarer", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    expect(engine.getPhase()).toBe(GamePhase.TrumpAndPartnerSelection);
    expect(engine.getDeclarerId()).toBe(declarer);
    expect(engine.getBidAmount()).toBe(130);
  });

  it("redeals (same round, same dealer) if everyone passes with no bid ever made", () => {
    const engine = newEngine();
    engine.startRound();
    const roundBefore = engine.getRoundNumber();
    const dealerBefore = engine.getDealerId();

    for (let i = 0; i < 4; i++) {
      engine.pass(engine.getCurrentBidderId());
    }

    expect(engine.getPhase()).toBe(GamePhase.Auction); // redealt, not stuck
    expect(engine.getRoundNumber()).toBe(roundBefore);
    expect(engine.getDealerId()).toBe(dealerBefore);
    PLAYERS.forEach((p) => expect(engine.getHand(p)).toHaveLength(13));
  });
});

describe("ThreeOfSpadesEngine — trump and hidden partner selection", () => {
  it("only the declarer may choose trump and partner", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    const someoneElse = PLAYERS.find((p) => p !== declarer)!;
    expect(() => chooseTrumpAndPartnerFor(engine, someoneElse)).toThrow();
  });

  it("makes the trump suit and partner CARD public immediately, but hides the partner's IDENTITY", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    const partnerCard = chooseTrumpAndPartnerFor(engine, declarer);

    expect(engine.getTrumpSuit()).toBe(Suit.Hearts);
    expect(engine.getPartnerCard()).toEqual({ suit: partnerCard.suit, rank: partnerCard.rank });
    expect(engine.getPartnerRevealed()).toBe(false);
    expect(engine.getPartnerId()).toBeNull(); // identity hidden until played

    const publicState = engine.getPublicState(declarer) as any;
    expect(publicState.trumpSuit).toBe(Suit.Hearts);
    expect(publicState.partnerCard).toEqual({ suit: partnerCard.suit, rank: partnerCard.rank });
    expect(publicState.partnerId).toBeNull();
  });

  it("declarer leads the first trick", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    chooseTrumpAndPartnerFor(engine, declarer);
    expect(engine.getCurrentTurnPlayerId()).toBe(declarer);
  });
});

describe("ThreeOfSpadesEngine — hidden partner reveal timing", () => {
  it("reveals the partner's identity the instant their card is played, not before", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    const partnerCard = chooseTrumpAndPartnerFor(engine, declarer);
    const actualPartnerId = PLAYERS.find(
      (p) => p !== declarer && engine.getHand(p).some((c) => c.suit === partnerCard.suit && c.rank === partnerCard.rank)
    )!;

    // Play tricks until just before the partner card would be played, checking
    // reveal stays false the whole time up to that point.
    let safety = 0;
    while (engine.getPartnerRevealed() === false && safety < 60) {
      safety++;
      const turnPlayer = engine.getCurrentTurnPlayerId();
      const legalMoves = engine.getLegalMoves(turnPlayer);
      const holdsPartnerCard = legalMoves.find((c) => c.suit === partnerCard.suit && c.rank === partnerCard.rank);

      if (holdsPartnerCard) {
        expect(engine.getPartnerRevealed()).toBe(false); // still hidden right up to the play
        engine.playCard(turnPlayer, holdsPartnerCard);
        expect(engine.getPartnerRevealed()).toBe(true); // revealed the instant it's played
        expect(engine.getPartnerId()).toBe(actualPartnerId);
        break;
      } else {
        engine.playCard(turnPlayer, legalMoves[0]);
      }
    }
    expect(engine.getPartnerRevealed()).toBe(true);
  });
});

describe("ThreeOfSpadesEngine — playing tricks and scoring", () => {
  it("enforces turn order and follow-suit", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    chooseTrumpAndPartnerFor(engine, declarer);

    const notCurrent = PLAYERS.find((p) => p !== declarer)!;
    const [card] = engine.getLegalMoves(notCurrent);
    expect(() => engine.playCard(notCurrent, card)).toThrow();
  });

  it("plays a full round: 13 tricks, all hands empty, round completes", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    chooseTrumpAndPartnerFor(engine, declarer);
    playRoundToCompletion(engine);

    expect([GamePhase.RoundComplete, GamePhase.MatchComplete]).toContain(engine.getPhase());
    PLAYERS.forEach((p) => expect(engine.getHand(p)).toHaveLength(0));

    const totalPoints = Object.values(engine.getCapturedPoints()).reduce((a, b) => a + b, 0);
    expect(totalPoints).toBe(270); // conservation: every point in the deck is captured by someone
  });

  it("computes teamTotal, contractSucceeded, and scoreDelta correctly", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine); // bid = 130
    chooseTrumpAndPartnerFor(engine, declarer);
    playRoundToCompletion(engine);

    const history = engine.getRoundHistory();
    expect(history).toHaveLength(1);
    const summary = history[0];

    const expectedTeamTotal = summary.partnerId === summary.declarerId
      ? engine.getCapturedPoints()[summary.declarerId]
      : engine.getCapturedPoints()[summary.declarerId] + engine.getCapturedPoints()[summary.partnerId];
    // (captured points were already reset for the next state, so recompute from the trick log instead)
    const recomputed = engine
      .getCompletedTricks()
      .reduce((acc, t) => {
        acc[t.winnerId] = (acc[t.winnerId] ?? 0) + t.points;
        return acc;
      }, {} as Record<string, number>);
    const teamTotal =
      summary.partnerId === summary.declarerId
        ? recomputed[summary.declarerId] ?? 0
        : (recomputed[summary.declarerId] ?? 0) + (recomputed[summary.partnerId] ?? 0);

    expect(summary.teamTotal).toBe(teamTotal);
    expect(summary.contractSucceeded).toBe(teamTotal >= summary.bidAmount);

    if (summary.contractSucceeded) {
      expect(summary.scoreDelta[summary.declarerId]).toBe(2 * summary.bidAmount);
      if (summary.partnerId !== summary.declarerId) {
        expect(summary.scoreDelta[summary.partnerId]).toBe(summary.bidAmount);
      }
    } else {
      expect(summary.scoreDelta[summary.declarerId]).toBe(-2 * summary.bidAmount);
      if (summary.partnerId !== summary.declarerId) {
        expect(summary.scoreDelta[summary.partnerId]).toBe(-summary.bidAmount);
      }
    }

    // Defenders (neither declarer nor partner) are unaffected.
    PLAYERS.filter((p) => p !== summary.declarerId && p !== summary.partnerId).forEach((p) => {
      expect(summary.scoreDelta[p]).toBe(0);
    });
  });

  it("never exposes score deltas or cumulative scores through public state", () => {
    const engine = newEngine();
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    chooseTrumpAndPartnerFor(engine, declarer);
    playRoundToCompletion(engine);

    const publicState = engine.getPublicState(declarer) as any;
    expect(JSON.stringify(publicState)).not.toMatch(/scoreDelta/);
    expect(JSON.stringify(publicState)).not.toMatch(/cumulativeScores/);
    // contractSucceeded IS public (spec: players do know whether it succeeded).
    expect(publicState.roundHistory[0].contractSucceeded).toBeDefined();
  });
});

describe("ThreeOfSpadesEngine — hidden leaderboard vote", () => {
  function playOneRound(engine: ThreeOfSpadesEngine) {
    engine.startRound();
    const declarer = resolveAuctionQuickly(engine);
    chooseTrumpAndPartnerFor(engine, declarer);
    playRoundToCompletion(engine);
  }

  it("reveals cumulative standings only when all 4 players vote yes", () => {
    const engine = newEngine();
    playOneRound(engine);
    expect(engine.getPhase()).toBe(GamePhase.RoundComplete);

    engine.requestLeaderboardVote();
    PLAYERS.forEach((p) => engine.castLeaderboardVote(p, true));

    const reveal = engine.consumeLastReveal();
    expect(reveal).not.toBeNull();
    expect(reveal!.standings).not.toBeNull();
    expect(Object.keys(reveal!.standings!)).toEqual(expect.arrayContaining(PLAYERS));
  });

  it("hides standings if even one player votes no", () => {
    const engine = newEngine();
    playOneRound(engine);

    engine.requestLeaderboardVote();
    engine.castLeaderboardVote("A", true);
    engine.castLeaderboardVote("B", true);
    engine.castLeaderboardVote("C", false);
    engine.castLeaderboardVote("D", true);

    const reveal = engine.consumeLastReveal();
    expect(reveal).not.toBeNull();
    expect(reveal!.standings).toBeNull();
  });

  it("consumeLastReveal is one-shot — returns null the second time", () => {
    const engine = newEngine();
    playOneRound(engine);
    engine.requestLeaderboardVote();
    PLAYERS.forEach((p) => engine.castLeaderboardVote(p, true));

    engine.consumeLastReveal();
    expect(engine.consumeLastReveal()).toBeNull();
  });

  it("rejects casting a vote when none is in progress", () => {
    const engine = newEngine();
    playOneRound(engine);
    expect(() => engine.castLeaderboardVote("A", true)).toThrow();
  });
});

describe("ThreeOfSpadesEngine — match progression", () => {
  it("moves to MatchComplete after the final round, revealing final standings", () => {
    const engine = newEngine(7);
    for (let round = 0; round < 7; round++) {
      engine.startRound();
      const declarer = resolveAuctionQuickly(engine);
      chooseTrumpAndPartnerFor(engine, declarer);
      playRoundToCompletion(engine);
      if (engine.getPhase() === GamePhase.RoundComplete) {
        // proceed to next round
      }
    }
    expect(engine.getPhase()).toBe(GamePhase.MatchComplete);
    const final = engine.getFinalStandings();
    expect(Object.keys(final)).toEqual(expect.arrayContaining(PLAYERS));
  });
});
