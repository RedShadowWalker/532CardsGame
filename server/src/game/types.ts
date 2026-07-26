/**
 * types.ts
 * Shared types for the 5-3-2 engine (3-player, custom 30-card deck variant).
 */

import { Card, Suit } from "./Card";

export type PlayerId = string;

export enum GamePhase {
  WaitingToStart = "WAITING_TO_START",
  TrumpSelection = "TRUMP_SELECTION",
  Settlement = "SETTLEMENT",
  Playing = "PLAYING",
  RoundComplete = "ROUND_COMPLETE",
}

export interface PlayedCard {
  playerId: PlayerId;
  card: Card;
}

export interface TrickRecord {
  cards: PlayedCard[];
  leadSuit: Suit;
  winnerId: PlayerId;
}

export type SettlementMethod = "card" | "carryForward";

/** One pending debtor->creditor relationship awaiting a settlement decision. */
export interface SettlementQueueItem {
  debtor: PlayerId;
  creditor: PlayerId;
  /** Hands still owed for this relationship (decrements as card exchanges resolve). */
  remaining: number;
  /** Set once the debtor has chosen a method for this relationship. */
  method: SettlementMethod | null;
}

/** A single random-card exchange in progress, awaiting the creditor's keep/reject response. */
export interface PendingExchange {
  debtor: PlayerId;
  creditor: PlayerId;
  card: Card;
}

export interface RoundSummary {
  round: number;
  dealerId: PlayerId;
  trumpPlayerId: PlayerId;
  leftPlayerId: PlayerId;
  trumpSuit: Suit;
  targets: Record<PlayerId, number>;
  tricksWon: Record<PlayerId, number>;
  differences: Record<PlayerId, number>; // tricksWon - target, per spec section 20
  snatches: { debtor: PlayerId; creditor: PlayerId; amount: number }[];
  ledgerAfter: Record<PlayerId, Record<PlayerId, number>>;
}

export interface GameEngineOptions {
  // Reserved for future house-rule overrides. The current spec fixes the
  // deck, targets, and rotation, so nothing is configurable yet.
}
