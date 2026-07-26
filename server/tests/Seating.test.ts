import { rightOf, leftOf, trumpPlayerForRound, deriveRoundRoles } from "../src/game/Seating";

const SEATS = ["A", "B", "C"];

describe("Seating — left/right", () => {
  it("matches the spec's own example exactly: A trumps, B is right/dealer, C is left", () => {
    expect(rightOf(SEATS, "A")).toBe("B");
    expect(leftOf(SEATS, "A")).toBe("C");
  });

  it("wraps around correctly for every seat", () => {
    expect(rightOf(SEATS, "B")).toBe("C");
    expect(rightOf(SEATS, "C")).toBe("A");
    expect(leftOf(SEATS, "B")).toBe("A");
    expect(leftOf(SEATS, "C")).toBe("B");
  });

  it("throws for a player not in the seat order", () => {
    expect(() => rightOf(SEATS, "Z")).toThrow();
    expect(() => leftOf(SEATS, "Z")).toThrow();
  });
});

describe("Seating — trump rotation", () => {
  it("rotates A -> B -> C -> A across rounds 1-4, per the spec's example", () => {
    expect(trumpPlayerForRound(SEATS, 1)).toBe("A");
    expect(trumpPlayerForRound(SEATS, 2)).toBe("B");
    expect(trumpPlayerForRound(SEATS, 3)).toBe("C");
    expect(trumpPlayerForRound(SEATS, 4)).toBe("A");
    expect(trumpPlayerForRound(SEATS, 7)).toBe("A");
  });
});

describe("Seating — deriveRoundRoles", () => {
  it("assigns dealer = right of trump player, and targets 5/3/2", () => {
    const roles = deriveRoundRoles(SEATS, "A");
    expect(roles.trumpPlayerId).toBe("A");
    expect(roles.leftPlayerId).toBe("C");
    expect(roles.dealerId).toBe("B");
    expect(roles.targets).toEqual({ A: 5, C: 3, B: 2 });
  });

  it("re-derives correctly when B is trump player", () => {
    const roles = deriveRoundRoles(SEATS, "B");
    expect(roles.leftPlayerId).toBe("A");
    expect(roles.dealerId).toBe("C");
    expect(roles.targets).toEqual({ B: 5, A: 3, C: 2 });
  });

  it("targets always sum to 10", () => {
    for (const trump of SEATS) {
      const roles = deriveRoundRoles(SEATS, trump);
      const total = Object.values(roles.targets).reduce((a, b) => a + b, 0);
      expect(total).toBe(10);
    }
  });
});
