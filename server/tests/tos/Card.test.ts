import { Card, Rank, Suit, pointValue } from "../../src/gameToS/Card";

describe("ToS Card — point values", () => {
  it("assigns the spec's point values per rank", () => {
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.Ace })).toBe(15);
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.King })).toBe(10);
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.Queen })).toBe(10);
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.Jack })).toBe(10);
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.Ten })).toBe(10);
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.Five })).toBe(5);
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.Two })).toBe(0);
  });

  it("gives the 3 of Spades 30 points, but every other 3 is worth 0", () => {
    expect(pointValue({ suit: Suit.Spades, rank: Rank.Three })).toBe(30);
    expect(pointValue({ suit: Suit.Hearts, rank: Rank.Three })).toBe(0);
    expect(pointValue({ suit: Suit.Diamonds, rank: Rank.Three })).toBe(0);
    expect(pointValue({ suit: Suit.Clubs, rank: Rank.Three })).toBe(0);
  });

  it("totals exactly 270 points across the full 52-card deck", () => {
    let total = 0;
    for (const suit of Object.values(Suit)) {
      for (const rank of Object.values(Rank)) {
        total += pointValue({ suit, rank });
      }
    }
    expect(total).toBe(270);
  });

  it("Card.points matches pointValue for the same card", () => {
    const card = new Card(Suit.Spades, Rank.Three);
    expect(card.points).toBe(30);
  });
});
