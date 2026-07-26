import { Deck } from "../src/game/Deck";
import { Suit, Rank } from "../src/game/Card";

describe("Deck (30-card)", () => {
  it("builds exactly 30 cards with no duplicates", () => {
    const deck = new Deck();
    expect(deck.size).toBe(30);
    const ids = new Set(deck.peekAll().map((c) => c.id));
    expect(ids.size).toBe(30);
  });

  it("gives Spades and Hearts 8 cards each, Diamonds and Clubs 7 each", () => {
    const deck = new Deck();
    const all = deck.peekAll();
    expect(all.filter((c) => c.suit === Suit.Spades)).toHaveLength(8);
    expect(all.filter((c) => c.suit === Suit.Hearts)).toHaveLength(8);
    expect(all.filter((c) => c.suit === Suit.Diamonds)).toHaveLength(7);
    expect(all.filter((c) => c.suit === Suit.Clubs)).toHaveLength(7);
  });

  it("never includes a 7 of Diamonds or Clubs", () => {
    const deck = new Deck();
    const all = deck.peekAll();
    expect(all.some((c) => c.suit === Suit.Diamonds && c.rank === Rank.Seven)).toBe(false);
    expect(all.some((c) => c.suit === Suit.Clubs && c.rank === Rank.Seven)).toBe(false);
  });

  it("shuffle() reorders but keeps the same 30 cards", () => {
    const deck = new Deck();
    const before = deck.peekAll().map((c) => c.id);
    deck.shuffle();
    const after = deck.peekAll().map((c) => c.id);
    expect(new Set(after)).toEqual(new Set(before));
    expect(after).not.toEqual(before);
  });

  it("deals 5 cards to each of 3 players, twice, using the whole deck exactly", () => {
    const deck = new Deck();
    const firstDeal = deck.deal(3, 5);
    expect(firstDeal.every((h) => h.length === 5)).toBe(true);
    expect(deck.size).toBe(15);

    const secondDeal = deck.deal(3, 5);
    expect(secondDeal.every((h) => h.length === 5)).toBe(true);
    expect(deck.size).toBe(0); // exactly exhausted, per spec section 9
  });

  it("throws if asked to deal more than the deck has left", () => {
    const deck = new Deck();
    deck.deal(3, 5);
    deck.deal(3, 5);
    expect(() => deck.deal(3, 1)).toThrow();
  });

  it("reset() restores a full 30-card deck", () => {
    const deck = new Deck();
    deck.deal(3, 5);
    deck.deal(3, 5);
    expect(deck.size).toBe(0);
    deck.reset();
    expect(deck.size).toBe(30);
  });
});
