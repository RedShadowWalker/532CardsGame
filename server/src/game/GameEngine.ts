/**
 * GameEngine.ts
 * UI-independent orchestrator for the 5-3-2 game, built exactly to the given
 * spec (3 players, custom 30-card deck, trump assigned by rotation — not
 * bidding — and a hand-debt settlement system between rounds).
 *
 * Flow per round (spec sections 4-19):
 *   1. Trump Player determined by rotation (Seating.trumpPlayerForRound).
 *      Left Player / Dealer / targets (5/3/2) derived from that.
 *   2. Deal 5 cards to each player -> phase TrumpSelection.
 *   3. Trump Player names the suit -> deal remaining 5 to each (10 total,
 *      deck now empty) -> phase Settlement if any debts are pending,
 *      otherwise straight to Playing.
 *   4. Settlement (if entered): each pending debtor-creditor relationship,
 *      processed one at a time, lets the debtor choose Card Settlement
 *      (random card exchange, decrementing that debt each unit resolved)
 *      or Carry Forward (left as-is, unless their TOTAL debt has already
 *      reached 4 — see Ledger.ts's documented conventions).
 *   5. Playing: Trump Player leads the first trick; follow-suit mandatory;
 *      highest trump (if any played) or highest of the led suit wins each
 *      trick; trick winner leads next.
 *   6. Round end: tricks-won-vs-target differences computed, converted to
 *      hand snatches, folded into the running Ledger. Trump rotates, and
 *      the next round begins the same way.
 */

import { Card, Suit } from "./Card";
import { Deck } from "./Deck";
import { isLegalMove, legalMoves, determineTrickWinner } from "./Rules";
import { computeDifferences } from "./Scoring";
import { Ledger, computeSnatches, DebtEntry } from "./Ledger";
import { deriveRoundRoles, trumpPlayerForRound } from "./Seating";
import {
  GameEngineOptions,
  GamePhase,
  PendingExchange,
  PlayedCard,
  PlayerId,
  RoundSummary,
  SettlementMethod,
  SettlementQueueItem,
  TrickRecord,
} from "./types";

export { GamePhase } from "./types";
export type {
  RoundSummary,
  TrickRecord,
  PlayedCard,
  SettlementQueueItem,
  PendingExchange,
  SettlementMethod,
} from "./types";

export class GameEngine {
  readonly players: PlayerId[]; // exactly 3, fixed seat order (join order)

  private deck: Deck;
  private hands: Record<PlayerId, Card[]>;

  private phase: GamePhase;
  private roundNumber: number;
  private roundHistory: RoundSummary[];

  // Per-round role assignment (spec sections 4-6)
  private trumpPlayerId: PlayerId | null;
  private leftPlayerId: PlayerId | null;
  private dealerId: PlayerId | null;
  private targets: Record<PlayerId, number>;
  private trumpSuit: Suit | null;

  // Settlement phase state (spec sections 10-12)
  private ledger: Ledger;
  private settlementQueue: SettlementQueueItem[];
  private settlementIndex: number;
  private pendingExchange: PendingExchange | null;

  // Trick play state
  private turnIndex: number;
  private currentTrick: PlayedCard[];
  private completedTricks: TrickRecord[];
  private tricksWon: Record<PlayerId, number>;

  constructor(players: PlayerId[], _options: GameEngineOptions = {}) {
    if (players.length !== 3) {
      throw new Error("5-3-2 requires exactly 3 players.");
    }
    if (new Set(players).size !== 3) {
      throw new Error("Player ids must be unique.");
    }

    this.players = [...players];
    this.deck = new Deck();
    this.hands = {};
    this.players.forEach((p) => (this.hands[p] = []));

    this.phase = GamePhase.WaitingToStart;
    this.roundNumber = 0;
    this.roundHistory = [];

    this.trumpPlayerId = null;
    this.leftPlayerId = null;
    this.dealerId = null;
    this.targets = {};
    this.trumpSuit = null;

    this.ledger = new Ledger();
    this.settlementQueue = [];
    this.settlementIndex = 0;
    this.pendingExchange = null;

    this.turnIndex = 0;
    this.currentTrick = [];
    this.completedTricks = [];
    this.tricksWon = {};
    this.players.forEach((p) => (this.tricksWon[p] = 0));
  }

  // ==========================================================================
  // Round lifecycle
  // ==========================================================================

  /** Starts a new round: rotates trump, reshuffles, deals the first 5 to each player. */
  startRound(): void {
    if (this.phase !== GamePhase.WaitingToStart && this.phase !== GamePhase.RoundComplete) {
      throw new Error(`Cannot start a new round from phase ${this.phase}.`);
    }

    this.roundNumber += 1;
    this.trumpPlayerId = trumpPlayerForRound(this.players, this.roundNumber);
    const roles = deriveRoundRoles(this.players, this.trumpPlayerId);
    this.leftPlayerId = roles.leftPlayerId;
    this.dealerId = roles.dealerId;
    this.targets = roles.targets;
    this.trumpSuit = null;

    this.deck.reset().shuffle();
    this.players.forEach((p) => (this.hands[p] = []));
    this.currentTrick = [];
    this.completedTricks = [];
    this.players.forEach((p) => (this.tricksWon[p] = 0));

    const firstDeal = this.deck.deal(3, 5); // spec section 7: 5 cards each, view only these
    this.players.forEach((p, i) => this.hands[p].push(...firstDeal[i]));

    this.phase = GamePhase.TrumpSelection;
  }

  // ==========================================================================
  // Trump selection (spec sections 8-9) — no bidding, a direct declaration
  // ==========================================================================

  chooseTrump(playerId: PlayerId, suit: Suit): void {
    this.assertPhase(GamePhase.TrumpSelection);
    if (playerId !== this.trumpPlayerId) {
      throw new Error(`Only the Trump Player (${this.trumpPlayerId}) may choose trump.`);
    }
    this.trumpSuit = suit;

    const secondDeal = this.deck.deal(3, 5); // spec section 9: 5 more, now 10 each, deck empty
    this.players.forEach((p, i) => this.hands[p].push(...secondDeal[i]));

    this.enterSettlementOrPlaying();
  }

  private enterSettlementOrPlaying(): void {
    const pending = this.ledger.allDebts(this.players);
    if (pending.length === 0) {
      this.beginPlaying();
      return;
    }

    this.settlementQueue = pending.map(
      (d: DebtEntry): SettlementQueueItem => ({
        debtor: d.debtor,
        creditor: d.creditor,
        remaining: d.amount,
        method: null,
      })
    );
    this.settlementIndex = 0;
    this.pendingExchange = null;
    this.phase = GamePhase.Settlement;
  }

  private beginPlaying(): void {
    this.phase = GamePhase.Playing;
    this.turnIndex = this.players.indexOf(this.trumpPlayerId!); // Trump Player leads first, spec section 13
    this.currentTrick = [];
  }

  // ==========================================================================
  // Settlement (spec sections 10-12)
  // ==========================================================================

  /** The debtor-creditor relationship currently awaiting a decision, if any. */
  getCurrentSettlementItem(): SettlementQueueItem | null {
    if (this.phase !== GamePhase.Settlement) return null;
    return this.settlementQueue[this.settlementIndex] ?? null;
  }

  getPendingExchange(): PendingExchange | null {
    return this.pendingExchange;
  }

  /**
   * The debtor decides how to handle ONE relationship they owe (chosen
   * separately per creditor, per the confirmed convention). Must address
   * whichever relationship is currently at the front of the queue.
   */
  settleDebt(playerId: PlayerId, creditorId: PlayerId, method: SettlementMethod): void {
    this.assertPhase(GamePhase.Settlement);
    if (this.pendingExchange) {
      throw new Error("Resolve the current card exchange before starting a new settlement decision.");
    }
    const item = this.settlementQueue[this.settlementIndex];
    if (!item) {
      throw new Error("There is no pending settlement to act on.");
    }
    if (playerId !== item.debtor) {
      throw new Error(`It is ${item.debtor}'s debt to settle, not ${playerId}'s.`);
    }
    if (creditorId !== item.creditor) {
      throw new Error(`The current pending settlement is owed to ${item.creditor}, not ${creditorId}.`);
    }

    if (method === "carryForward") {
      const currentTotalDebt = this.ledger.totalOwedBy(playerId, this.players);
      if (currentTotalDebt >= 4) {
        throw new Error(
          `${playerId}'s total debt has reached the maximum of 4 hands — Card Settlement is required.`
        );
      }
      item.method = "carryForward";
      // Leave the ledger untouched so the same outstanding debt is rebuilt
      // from the live balance when the next round enters Settlement.
      this.advanceSettlement();
    } else if (method === "card") {
      item.method = "card";
      this.triggerNextExchange(item);
    } else {
      throw new Error(`Unknown settlement method: ${method}`);
    }
  }

  private triggerNextExchange(item: SettlementQueueItem): void {
    const hand = this.hands[item.debtor];
    if (hand.length === 0) {
      throw new Error(`${item.debtor} has no cards left to settle with.`);
    }
    const randomIndex = Math.floor(Math.random() * hand.length);
    const [card] = hand.splice(randomIndex, 1);
    this.hands[item.creditor].push(card); // tentatively received, pending keep/reject
    this.pendingExchange = { debtor: item.debtor, creditor: item.creditor, card };
  }

  /**
   * The creditor responds to a pending card exchange: keep it (and return a
   * different card, unless doing so would void themselves in that suit) or
   * reject it (hand back the exact same card, no net change).
   */
  respondToSettlement(
    playerId: PlayerId,
    action: "keep" | "reject",
    returnCard?: { suit: Suit; rank: Card["rank"] }
  ): void {
    this.assertPhase(GamePhase.Settlement);
    const exchange = this.pendingExchange;
    if (!exchange) {
      throw new Error("There is no settlement exchange awaiting a response.");
    }
    if (playerId !== exchange.creditor) {
      throw new Error(`This settlement response belongs to ${exchange.creditor}, not ${playerId}.`);
    }

    const { debtor, creditor, card } = exchange;

    if (action === "reject") {
      const idx = this.hands[creditor].findIndex((c) => c.equals(card));
      this.hands[creditor].splice(idx, 1);
      this.hands[debtor].push(card);
      this.ledger.reduceDebt(debtor, creditor, 1);
      this.finishExchange();
      return;
    }

    if (action === "keep") {
      if (!returnCard) {
        throw new Error("You must specify which card to return when keeping the received card.");
      }
      const handCard = this.hands[creditor].find((c) => c.suit === returnCard.suit && c.rank === returnCard.rank);
      if (!handCard) {
        throw new Error(`You don't hold ${returnCard.rank}-${returnCard.suit}.`);
      }
      const sameSuitCount = this.hands[creditor].filter((c) => c.suit === handCard.suit).length;
      if (sameSuitCount < 2) {
        throw new Error(
          `Returning your only ${handCard.suit} would void you in that suit — choose a different card.`
        );
      }
      const idx = this.hands[creditor].indexOf(handCard);
      this.hands[creditor].splice(idx, 1);
      this.hands[debtor].push(handCard);
      this.ledger.reduceDebt(debtor, creditor, 1);
      this.finishExchange();
      return;
    }

    throw new Error(`Unknown settlement response action: ${action}`);
  }

  private finishExchange(): void {
    this.pendingExchange = null;
    const item = this.settlementQueue[this.settlementIndex];
    item.remaining -= 1;
    if (item.remaining > 0) {
      this.triggerNextExchange(item);
    } else {
      this.advanceSettlement();
    }
  }

  private advanceSettlement(): void {
    this.settlementIndex += 1;
    if (this.settlementIndex >= this.settlementQueue.length) {
      this.beginPlaying();
    }
  }

  // ==========================================================================
  // Playing tricks (spec sections 13-19)
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
    this.turnIndex = (this.turnIndex + 1) % this.players.length;

    if (this.currentTrick.length < this.players.length) {
      return null;
    }
    return this.resolveTrick();
  }

  private resolveTrick(): TrickRecord {
    const leadSuit = this.currentTrick[0].card.suit;
    const winnerId = determineTrickWinner(this.currentTrick, leadSuit, this.trumpSuit);

    this.tricksWon[winnerId] = (this.tricksWon[winnerId] ?? 0) + 1;
    const record: TrickRecord = { cards: [...this.currentTrick], leadSuit, winnerId };
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
    this.phase = GamePhase.RoundComplete;

    const differences = computeDifferences(this.tricksWon, this.targets);
    const snatches = computeSnatches(differences, this.players);
    snatches.forEach((s) => this.ledger.addDebt(s.debtor, s.creditor, s.amount));

    this.roundHistory.push({
      round: this.roundNumber,
      dealerId: this.dealerId!,
      trumpPlayerId: this.trumpPlayerId!,
      leftPlayerId: this.leftPlayerId!,
      trumpSuit: this.trumpSuit!,
      targets: { ...this.targets },
      tricksWon: { ...this.tricksWon },
      differences,
      snatches,
      ledgerAfter: this.ledger.snapshot(),
    });
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

  getTrumpPlayerId(): PlayerId | null {
    return this.trumpPlayerId;
  }

  getLeftPlayerId(): PlayerId | null {
    return this.leftPlayerId;
  }

  getDealerId(): PlayerId | null {
    return this.dealerId;
  }

  getTargets(): Record<PlayerId, number> {
    return { ...this.targets };
  }

  getTrumpSuit(): Suit | null {
    return this.trumpSuit;
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

  getTricksWon(): Record<PlayerId, number> {
    return { ...this.tricksWon };
  }

  getLedgerSnapshot(): Record<PlayerId, Record<PlayerId, number>> {
    return this.ledger.snapshot();
  }

  getTotalDebt(playerId: PlayerId): number {
    return this.ledger.totalOwedBy(playerId, this.players);
  }

  getSettlementQueue(): SettlementQueueItem[] {
    return this.settlementQueue.map((item) => ({ ...item }));
  }

  getSettlementIndex(): number {
    return this.settlementIndex;
  }

  getRoundHistory(): RoundSummary[] {
    return [...this.roundHistory];
  }

  /**
   * Sanitized state snapshot safe to send to clients over Socket.IO.
   * Pass `forPlayerId` to include that player's own hand; other players'
   * hands are only ever exposed as counts, never contents.
   */
  getPublicState(forPlayerId?: PlayerId) {
    const base = {
      phase: this.phase,
      round: this.roundNumber,
      players: [...this.players],
      trumpPlayerId: this.trumpPlayerId,
      leftPlayerId: this.leftPlayerId,
      dealerId: this.dealerId,
      targets: { ...this.targets },
      trumpSuit: this.trumpSuit,
      handSizes: Object.fromEntries(this.players.map((p) => [p, this.hands[p].length])),
      hand: forPlayerId ? this.hands[forPlayerId].map((c) => c.toJSON()) : undefined,
      currentTrick: this.currentTrick.map((pc) => ({
        playerId: pc.playerId,
        card: pc.card.toJSON(),
      })),
      tricksWon: { ...this.tricksWon },
      ledger: this.ledger.snapshot(),
      roundHistory: [...this.roundHistory],
    };

    if (this.phase === GamePhase.Playing) {
      return { ...base, currentTurnPlayerId: this.players[this.turnIndex] };
    }
    if (this.phase === GamePhase.Settlement) {
      return {
        ...base,
        settlementQueue: this.getSettlementQueue(),
        settlementIndex: this.settlementIndex,
        pendingExchange: this.pendingExchange
          ? {
              debtor: this.pendingExchange.debtor,
              creditor: this.pendingExchange.creditor,
              card: this.pendingExchange.card.toJSON(),
            }
          : null,
      };
    }
    return base;
  }

  private assertPhase(expected: GamePhase): void {
    if (this.phase !== expected) {
      throw new Error(`Expected phase ${expected} but engine is in phase ${this.phase}.`);
    }
  }
}
