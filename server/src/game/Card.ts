/**
 * Card.ts
 * Represents a single playing card from the game's custom 30-card deck.
 *
 * Per spec section 2, this is NOT a standard deck:
 * - Spades and Hearts each carry all 8 ranks: 7,8,9,10,J,Q,K,A
 * - Diamonds and Clubs each carry only 7 ranks: 8,9,10,J,Q,K,A (no 7)
 * Total: 8 + 8 + 7 + 7 = 30 cards.
 */

export enum Suit {
  Spades = "Spades",
  Hearts = "Hearts",
  Diamonds = "Diamonds",
  Clubs = "Clubs",
}

export enum Rank {
  Seven = "7",
  Eight = "8",
  Nine = "9",
  Ten = "10",
  Jack = "J",
  Queen = "Q",
  King = "K",
  Ace = "A",
}

// Ordered ranks, lowest to highest — per spec section 14 (Ace high, 7 low).
export const RANK_ORDER: Rank[] = [
  Rank.Seven,
  Rank.Eight,
  Rank.Nine,
  Rank.Ten,
  Rank.Jack,
  Rank.Queen,
  Rank.King,
  Rank.Ace,
];

export const SUITS: Suit[] = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];

/** Suits that carry the 7 (Spades, Hearts) vs. suits that don't (Diamonds, Clubs). */
export const SUITS_WITH_SEVEN: Suit[] = [Suit.Spades, Suit.Hearts];
export const SUITS_WITHOUT_SEVEN: Suit[] = [Suit.Diamonds, Suit.Clubs];

export class Card {
  public readonly suit: Suit;
  public readonly rank: Rank;
  /** Numeric strength of the rank: 7 => 0 ... Ace => 7. Useful for comparisons. */
  public readonly value: number;

  constructor(suit: Suit, rank: Rank) {
    if (rank === Rank.Seven && SUITS_WITHOUT_SEVEN.includes(suit)) {
      throw new Error(`${suit} has no 7 in this game's 30-card deck.`);
    }
    this.suit = suit;
    this.rank = rank;
    this.value = RANK_ORDER.indexOf(rank);
  }

  /** Unique string id for this card, e.g. "A-Hearts", "10-Spades". */
  get id(): string {
    return `${this.rank}-${this.suit}`;
  }

  /** Human readable label, e.g. "A♥", "10♠". */
  toString(): string {
    const suitSymbols: Record<Suit, string> = {
      [Suit.Hearts]: "♥",
      [Suit.Diamonds]: "♦",
      [Suit.Clubs]: "♣",
      [Suit.Spades]: "♠",
    };
    return `${this.rank}${suitSymbols[this.suit]}`;
  }

  /** Returns true if this card outranks another card of the SAME suit. */
  beats(other: Card): boolean {
    if (this.suit !== other.suit) {
      throw new Error("Cannot compare beats() across different suits directly; use trick logic for trump/lead suit handling.");
    }
    return this.value > other.value;
  }

  equals(other: Card): boolean {
    return this.suit === other.suit && this.rank === other.rank;
  }

  /** Plain object form, handy for sending over Socket.IO. */
  toJSON() {
    return { suit: this.suit, rank: this.rank, value: this.value };
  }

  static fromJSON(data: { suit: Suit; rank: Rank }): Card {
    return new Card(data.suit, data.rank);
  }
}
