/**
 * Deck.ts (Three of Spades)
 * Standard 52-card deck: shuffle, draw, and deal. Structurally identical to
 * the 5-3-2 Deck — duplicated rather than shared because the two games'
 * card compositions are genuinely different (30-card custom deck vs. a
 * full standard deck), and keeping each game's engine self-contained in
 * its own folder makes it easy to reason about either one in isolation.
 */

import { Card, RANK_ORDER, SUITS } from "./Card";

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = Deck.buildStandardDeck();
  }

  static buildStandardDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANK_ORDER) {
        deck.push(new Card(suit, rank));
      }
    }
    return deck;
  }

  get size(): number {
    return this.cards.length;
  }

  peekAll(): Card[] {
    return [...this.cards];
  }

  shuffle(): this {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  draw(count: number = 1): Card[] {
    if (count < 0) {
      throw new Error("Cannot draw a negative number of cards.");
    }
    if (count > this.cards.length) {
      throw new Error(`Cannot draw ${count} card(s); only ${this.cards.length} remaining in the deck.`);
    }
    return this.cards.splice(0, count);
  }

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

  reset(): this {
    this.cards = Deck.buildStandardDeck();
    return this;
  }
}

export { Card } from "./Card";
