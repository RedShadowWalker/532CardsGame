/**
 * Rules.ts (Three of Spades)
 * Move legality and trick-winner determination. The spec doesn't restate
 * these mechanics explicitly, but "trump suit" and "trick" only mean
 * anything under the standard rule: follow suit if you can; if you can't,
 * play anything (including trump); highest trump played wins the trick,
 * otherwise highest card of the led suit wins. Identical in structure to
 * the 5-3-2 game's Rules.ts — duplicated for the same self-containment
 * reason as Deck.ts.
 */

import { Card, Suit } from "./Card";
import { PlayedCard, PlayerId } from "./types";

export function legalMoves(hand: Card[], leadSuit: Suit | null): Card[] {
  if (!leadSuit) {
    return [...hand];
  }
  const followingSuit = hand.filter((c) => c.suit === leadSuit);
  return followingSuit.length > 0 ? followingSuit : [...hand];
}

export function isLegalMove(hand: Card[], card: Card, leadSuit: Suit | null): boolean {
  return legalMoves(hand, leadSuit).some((c) => c.equals(card));
}

export function determineTrickWinner(trick: PlayedCard[], leadSuit: Suit, trumpSuit: Suit | null): PlayerId {
  if (trick.length === 0) {
    throw new Error("Cannot determine a winner for an empty trick.");
  }
  const trumpPlays = trumpSuit ? trick.filter((p) => p.card.suit === trumpSuit) : [];
  const contenders = trumpPlays.length > 0 ? trumpPlays : trick.filter((p) => p.card.suit === leadSuit);
  return contenders.reduce((best, current) => (current.card.value > best.card.value ? current : best))
    .playerId;
}
