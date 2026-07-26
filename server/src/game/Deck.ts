/**
 * Deck.ts
 * The game's custom 30-card deck (see Card.ts for exact composition):
 * shuffle, draw, and deal. Knows nothing about game rules, trump, turns,
 * targets, or the debt ledger — that all belongs in GameEngine/Ledger.
 */

import { Card, Rank, Suit, RANK_ORDER, SUITS_WITH_SEVEN, SUITS_WITHOUT_SEVEN } from "./Card";

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = Deck.buildThirtyCardDeck();
  }

  /** Builds a fresh, ordered 30-card deck (not shuffled). */
  static buildThirtyCardDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS_WITH_SEVEN) {
      for (const rank of RANK_ORDER) {
        deck.push(new Card(suit, rank));
      }
    }
    for (const suit of SUITS_WITHOUT_SEVEN) {
      for (const rank of RANK_ORDER) {
        if (rank === Rank.Seven) continue; // Diamonds/Clubs have no 7
        deck.push(new Card(suit, rank));
      }
    }
    return deck;
  }

  /** Number of cards currently remaining in the deck. */
  get size(): number {
    return this.cards.length;
  }

  /** Returns a copy of the remaining cards (does not mutate the deck). */
  peekAll(): Card[] {
    return [...this.cards];
  }

  /** Shuffles the deck in place using Fisher-Yates. Returns `this` for chaining. */
  shuffle(): this {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  /** Draws `count` cards from the top, removing them from the deck. */
  draw(count: number = 1): Card[] {
    if (count < 0) {
      throw new Error("Cannot draw a negative number of cards.");
    }
    if (count > this.cards.length) {
      throw new Error(`Cannot draw ${count} card(s); only ${this.cards.length} remaining in the deck.`);
    }
    return this.cards.splice(0, count);
  }

  /**
   * Deals cards round-robin to `numPlayers` hands, `cardsPerPlayer` each,
   * removing them from the deck. Returns an array of hands, hands[i] being
   * player i's hand for this call (append to existing hands yourself if
   * dealing in multiple stages, as this game does: 5 then 5 more).
   */
  deal(numPlayers: number, cardsPerPlayer: number): Card[][] {
    if (numPlayers <= 0) {
      throw new Error("numPlayers must be a positive integer.");
    }
    const totalNeeded = numPlayers * cardsPerPlayer;
    if (totalNeeded > this.cards.length) {
      throw new Error(
        `Cannot deal ${cardsPerPlayer} card(s) to ${numPlayers} players; ` +
          `need ${totalNeeded} but only ${this.cards.length} remain.`
      );
    }

    const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let player = 0; player < numPlayers; player++) {
        const [card] = this.cards.splice(0, 1);
        hands[player].push(card);
      }
    }
    return hands;
  }

  /** Resets the deck back to a full, unshuffled 30 cards. */
  reset(): this {
    this.cards = Deck.buildThirtyCardDeck();
    return this;
  }
}

export { Card, Rank, Suit };
