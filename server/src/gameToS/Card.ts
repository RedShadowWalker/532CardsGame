/**
 * Card.ts (Three of Spades)
 * A standard 52-card deck, no jokers — unlike the 5-3-2 game's custom
 * 30-card deck, this game uses every rank in every suit.
 */

export enum Suit {
  Spades = "Spades",
  Hearts = "Hearts",
  Diamonds = "Diamonds",
  Clubs = "Clubs",
}

export enum Rank {
  Two = "2",
  Three = "3",
  Four = "4",
  Five = "5",
  Six = "6",
  Seven = "7",
  Eight = "8",
  Nine = "9",
  Ten = "10",
  Jack = "J",
  Queen = "Q",
  King = "K",
  Ace = "A",
}

// Ordered ranks, lowest to highest, for trick-taking comparisons.
export const RANK_ORDER: Rank[] = [
  Rank.Two,
  Rank.Three,
  Rank.Four,
  Rank.Five,
  Rank.Six,
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

/**
 * Point values per the spec's card-value table. The 3 of Spades is a
 * special case (30 points) distinct from every other 3, which are worth 0.
 */
const RANK_POINTS: Record<Rank, number> = {
  [Rank.Ace]: 15,
  [Rank.King]: 10,
  [Rank.Queen]: 10,
  [Rank.Jack]: 10,
  [Rank.Ten]: 10,
  [Rank.Five]: 5,
  [Rank.Two]: 0,
  [Rank.Three]: 0,
  [Rank.Four]: 0,
  [Rank.Six]: 0,
  [Rank.Seven]: 0,
  [Rank.Eight]: 0,
  [Rank.Nine]: 0,
};

export function pointValue(card: { suit: Suit; rank: Rank }): number {
  if (card.suit === Suit.Spades && card.rank === Rank.Three) return 30;
  return RANK_POINTS[card.rank];
}

export class Card {
  public readonly suit: Suit;
  public readonly rank: Rank;
  public readonly value: number; // 2 => 0 ... Ace => 12, for trick comparisons

  constructor(suit: Suit, rank: Rank) {
    this.suit = suit;
    this.rank = rank;
    this.value = RANK_ORDER.indexOf(rank);
  }

  get id(): string {
    return `${this.rank}-${this.suit}`;
  }

  get points(): number {
    return pointValue(this);
  }

  toString(): string {
    const suitSymbols: Record<Suit, string> = {
      [Suit.Hearts]: "♥",
      [Suit.Diamonds]: "♦",
      [Suit.Clubs]: "♣",
      [Suit.Spades]: "♠",
    };
    return `${this.rank}${suitSymbols[this.suit]}`;
  }

  beats(other: Card): boolean {
    if (this.suit !== other.suit) {
      throw new Error("Cannot compare beats() across different suits directly; use trick logic for trump/lead suit handling.");
    }
    return this.value > other.value;
  }

  equals(other: Card): boolean {
    return this.suit === other.suit && this.rank === other.rank;
  }

  toJSON() {
    return { suit: this.suit, rank: this.rank, value: this.value };
  }

  static fromJSON(data: { suit: Suit; rank: Rank }): Card {
    return new Card(data.suit, data.rank);
  }
}
