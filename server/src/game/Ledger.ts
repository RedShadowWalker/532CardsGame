/**
 * Ledger.ts
 * Tracks running hand-debt balances between players across rounds (spec
 * sections 20-21), and computes how a round's tricks-won-vs-target
 * differences translate into new debt.
 *
 * Confirmed conventions (clarified with the user, since the spec described
 * these at a narrative level without pinning down the exact algorithm):
 * - Debts between the same two players always NET into a single running
 *   balance per pair. If A already owes B 2 hands and a later round would
 *   have B owe A 1 hand, that 1 hand cancels against the existing debt
 *   first (A ends up owing B just 1) rather than tracking both directions
 *   as separate entries. This is also exactly the mechanism spec section 11
 *   describes as "extra tricks in later rounds can be used to settle the
 *   previous debt" — when a debtor later becomes a creditor to that same
 *   person, netting IS the settlement.
 * - The max-debt rule (section 12: "reaches 4 hands") is evaluated as a
 *   player's TOTAL debt summed across every creditor they owe, checked live
 *   at the moment each carryForward decision is made — not a one-time
 *   snapshot from the start of the settlement phase. This matters when a
 *   player owes multiple people: if an earlier relationship in the same
 *   phase was paid down via Card Settlement, that reduction correctly
 *   counts toward whether they're still at/above the threshold for a later
 *   relationship in the same phase.
 * - The settlement method (Card Settlement vs. Carry Forward) is chosen
 *   separately for each creditor a player owes, not once for everything.
 */

import { PlayerId } from "./types";

export interface DebtEntry {
  debtor: PlayerId;
  creditor: PlayerId;
  amount: number;
}

export interface Snatch {
  debtor: PlayerId;
  creditor: PlayerId;
  amount: number;
}

export class Ledger {
  // balances[debtor][creditor] = hands debtor currently owes creditor.
  // Netting invariant: for any pair (X, Y), at most one of
  // balances[X][Y] / balances[Y][X] is ever non-zero at a time.
  private balances: Record<PlayerId, Record<PlayerId, number>> = {};

  private get(debtor: PlayerId, creditor: PlayerId): number {
    return this.balances[debtor]?.[creditor] ?? 0;
  }

  private set(debtor: PlayerId, creditor: PlayerId, amount: number): void {
    if (!this.balances[debtor]) this.balances[debtor] = {};
    this.balances[debtor][creditor] = Math.max(0, amount);
  }

  /**
   * Adds `amount` hands owed from debtor to creditor, netting against any
   * existing reverse debt (creditor owing debtor) first.
   */
  addDebt(debtor: PlayerId, creditor: PlayerId, amount: number): void {
    if (amount <= 0) return;
    const reverse = this.get(creditor, debtor);
    if (reverse > 0) {
      const netted = Math.min(reverse, amount);
      this.set(creditor, debtor, reverse - netted);
      const remainder = amount - netted;
      if (remainder > 0) {
        this.set(debtor, creditor, this.get(debtor, creditor) + remainder);
      }
    } else {
      this.set(debtor, creditor, this.get(debtor, creditor) + amount);
    }
  }

  /** Reduces debtor->creditor by `amount` (used when a settlement resolves one hand). */
  reduceDebt(debtor: PlayerId, creditor: PlayerId, amount: number): void {
    this.set(debtor, creditor, this.get(debtor, creditor) - amount);
  }

  /** All currently-owed debts (amount > 0), in a stable order for a given seat order. */
  allDebts(seatOrder: PlayerId[]): DebtEntry[] {
    const entries: DebtEntry[] = [];
    for (const debtor of seatOrder) {
      for (const creditor of seatOrder) {
        if (debtor === creditor) continue;
        const amount = this.get(debtor, creditor);
        if (amount > 0) entries.push({ debtor, creditor, amount });
      }
    }
    return entries;
  }

  /** A single player's total debt, summed across every creditor they owe. */
  totalOwedBy(debtor: PlayerId, seatOrder: PlayerId[]): number {
    return seatOrder.reduce((sum, creditor) => sum + this.get(debtor, creditor), 0);
  }

  /** Plain snapshot for sending over the wire, e.g. { A: { B: 2 }, C: { A: 1 } }. */
  snapshot(): Record<PlayerId, Record<PlayerId, number>> {
    const out: Record<PlayerId, Record<PlayerId, number>> = {};
    for (const debtor of Object.keys(this.balances)) {
      const nonZero: Record<PlayerId, number> = {};
      for (const [creditor, amount] of Object.entries(this.balances[debtor])) {
        if (amount > 0) nonZero[creditor] = amount;
      }
      if (Object.keys(nonZero).length > 0) out[debtor] = nonZero;
    }
    return out;
  }
}

/**
 * Computes how a round's tricks-won-vs-target differences translate into
 * hand snatches (spec section 20). Works for any number of players via a
 * standard greedy debt-simplification (largest surplus paired against
 * largest shortfall) — with exactly 3 players this always reduces to a
 * single, mathematically forced split (one side of the zero-sum has only
 * one player, whose amount necessarily matches the other side's total), so
 * there's no real ambiguity in practice, but the algorithm itself doesn't
 * assume exactly 3.
 */
export function computeSnatches(
  differences: Record<PlayerId, number>,
  seatOrder: PlayerId[]
): Snatch[] {
  const creditors = seatOrder
    .filter((p) => differences[p] > 0)
    .map((p) => ({ id: p, amount: differences[p] }));
  const debtors = seatOrder
    .filter((p) => differences[p] < 0)
    .map((p) => ({ id: p, amount: -differences[p] }));

  const snatches: Snatch[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0) {
      snatches.push({ debtor: debtors[di].id, creditor: creditors[ci].id, amount });
    }
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }
  return snatches;
}
