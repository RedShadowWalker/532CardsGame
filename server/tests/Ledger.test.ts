import { Ledger, computeSnatches } from "../src/game/Ledger";

const SEATS = ["A", "B", "C"];

describe("Ledger — addDebt / netting", () => {
  it("records a simple one-directional debt", () => {
    const ledger = new Ledger();
    ledger.addDebt("B", "A", 1); // B owes A 1
    expect(ledger.allDebts(SEATS)).toEqual([{ debtor: "B", creditor: "A", amount: 1 }]);
  });

  it("accumulates repeated debt in the same direction", () => {
    const ledger = new Ledger();
    ledger.addDebt("B", "A", 1);
    ledger.addDebt("B", "A", 2);
    expect(ledger.totalOwedBy("B", SEATS)).toBe(3);
  });

  it("nets a reverse debt down instead of tracking both directions", () => {
    const ledger = new Ledger();
    ledger.addDebt("A", "B", 2); // A owes B 2
    ledger.addDebt("B", "A", 1); // B now owes A 1 -> nets against existing debt
    // Net result: A still owes B 1 (2 - 1), B owes A nothing.
    expect(ledger.allDebts(SEATS)).toEqual([{ debtor: "A", creditor: "B", amount: 1 }]);
  });

  it("fully cancels when the reverse debt exactly matches", () => {
    const ledger = new Ledger();
    ledger.addDebt("A", "B", 2);
    ledger.addDebt("B", "A", 2);
    expect(ledger.allDebts(SEATS)).toEqual([]);
  });

  it("flips direction when the reverse debt exceeds the original", () => {
    const ledger = new Ledger();
    ledger.addDebt("A", "B", 1);
    ledger.addDebt("B", "A", 3); // cancels the 1, then B owes A the remaining 2
    expect(ledger.allDebts(SEATS)).toEqual([{ debtor: "B", creditor: "A", amount: 2 }]);
  });

  it("this is exactly how 'extra tricks later settle a previous debt' works (spec section 11)", () => {
    const ledger = new Ledger();
    // Round N: B fell short, owes A 2.
    ledger.addDebt("B", "A", 2);
    expect(ledger.totalOwedBy("B", SEATS)).toBe(2);
    // Round N+1: B overperforms and earns a credit against A specifically.
    ledger.addDebt("A", "B", 2);
    expect(ledger.totalOwedBy("B", SEATS)).toBe(0); // fully settled automatically
  });
});

describe("Ledger — reduceDebt (settlement)", () => {
  it("reduces a specific debt by the settled amount", () => {
    const ledger = new Ledger();
    ledger.addDebt("B", "A", 3);
    ledger.reduceDebt("B", "A", 1);
    expect(ledger.totalOwedBy("B", SEATS)).toBe(2);
  });

  it("never goes negative", () => {
    const ledger = new Ledger();
    ledger.addDebt("B", "A", 1);
    ledger.reduceDebt("B", "A", 5);
    expect(ledger.totalOwedBy("B", SEATS)).toBe(0);
  });
});

describe("Ledger — totalOwedBy (max-debt rule scope)", () => {
  it("sums debt across ALL creditors, not just one relationship", () => {
    const ledger = new Ledger();
    ledger.addDebt("A", "B", 2);
    ledger.addDebt("A", "C", 3);
    expect(ledger.totalOwedBy("A", SEATS)).toBe(5);
  });
});

describe("computeSnatches", () => {
  it("handles the spec's own worked example (one creditor, one debtor, one exact)", () => {
    // A: target 5, won 6 -> +1. B: target 3, won 2 -> -1. C: target 2, won 2 -> 0.
    const snatches = computeSnatches({ A: 1, B: -1, C: 0 }, SEATS);
    expect(snatches).toEqual([{ debtor: "B", creditor: "A", amount: 1 }]);
  });

  it("splits a single debtor's shortfall across two creditors, matching their exact surpluses", () => {
    // A: +2, B: +1, C: -3
    const snatches = computeSnatches({ A: 2, B: 1, C: -3 }, SEATS);
    expect(snatches).toEqual([
      { debtor: "C", creditor: "A", amount: 2 },
      { debtor: "C", creditor: "B", amount: 1 },
    ]);
  });

  it("splits a single creditor's surplus across two debtors, matching their exact shortfalls", () => {
    // A: +3, B: -1, C: -2
    const snatches = computeSnatches({ A: 3, B: -1, C: -2 }, SEATS);
    expect(snatches).toEqual([
      { debtor: "B", creditor: "A", amount: 1 },
      { debtor: "C", creditor: "A", amount: 2 },
    ]);
  });

  it("produces no snatches when everyone hits their target exactly", () => {
    expect(computeSnatches({ A: 0, B: 0, C: 0 }, SEATS)).toEqual([]);
  });

  it("every snatch amount is positive and the total matches total deficit", () => {
    const differences = { A: 2, B: 1, C: -3 };
    const snatches = computeSnatches(differences, SEATS);
    const totalSnatched = snatches.reduce((sum, s) => sum + s.amount, 0);
    const totalDeficit = Object.values(differences)
      .filter((d) => d < 0)
      .reduce((sum, d) => sum - d, 0);
    expect(totalSnatched).toBe(totalDeficit);
    snatches.forEach((s) => expect(s.amount).toBeGreaterThan(0));
  });
});
