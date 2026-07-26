/**
 * Rules.ts
 * Pure, stateless functions for move legality and trick-winner determination.
 * Nothing here mutates or stores game state — everything is derived from the
 * arguments given. That keeps this layer trivially unit-testable and reusable
 * from a UI (e.g. to grey out illegal cards) without duplicating engine state.
 */

import { Card, Suit } from "./Card";
import { PlayedCard, PlayerId } from "./types";

/**
 * Returns the subset of `hand` that may legally be played given the suit
 * led for the current trick.
 *
 * Standard "follow suit if you can" rule:
 * - If no suit has been led yet (this player is leading the trick), any card
 *   in hand is legal.
 * - Otherwise, if the player holds any card of the led suit, only cards of
 *   that suit are legal.
 * - If the player holds none of the led suit, any card (including trump) is
 *   legal — this is how trumping in on a trick happens.
 */
export function legalMoves(hand: Card[], leadSuit: Suit | null): Card[] {
  if (!leadSuit) {
    return [...hand];
  }
  const followingSuit = hand.filter((c) => c.suit === leadSuit);
  return followingSuit.length > 0 ? followingSuit : [...hand];
}

/** Returns true if `card` is a legal play from `hand` given the led suit. */
export function isLegalMove(hand: Card[], card: Card, leadSuit: Suit | null): boolean {
  return legalMoves(hand, leadSuit).some((c) => c.equals(card));
}

/**
 * Determines the winner of a completed trick.
 * - If any trump cards were played, the highest trump played wins.
 * - Otherwise, the highest card of the led suit wins.
 * - Cards that are neither trump nor the led suit (discards, played when a
 *   player couldn't follow suit and chose not to trump) can never win.
 *
 * `trick` must contain exactly one entry per player. `leadSuit` is passed
 * explicitly rather than inferred, since the engine already knows it and
 * this keeps the function usable even if trick order is ever reshuffled
 * for display purposes.
 */
export function determineTrickWinner(
  trick: PlayedCard[],
  leadSuit: Suit,
  trumpSuit: Suit | null
): PlayerId {
  if (trick.length === 0) {
    throw new Error("Cannot determine a winner for an empty trick.");
  }

  const trumpPlays = trumpSuit ? trick.filter((p) => p.card.suit === trumpSuit) : [];
  const contenders = trumpPlays.length > 0 ? trumpPlays : trick.filter((p) => p.card.suit === leadSuit);

  return contenders.reduce((best, current) => (current.card.value > best.card.value ? current : best))
    .playerId;
}
