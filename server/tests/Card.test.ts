import { Card, Rank, Suit } from "../src/game/Card";

describe("Card (30-card deck)", () => {
  it("computes value based on rank order (7 lowest, Ace highest)", () => {
    expect(new Card(Suit.Spades, Rank.Seven).value).toBe(0);
    expect(new Card(Suit.Spades, Rank.Ace).value).toBe(7);
    expect(new Card(Suit.Spades, Rank.Ace).value).toBeGreaterThan(new Card(Suit.Spades, Rank.King).value);
  });

  it("throws when constructing a 7 of Diamonds or Clubs (they don't exist in this deck)", () => {
    expect(() => new Card(Suit.Diamonds, Rank.Seven)).toThrow();
    expect(() => new Card(Suit.Clubs, Rank.Seven)).toThrow();
  });

  it("allows the 7 of Spades and Hearts", () => {
    expect(() => new Card(Suit.Spades, Rank.Seven)).not.toThrow();
    expect(() => new Card(Suit.Hearts, Rank.Seven)).not.toThrow();
  });

  it("beats() compares same-suit cards by rank", () => {
    const ace = new Card(Suit.Hearts, Rank.Ace);
    const king = new Card(Suit.Hearts, Rank.King);
    expect(ace.beats(king)).toBe(true);
    expect(king.beats(ace)).toBe(false);
  });

  it("round-trips through toJSON/fromJSON", () => {
    const original = new Card(Suit.Diamonds, Rank.Jack);
    const revived = Card.fromJSON(original.toJSON() as { suit: Suit; rank: Rank });
    expect(revived.equals(original)).toBe(true);
  });
});
