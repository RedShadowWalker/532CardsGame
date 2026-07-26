/**
 * ThreeOfSpadesEngine.ts
 * UI-independent orchestrator for Three of Spades: 4 players, standard
 * 52-card deck, auction bidding, a hidden partner chosen by the auction
 * winner, point-capture trick play, and a hidden cumulative score revealed
 * only by unanimous vote (or unconditionally at the end of the match).
 *
 * Two things the spec describes narratively but doesn't fully pin down as
 * an algorithm — documented here rather than silently guessed:
 * 1. Follow-suit / trick-winner rules aren't restated in the spec at all,
 *    but they're the only rules under which "trump suit" and "trick" mean
 *    anything: mandatory follow-suit, highest trump (if any played) else
 *    highest of the led suit wins. See Rules.ts.
 * 2. If every player passes without anyone ever bidding, the spec doesn't
 *    say what happens (unlike similar games that define a redeal). This
 *    engine redeals the same round (same dealer, same round number) rather
 *    than leaving the game stuck.
 * 3. If the declarer's own hand happens to contain their chosen partner
 *    card, they end up partnered with themselves (a "solo" round) — the
 *    spec doesn't forbid this. Scoring in that case pays out the 2x/-2x
 *    declarer amount once, not double-counted as both declarer and partner.
 *
 * What IS explicit and implemented exactly as specified: the trump suit
 * and the chosen partner CARD are public immediately (players can watch
 * for it) — what's hidden is WHO holds that card, until it's played.
 * Likewise, whether a round's contract succeeded is public immediately;
 * only cumulative scores/standings are hidden, revealed exclusively by
 * unanimous vote or at the end of the match.
 */

import { Card, Suit, Rank } from "./Card";
import { Deck } from "./Deck";
import { isLegalMove, legalMoves, determineTrickWinner } from "./Rules";
import {
  BidRecord,
  GameEngineOptions,
  GamePhase,
  PlayedCard,
  PlayerId,
  RoundSummary,
  TrickRecord,
} from "./types";

export { GamePhase } from "./types";
export type { RoundSummary, TrickRecord, PlayedCard, BidRecord } from "./types";

const MIN_OPENING_BID = 130;
const MAX_BID = 270;
const MIN_RAISE = 5;

export interface PartnerCardChoice {
  suit: Suit;
  rank: Rank;
}

export class ThreeOfSpadesEngine {
  readonly players: PlayerId[]; // exactly 4, fixed seat order (join order)
  private readonly matchLength: 7 | 10;

  private deck: Deck;
  private hands: Record<PlayerId, Card[]>;

  private phase: GamePhase;
  private roundNumber: number;
  private dealerIndex: number;
  private roundHistory: RoundSummary[];
  private cumulativeScores: Record<PlayerId, number>;

  // Auction state
  private highestBid: BidRecord | null;
  private activeBidders: Set<PlayerId>;
  private everBid: boolean;
  private biddingTurnOrder: PlayerId[];
  private biddingTurnIndex: number;

  // Trump / partner state
  private declarerId: PlayerId | null;
  private bidAmount: number | null;
  private trumpSuit: Suit | null;
  private partnerCard: PartnerCardChoice | null;
  private partnerId: PlayerId | null;
  private partnerRevealed: boolean;

  // Trick play state
  private turnIndex: number;
  private currentTrick: PlayedCard[];
  private completedTricks: TrickRecord[];
  private capturedPoints: Record<PlayerId, number>;

  // Hidden-leaderboard vote state
  private pendingVote: Record<PlayerId, boolean> | null;
  private lastReveal: { standings: Record<PlayerId, number> | null } | null;

  constructor(players: PlayerId[], options: GameEngineOptions) {
    if (players.length !== 4) {
      throw new Error("Three of Spades requires exactly 4 players.");
    }
    if (new Set(players).size !== 4) {
      throw new Error("Player ids must be unique.");
    }
    if (options.matchLength !== 7 && options.matchLength !== 10) {
      throw new Error("matchLength must be 7 or 10.");
    }

    this.players = [...players];
    this.matchLength = options.matchLength;

    this.deck = new Deck();
    this.hands = {};
    this.players.forEach((p) => (this.hands[p] = []));

    this.phase = GamePhase.WaitingToStart;
    this.roundNumber = 0;
    this.dealerIndex = -1;
    this.roundHistory = [];
    this.cumulativeScores = {};
    this.players.forEach((p) => (this.cumulativeScores[p] = 0));

    this.highestBid = null;
    this.activeBidders = new Set();
    this.everBid = false;
    this.biddingTurnOrder = [];
    this.biddingTurnIndex = 0;

    this.declarerId = null;
    this.bidAmount = null;
    this.trumpSuit = null;
    this.partnerCard = null;
    this.partnerId = null;
    this.partnerRevealed = false;

    this.turnIndex = 0;
    this.currentTrick = [];
    this.completedTricks = [];
    this.capturedPoints = {};
    this.players.forEach((p) => (this.capturedPoints[p] = 0));

    this.pendingVote = null;
    this.lastReveal = null;
  }

  // ==========================================================================
  // Round lifecycle
  // ==========================================================================

  startRound(): void {
    if (this.phase !== GamePhase.WaitingToStart && this.phase !== GamePhase.RoundComplete) {
      throw new Error(`Cannot start a new round from phase ${this.phase}.`);
    }
    this.roundNumber += 1;
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length; // rotates clockwise every round
    this.resetRoundScopedState();
    this.dealAndStartAuction();
  }

  private resetRoundScopedState(): void {
    this.currentTrick = [];
    this.completedTricks = [];
    this.players.forEach((p) => (this.capturedPoints[p] = 0));
    this.declarerId = null;
    this.bidAmount = null;
    this.trumpSuit = null;
    this.partnerCard = null;
    this.partnerId = null;
    this.partnerRevealed = false;
  }

  private dealAndStartAuction(): void {
    this.deck.reset().shuffle();
    this.players.forEach((p) => (this.hands[p] = []));
    const dealt = this.deck.deal(4, 13); // spec: 13 cards each, starting left of dealer; deck exhausted
    this.players.forEach((p, i) => (this.hands[p] = dealt[i]));

    this.activeBidders = new Set(this.players);
    this.highestBid = null;
    this.everBid = false;
    const startIdx = (this.dealerIndex + 1) % this.players.length; // auction starts left of dealer
    this.biddingTurnOrder = [...this.players.slice(startIdx), ...this.players.slice(0, startIdx)];
    this.biddingTurnIndex = 0;

    this.phase = GamePhase.Auction;
  }

  // ==========================================================================
  // Auction
  // ==========================================================================

  getCurrentBidderId(): PlayerId {
    this.assertPhase(GamePhase.Auction);
    return this.biddingTurnOrder[this.biddingTurnIndex];
  }

  placeBid(playerId: PlayerId, amount: number): void {
    this.assertPhase(GamePhase.Auction);
    if (this.getCurrentBidderId() !== playerId) {
      throw new Error(`It is not ${playerId}'s turn to bid.`);
    }
    if (!Number.isInteger(amount)) {
      throw new Error("Bid amount must be an integer.");
    }
    const floor = this.highestBid ? this.highestBid.amount + MIN_RAISE : MIN_OPENING_BID;
    if (amount < floor) {
      throw new Error(`Bid must be at least ${floor}.`);
    }
    if (amount > MAX_BID) {
      throw new Error(`Bid cannot exceed the maximum of ${MAX_BID}.`);
    }
    this.highestBid = { playerId, amount };
    this.everBid = true;
    this.advanceBiddingTurn();
  }

  pass(playerId: PlayerId): void {
    this.assertPhase(GamePhase.Auction);
    if (this.getCurrentBidderId() !== playerId) {
      throw new Error(`It is not ${playerId}'s turn to act.`);
    }
    this.activeBidders.delete(playerId);

    if (this.activeBidders.size === 0) {
      // Nobody ever bid — redeal the same round rather than get stuck.
      this.dealAndStartAuction();
      return;
    }
    if (this.activeBidders.size === 1 && this.everBid) {
      const winner = [...this.activeBidders][0];
      this.declarerId = winner;
      this.bidAmount = this.highestBid!.amount;
      this.phase = GamePhase.TrumpAndPartnerSelection;
      return;
    }
    this.advanceBiddingTurn();
  }

  private advanceBiddingTurn(): void {
    do {
      this.biddingTurnIndex = (this.biddingTurnIndex + 1) % this.biddingTurnOrder.length;
    } while (!this.activeBidders.has(this.biddingTurnOrder[this.biddingTurnIndex]));
  }

  // ==========================================================================
  // Trump + hidden partner selection
  // ==========================================================================

  chooseTrumpAndPartner(playerId: PlayerId, suit: Suit, partnerCard: PartnerCardChoice): void {
    this.assertPhase(GamePhase.TrumpAndPartnerSelection);
    if (playerId !== this.declarerId) {
      throw new Error(`Only the declarer (${this.declarerId}) may choose trump and partner.`);
    }
    this.trumpSuit = suit;
    this.partnerCard = partnerCard;
    this.partnerId =
      this.players.find((p) => this.hands[p].some((c) => c.suit === partnerCard.suit && c.rank === partnerCard.rank)) ??
      null;
    if (!this.partnerId) {
      // Cannot happen with a full 52-card deal across 4 hands, but guard anyway.
      throw new Error("That card isn't in anyone's hand — this shouldn't be possible.");
    }
    this.partnerRevealed = false;

    this.phase = GamePhase.Playing;
    this.turnIndex = this.players.indexOf(this.declarerId); // declarer leads first trick
    this.currentTrick = [];
  }

  // ==========================================================================
  // Playing tricks
  // ==========================================================================

  getCurrentTurnPlayerId(): PlayerId {
    this.assertPhase(GamePhase.Playing);
    return this.players[this.turnIndex];
  }

  getLegalMoves(playerId: PlayerId): Card[] {
    this.assertPhase(GamePhase.Playing);
    const leadSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    return legalMoves(this.hands[playerId], leadSuit);
  }

  playCard(playerId: PlayerId, card: Card): TrickRecord | null {
    this.assertPhase(GamePhase.Playing);
    if (this.getCurrentTurnPlayerId() !== playerId) {
      throw new Error(`It is not ${playerId}'s turn to play.`);
    }
    const hand = this.hands[playerId];
    const handCard = hand.find((c) => c.equals(card));
    if (!handCard) {
      throw new Error(`${playerId} does not hold ${card.toString()}.`);
    }
    const leadSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    if (!isLegalMove(hand, handCard, leadSuit)) {
      throw new Error(
        `${card.toString()} is not a legal move for ${playerId}` +
          (leadSuit ? ` (must follow ${leadSuit} if possible).` : ".")
      );
    }

    hand.splice(hand.indexOf(handCard), 1);
    this.currentTrick.push({ playerId, card: handCard });

    // The partner is revealed the instant their card is played — spec
    // section "Hidden Partner": "revealed only when the chosen partner
    // card is played during the game."
    if (this.partnerCard && handCard.suit === this.partnerCard.suit && handCard.rank === this.partnerCard.rank) {
      this.partnerRevealed = true;
    }

    this.turnIndex = (this.turnIndex + 1) % this.players.length;

    if (this.currentTrick.length < this.players.length) {
      return null;
    }
    return this.resolveTrick();
  }

  private resolveTrick(): TrickRecord {
    const leadSuit = this.currentTrick[0].card.suit;
    const winnerId = determineTrickWinner(this.currentTrick, leadSuit, this.trumpSuit);
    const points = this.currentTrick.reduce((sum, pc) => sum + pc.card.points, 0);

    this.capturedPoints[winnerId] = (this.capturedPoints[winnerId] ?? 0) + points;
    const record: TrickRecord = { cards: [...this.currentTrick], leadSuit, winnerId, points };
    this.completedTricks.push(record);
    this.currentTrick = [];
    this.turnIndex = this.players.indexOf(winnerId);

    const roundOver = this.players.every((p) => this.hands[p].length === 0);
    if (roundOver) {
      this.completeRound();
    }
    return record;
  }

  private completeRound(): void {
    const declarerId = this.declarerId!;
    const partnerId = this.partnerId!;
    const isSolo = partnerId === declarerId;

    const teamTotal = isSolo
      ? this.capturedPoints[declarerId] ?? 0
      : (this.capturedPoints[declarerId] ?? 0) + (this.capturedPoints[partnerId] ?? 0);
    const contractSucceeded = teamTotal >= this.bidAmount!;

    const scoreDelta: Record<PlayerId, number> = {};
    this.players.forEach((p) => (scoreDelta[p] = 0));
    const declarerDelta = contractSucceeded ? 2 * this.bidAmount! : -2 * this.bidAmount!;
    scoreDelta[declarerId] = declarerDelta;
    if (!isSolo) {
      scoreDelta[partnerId] = contractSucceeded ? this.bidAmount! : -this.bidAmount!;
    }
    this.players.forEach((p) => {
      this.cumulativeScores[p] += scoreDelta[p];
    });

    this.roundHistory.push({
      round: this.roundNumber,
      dealerId: this.players[this.dealerIndex],
      declarerId,
      partnerId,
      bidAmount: this.bidAmount!,
      trumpSuit: this.trumpSuit!,
      partnerCard: this.partnerCard!,
      teamTotal,
      contractSucceeded,
      scoreDelta,
    });

    this.phase = this.roundNumber >= this.matchLength ? GamePhase.MatchComplete : GamePhase.RoundComplete;
  }

  // ==========================================================================
  // Hidden leaderboard: unanimous-vote reveal
  // ==========================================================================

  requestLeaderboardVote(): void {
    this.assertPhase(GamePhase.RoundComplete);
    this.pendingVote = {};
  }

  getPendingVoteStatus(): Record<PlayerId, boolean> | null {
    if (!this.pendingVote) return null;
    const status: Record<PlayerId, boolean> = {};
    this.players.forEach((p) => (status[p] = p in this.pendingVote!));
    return status;
  }

  castLeaderboardVote(playerId: PlayerId, vote: boolean): void {
    if (!this.pendingVote) {
      throw new Error("No leaderboard vote is currently in progress.");
    }
    this.pendingVote[playerId] = vote;

    const allVoted = this.players.every((p) => p in this.pendingVote!);
    if (!allVoted) return;

    const allYes = this.players.every((p) => this.pendingVote![p] === true);
    this.lastReveal = { standings: allYes ? { ...this.cumulativeScores } : null };
    this.pendingVote = null;
  }

  /** Returns and clears the most recent vote outcome, for one-shot broadcast. */
  consumeLastReveal(): { standings: Record<PlayerId, number> | null } | null {
    const reveal = this.lastReveal;
    this.lastReveal = null;
    return reveal;
  }

  // ==========================================================================
  // Next round / match progression
  // ==========================================================================

  /** Final, unconditional reveal — spec: match end always shows cumulative scores. */
  getFinalStandings(): Record<PlayerId, number> {
    this.assertPhase(GamePhase.MatchComplete);
    return { ...this.cumulativeScores };
  }

  // ==========================================================================
  // Queries / snapshots
  // ==========================================================================

  getPhase(): GamePhase {
    return this.phase;
  }
  getRoundNumber(): number {
    return this.roundNumber;
  }
  getMatchLength(): number {
    return this.matchLength;
  }
  getDealerId(): PlayerId {
    return this.players[this.dealerIndex];
  }
  getDeclarerId(): PlayerId | null {
    return this.declarerId;
  }
  getBidAmount(): number | null {
    return this.bidAmount;
  }
  getTrumpSuit(): Suit | null {
    return this.trumpSuit;
  }
  getPartnerCard(): PartnerCardChoice | null {
    return this.partnerCard;
  }
  /** Only returns a value once the partner has actually been revealed (their card was played). */
  getPartnerId(): PlayerId | null {
    return this.partnerRevealed ? this.partnerId : null;
  }
  getPartnerRevealed(): boolean {
    return this.partnerRevealed;
  }
  getHand(playerId: PlayerId): Card[] {
    return [...(this.hands[playerId] ?? [])];
  }
  getCurrentTrick(): PlayedCard[] {
    return [...this.currentTrick];
  }
  getCompletedTricks(): TrickRecord[] {
    return [...this.completedTricks];
  }
  getCapturedPoints(): Record<PlayerId, number> {
    return { ...this.capturedPoints };
  }
  getHighestBid(): BidRecord | null {
    return this.highestBid ? { ...this.highestBid } : null;
  }
  getActiveBidders(): PlayerId[] {
    return [...this.activeBidders];
  }

  /**
   * Full round history including score deltas. For engine-internal use and
   * tests only — the socket layer must use getSanitizedRoundHistory() or
   * getPublicState() when talking to clients, never this.
   */
  getRoundHistory(): RoundSummary[] {
    return [...this.roundHistory];
  }

  /** Round history with score deltas stripped — safe to send to clients outside a reveal. */
  getSanitizedRoundHistory() {
    return this.roundHistory.map((r) => ({
      round: r.round,
      dealerId: r.dealerId,
      declarerId: r.declarerId,
      partnerId: r.partnerId,
      bidAmount: r.bidAmount,
      trumpSuit: r.trumpSuit,
      partnerCard: r.partnerCard,
      teamTotal: r.teamTotal,
      contractSucceeded: r.contractSucceeded,
    }));
  }

  getPublicState(forPlayerId?: PlayerId) {
    const base = {
      phase: this.phase,
      round: this.roundNumber,
      matchLength: this.matchLength,
      players: [...this.players],
      dealerId: this.getDealerId(),
      handSizes: Object.fromEntries(this.players.map((p) => [p, this.hands[p].length])),
      hand: forPlayerId ? this.hands[forPlayerId].map((c) => c.toJSON()) : undefined,
      declarerId: this.declarerId,
      bidAmount: this.bidAmount,
      trumpSuit: this.trumpSuit,
      partnerCard: this.partnerCard,
      partnerId: this.getPartnerId(), // null unless revealed
      partnerRevealed: this.partnerRevealed,
      currentTrick: this.currentTrick.map((pc) => ({ playerId: pc.playerId, card: pc.card.toJSON() })),
      capturedPoints: { ...this.capturedPoints },
      roundHistory: this.getSanitizedRoundHistory(),
      pendingVoteStatus: this.getPendingVoteStatus(),
    };

    if (this.phase === GamePhase.Auction) {
      return {
        ...base,
        highestBid: this.highestBid,
        activeBidders: [...this.activeBidders],
        currentBidderId: this.getCurrentBidderId(),
      };
    }
    if (this.phase === GamePhase.Playing) {
      return { ...base, currentTurnPlayerId: this.players[this.turnIndex] };
    }
    if (this.phase === GamePhase.MatchComplete) {
      return { ...base, finalStandings: this.getFinalStandings() };
    }
    return base;
  }

  private assertPhase(expected: GamePhase): void {
    if (this.phase !== expected) {
      throw new Error(`Expected phase ${expected} but engine is in phase ${this.phase}.`);
    }
  }
}
