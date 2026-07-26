/**
 * types.ts (Three of Spades)
 */

import { Card, Suit } from "./Card";

export type PlayerId = string;

export enum GamePhase {
  WaitingToStart = "WAITING_TO_START",
  Auction = "AUCTION",
  TrumpAndPartnerSelection = "TRUMP_AND_PARTNER_SELECTION",
  Playing = "PLAYING",
  RoundComplete = "ROUND_COMPLETE",
  MatchComplete = "MATCH_COMPLETE",
}

export interface PlayedCard {
  playerId: PlayerId;
  card: Card;
}

export interface TrickRecord {
  cards: PlayedCard[];
  leadSuit: Suit;
  winnerId: PlayerId;
  points: number;
}

export interface BidRecord {
  playerId: PlayerId;
  amount: number;
}

export interface RoundSummary {
  round: number;
  dealerId: PlayerId;
  declarerId: PlayerId;
  partnerId: PlayerId;
  bidAmount: number;
  trumpSuit: Suit;
  partnerCard: { suit: Suit; rank: Card["rank"] };
  teamTotal: number;
  contractSucceeded: boolean;
  /**
   * Score deltas from this round. Present on the engine's internal record
   * always, but the socket layer must NOT forward this to clients except
   * as part of a leaderboard reveal (unanimous vote) or the final
   * end-of-match reveal — see spec's hidden score system.
   */
  scoreDelta: Record<PlayerId, number>;
}

export interface GameEngineOptions {
  matchLength: 7 | 10;
}
