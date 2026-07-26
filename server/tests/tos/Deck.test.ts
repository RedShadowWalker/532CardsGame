import { Deck } from "../../src/gameToS/Deck";
import { Suit } from "../../src/gameToS/Card";

describe("ToS Deck — standard 52-card deck", () => {
  it("builds 52 unique cards", () => {
    const deck = new Deck();
    expect(deck.size).toBe(52);
    expect(new Set(deck.peekAll().map((c) => c.id)).size).toBe(52);
  });

  it("has 13 cards in each suit", () => {
    const deck = new Deck();
    const all = deck.peekAll();
    Object.values(Suit).forEach((suit) => {
      expect(all.filter((c) => c.suit === suit)).toHaveLength(13);
    });
  });

  it("deals 13 cards to each of 4 players, exhausting the deck exactly", () => {
    const deck = new Deck();
    const hands = deck.deal(4, 13);
    expect(hands.every((h) => h.length === 13)).toBe(true);
    expect(deck.size).toBe(0);
  });

  it("shuffle() reorders but keeps the same 52 cards", () => {
    const deck = new Deck();
    const before = deck.peekAll().map((c) => c.id);
    deck.shuffle();
    const after = deck.peekAll().map((c) => c.id);
    expect(new Set(after)).toEqual(new Set(before));
    expect(after).not.toEqual(before);
  });
});
